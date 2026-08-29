const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { downloadContentFromMessage, proto } = require('@whiskeysockets/baileys');
const settings = require('./settings');
const store = require('./lib/store');
const commands = require('./lib/cmd');
const menu = require('./menu');
const youtubedl = require('youtube-dl-exec');

const execFileAsync = promisify(execFile);
const REVOKE_TYPE = proto?.Message?.ProtocolMessage?.Type?.REVOKE ?? 0;
const EDIT_TYPE = 14; // Baileys ProtocolMessage editedMessage type.

function ownerJid(sock) {
  try {
    const rawId = sock?.user?.id;
    if (rawId) {
      const num = rawId.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
      if (num) return num + '@s.whatsapp.net';
    }
  } catch (_) {}
  return settings.ownerNumber ? settings.ownerNumber.replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null;
}
function withFooter(text) { return (text || '') + settings.footer; }
async function downloadToBuffer(mediaMsg, type) {
  const stream = await downloadContentFromMessage(mediaMsg, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
async function saveMediaToTmp(buffer, ext) {
  const filePath = path.join(store.TMP_DIR, `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
function fmtTime(ts) {
  return new Date(ts || Date.now()).toLocaleString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function unwrapMessage(message) {
  let m = message || {};
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  return m;
}
function getViewOnceContainer(message) {
  let m = unwrapMessage(message);
  const wrapped = m.viewOnceMessageV2?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2Extension?.message || m.viewOnceMessageV2Extension || null;
  if (wrapped) return unwrapMessage(wrapped);
  if (m.imageMessage?.viewOnce === true) return { imageMessage: m.imageMessage };
  if (m.videoMessage?.viewOnce === true) return { videoMessage: m.videoMessage };
  return null;
}
function getQuotedMessage(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo || msg.message?.imageMessage?.contextInfo || msg.message?.videoMessage?.contextInfo || msg.message?.documentMessage?.contextInfo;
  return ctx?.quotedMessage || null;
}
function extractTargetJid(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
  if (ctx?.participant) return ctx.participant;
  return null;
}
const groupNameCache = new Map();
async function resolveChatName(sock, chatId, fallbackName) {
  if (!chatId) return 'Unknown chat';
  if (chatId.endsWith('@g.us')) {
    const cached = groupNameCache.get(chatId);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) return cached.name;
    try {
      const metadata = await sock.groupMetadata(chatId);
      const name = metadata?.subject || 'WhatsApp Group';
      groupNameCache.set(chatId, { name, timestamp: Date.now() });
      return name;
    } catch (_) { return fallbackName || 'WhatsApp Group'; }
  }
  return fallbackName || 'Private Chat';
}
function participantDisplayName(msg, sender) { return msg.pushName || msg.verifiedBizName || sender?.split('@')[0] || 'Unknown'; }
function getMessageText(msg) { return msg.message?.conversation?.trim() || msg.message?.extendedTextMessage?.text?.trim() || ''; }

async function storeAndCheckViewOnce(sock, msg) {
  const chatId = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const id = msg.key.id;
  if (!id) return;
  const chatName = await resolveChatName(sock, chatId, sender === chatId ? msg.pushName : undefined);
  const senderName = participantDisplayName(msg, sender);
  let text = '', mediaType = null, mediaPath = null;
  const m = unwrapMessage(msg.message);
  try {
    const voContainer = getViewOnceContainer(m);
    if (voContainer?.imageMessage) { mediaType = 'image'; text = voContainer.imageMessage.caption || ''; }
    else if (voContainer?.videoMessage) { mediaType = 'video'; text = voContainer.videoMessage.caption || ''; }
    else if (m.conversation) text = m.conversation;
    else if (m.extendedTextMessage?.text) text = m.extendedTextMessage.text;
    else if (m.imageMessage) { mediaType = 'image'; text = m.imageMessage.caption || ''; mediaPath = await saveMediaToTmp(await downloadToBuffer(m.imageMessage, 'image'), 'jpg'); }
    else if (m.videoMessage) { mediaType = 'video'; text = m.videoMessage.caption || ''; mediaPath = await saveMediaToTmp(await downloadToBuffer(m.videoMessage, 'video'), 'mp4'); }
    else if (m.stickerMessage) { mediaType = 'sticker'; mediaPath = await saveMediaToTmp(await downloadToBuffer(m.stickerMessage, 'sticker'), 'webp'); }
    else if (m.audioMessage) { mediaType = 'audio'; mediaPath = await saveMediaToTmp(await downloadToBuffer(m.audioMessage, 'audio'), 'mp3'); }
  } catch (e) { console.error('[store] media download error:', e.message); }
  store.addMessage(id, { chatId, chatName, sender, senderName, timestamp: Date.now(), text, mediaType, mediaPath });
}

async function forwardViewOnce(sock, voContainer, info) {
  const owner = ownerJid(sock); if (!owner) return false;
  try {
    const header = `👁️ *View-Once Media Captured*\n\n*From:* ${info.senderName || 'Unknown'} (@${info.sender.split('@')[0]})\n*Chat:* ${info.chatName || 'Unknown chat'}\n*Time:* ${fmtTime(Date.now())}`;
    const caption = withFooter(header);
    if (voContainer.imageMessage) { await sock.sendMessage(owner, { image: await downloadToBuffer(voContainer.imageMessage, 'image'), caption, mentions: [info.sender] }); return true; }
    if (voContainer.videoMessage) { await sock.sendMessage(owner, { video: await downloadToBuffer(voContainer.videoMessage, 'video'), caption, mentions: [info.sender] }); return true; }
  } catch (e) { console.error('[viewonce] forward error:', e.message); }
  return false;
}

async function handleRevocation(sock, msg) {
  const revokedId = msg.message?.protocolMessage?.key?.id;
  if (!revokedId || msg.key.fromMe) return;
  const original = store.getMessage(revokedId);
  if (!original) return;
  const enabled = store.getFeature('antiDelete', original.chatId, original.sender, settings.antideleteEnabled);
  if (!enabled) { store.deleteMessage(revokedId); return; }
  const owner = ownerJid(sock); if (!owner) return;
  try {
    const senderLabel = original.senderName ? `${original.senderName} (@${original.sender.split('@')[0]})` : `@${original.sender.split('@')[0]}`;
    const chatLabel = original.chatName || 'Unknown chat';
    let body = `🗑️ *Deleted Message Recovered*\n\n*Sender:* ${senderLabel}\n*Chat:* ${chatLabel}\n*Time:* ${fmtTime(original.timestamp)}`;
    if (original.text) body += `\n\n*Message:*\n${original.text}`;
    const caption = withFooter(body);
    if (original.mediaPath && fs.existsSync(original.mediaPath)) {
      if (original.mediaType === 'image') await sock.sendMessage(owner, { image: { url: original.mediaPath }, caption, mentions: [original.sender] });
      else if (original.mediaType === 'video') await sock.sendMessage(owner, { video: { url: original.mediaPath }, caption, mentions: [original.sender] });
      else if (original.mediaType === 'sticker') { await sock.sendMessage(owner, { sticker: { url: original.mediaPath }, mentions: [original.sender] }); await sock.sendMessage(owner, { text: caption, mentions: [original.sender] }); }
      else if (original.mediaType === 'audio') { await sock.sendMessage(owner, { audio: { url: original.mediaPath }, mimetype: 'audio/mpeg', mentions: [original.sender] }); await sock.sendMessage(owner, { text: caption, mentions: [original.sender] }); }
      else await sock.sendMessage(owner, { text: caption, mentions: [original.sender] });
    } else await sock.sendMessage(owner, { text: caption, mentions: [original.sender] });
    store.deleteMessage(revokedId);
  } catch (e) { console.error('[antidelete] error:', e.message); }
}

function extractEditedMessage(update) {
  const pm = update?.update?.message?.protocolMessage || update?.message?.protocolMessage || update?.protocolMessage;
  if (!pm || pm.type !== EDIT_TYPE || !pm.key?.id || !pm.editedMessage) return null;
  return { key: pm.key, message: unwrapMessage(pm.editedMessage), timestamp: update.update?.messageTimestamp || Date.now() };
}
async function handleEditedUpdate(sock, item) {
  const edited = extractEditedMessage(item);
  if (!edited) return false;
  const old = store.getMessage(edited.key.id);
  if (!old) return true;
  const enabled = store.getFeature('antiEdit', old.chatId, old.sender, settings.antieditEnabled);
  if (!enabled) return true;
  const owner = ownerJid(sock); if (!owner) return true;
  const newText = edited.message?.conversation?.trim() || edited.message?.extendedTextMessage?.text?.trim() || edited.message?.imageMessage?.caption?.trim() || edited.message?.videoMessage?.caption?.trim() || '[edited media/message]';
  const oldText = old.text || '[media/message]';
  if (oldText === newText) return true;
  const senderLabel = old.senderName ? `${old.senderName} (@${old.sender.split('@')[0]})` : `@${old.sender.split('@')[0]}`;
  const text = `✏️ *Edited Message Recovered*\n\n*Sender:* ${senderLabel}\n*Chat:* ${old.chatName || 'Unknown chat'}\n*Time:* ${fmtTime(Date.now())}\n\n*Old message:*\n${oldText}\n\n*New message:*\n${newText}`;
  await sock.sendMessage(owner, { text: withFooter(text), mentions: [old.sender] });
  // Keep the newest version so a second edit recovers the immediately previous version.
  old.text = newText; old.timestamp = Date.now();
  store.addMessage(edited.key.id, old);
  return true;
}

async function captureStatusMessage(sock, statusMsg) {
  if (!settings.autoStatusCapture || statusMsg.key?.remoteJid !== 'status@broadcast') return;
  try {
    const sender = statusMsg.key.participant || statusMsg.participant; if (!sender) return;
    const m = unwrapMessage(statusMsg.message); let mediaType = null, mediaPath = null, caption = '';
    if (m.imageMessage) { mediaType = 'image'; caption = m.imageMessage.caption || ''; mediaPath = await saveMediaToTmp(await downloadToBuffer(m.imageMessage, 'image'), 'jpg'); }
    else if (m.videoMessage) { mediaType = 'video'; caption = m.videoMessage.caption || ''; mediaPath = await saveMediaToTmp(await downloadToBuffer(m.videoMessage, 'video'), 'mp4'); }
    else if (m.extendedTextMessage?.text || m.conversation) { mediaType = 'text'; caption = m.extendedTextMessage?.text || m.conversation; }
    else return;
    store.setStatus(sender, { mediaType, mediaPath, caption, timestamp: Date.now() });
  } catch (e) { console.error('[status] capture error:', e.message); }
}
async function handleStatusEvent(sock, status) {
  if (status?.messages?.length) for (const m of status.messages) if (m.key?.remoteJid === 'status@broadcast') await captureStatusMessage(sock, m);
  else if (status?.key?.remoteJid === 'status@broadcast') await captureStatusMessage(sock, status);
}

function commandMatches(text, commandValue) {
  const input = String(text || '').trim().toLowerCase();
  const values = Array.isArray(commandValue) ? commandValue : [commandValue];
  return values.some(v => String(v || '').trim().toLowerCase() === input);
}
function cmdLabel(value) { return Array.isArray(value) ? value[0] : value; }
async function reactToCommand(sock, msg, emoji = settings.commandReaction) {
  if (!emoji) return;
  try { await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } }); } catch (e) { console.error('[cmd] reaction failed:', e.message); }
}
function parseArgCommand(text, command) {
  const raw = String(text || '').trim();
  const base = String(command).trim();
  if (!raw.toLowerCase().startsWith(base.toLowerCase())) return null;
  const rest = raw.slice(base.length).trim();
  return rest;
}

async function downloadSong(query) {
  const prefix = `song_${Date.now()}_${Math.random().toString(36).slice(2)}_`;
  const out = path.join(store.TMP_DIR, `${prefix}%(id)s.%(ext)s`);
  await youtubedl(`ytsearch1:${query}`, {
    noPlaylist: true,
    noWarnings: true,
    quiet: true,
    format: 'bestaudio[ext=m4a]/bestaudio',
    output: out,
    maxFilesize: settings.maxSongFileBytes
  }, { timeout: 180000, maxBuffer: 1024 * 1024 * 4 });
  const files = fs.readdirSync(store.TMP_DIR).filter(n => n.startsWith(prefix));
  if (!files.length) throw new Error('yt-dlp did not create an audio file');
  const file = files.sort().pop();
  return path.join(store.TMP_DIR, file);
}

async function handleSong(sock, msg, text) {
  const songCmd = parseArgCommand(text, cmdLabel(commands.song));
  const emojiCmd = String(text || '').trim().startsWith('🎵') ? String(text).trim().slice('🎵'.length).trim() : null;
  const query = emojiCmd !== null ? emojiCmd : songCmd;
  if (query === null) return false;
  const chatId = msg.key.remoteJid;
  if (!query) { await reactToCommand(sock, msg, settings.songFailureReaction); return true; }
  try {
    console.log(`[song] searching YouTube: ${query}`);
    const audioPath = await downloadSong(query);
    const ext = path.extname(audioPath).toLowerCase();
    const mimetype = ext === '.m4a' ? 'audio/mp4' : ext === '.opus' ? 'audio/ogg; codecs=opus' : 'audio/webm';
    await sock.sendMessage(chatId, { audio: { url: audioPath }, mimetype, ptt: false });
    store.safeUnlink(audioPath);
    await reactToCommand(sock, msg, settings.songSuccessReaction);
  } catch (e) {
    console.error('[song] download failed:', e.message);
    await reactToCommand(sock, msg, settings.songFailureReaction);
  }
  return true;
}

async function handleCommand(sock, msg, text) {
  const owner = ownerJid(sock); const chatId = msg.key.remoteJid;
  if (!owner) return true;
  if (await handleSong(sock, msg, text)) return true;

  const isMenu = commandMatches(text, commands.menu);
  const isHelp = commandMatches(text, commands.help);
  const isProfile = commandMatches(text, commands.profilePicture);
  const isStory = commandMatches(text, commands.story);
  const isViewOnce = commandMatches(text, commands.viewOnce);
  const isClear = commandMatches(text, commands.clear);
  const isOwner = commandMatches(text, commands.owner);
  const antiDeleteArg = parseArgCommand(text, commands.antiDelete);
  const antiEditArg = parseArgCommand(text, commands.antiEdit);
  const resetDelete = commandMatches(text, commands.resetAntiDelete);
  const resetEdit = commandMatches(text, commands.resetAntiEdit);

  if (!isMenu && !isHelp && !isProfile && !isStory && !isViewOnce && !isClear && !isOwner && antiDeleteArg === null && antiEditArg === null && !resetDelete && !resetEdit) return false;

  if (isMenu) { await sock.sendMessage(owner, { image: { url: 'https://files.catbox.moe/6629iv.jpg' }, caption: menu.getMenuText() }); await reactToCommand(sock, msg); return true; }
  if (isHelp) { await sock.sendMessage(owner, { text: menu.getHelpText() }); await reactToCommand(sock, msg); return true; }
  if (isOwner) { await sock.sendMessage(owner, { image: { url: 'https://files.catbox.moe/2qklbv.jpg' }, caption: `This is a Privacy Focused *Special Script Bot*. Built with Node.js and Baileys, using a direct WhatsApp Web socket connection.\n\nDeveloped by *©Ahsan Habib Muaz*.\n\nContact : +966500896152\n\nChannel:\nhttps://whatsapp.com/channel/0029VaqXjE9LSmbZG7l1im1o\n\n> Made with ❤️ from Bangladesh.` }); await reactToCommand(sock, msg); return true; }


  if (resetDelete) {
    if (!chatId.endsWith('@g.us')) { store.resetFeature('antiDelete'); await sock.sendMessage(owner, { text: '✅ Anti-Delete group/person settings have been reset.' }); }
    return true;
  }
  if (resetEdit) {
    if (!chatId.endsWith('@g.us')) { store.resetFeature('antiEdit'); await sock.sendMessage(owner, { text: '✅ Anti-Edit group/person settings have been reset.' }); }
    return true;
  }
  if (antiDeleteArg !== null) {
    const v = antiDeleteArg.toLowerCase();
    if (!['on', 'off'].includes(v)) { await sock.sendMessage(owner, { text: `⚠️ Usage: ${cmdLabel(commands.antiDelete)} <on/off>` }); return true; }
    const key = store.setFeature('antiDelete', chatId, msg.key.participant || chatId, v === 'on');
    await sock.sendMessage(owner, { text: `🛡️ Anti-Delete is now *${v.toUpperCase()}*\nScope: *${key.startsWith('group:') ? 'This group' : 'This person/chat'}*.` });
    return true;
  }
  if (antiEditArg !== null) {
    const v = antiEditArg.toLowerCase();
    if (!['on', 'off'].includes(v)) { await sock.sendMessage(owner, { text: `⚠️ Usage: ${cmdLabel(commands.antiEdit)} <on/off>` }); return true; }
    const key = store.setFeature('antiEdit', chatId, msg.key.participant || chatId, v === 'on');
    await sock.sendMessage(owner, { text: `✏️ Anti-Edit is now *${v.toUpperCase()}*\nScope: *${key.startsWith('group:') ? 'This group' : 'This person/chat'}*.` });
    return true;
  }

  if (isClear) {
    const result = store.clearAll();
    await sock.sendMessage(owner, { text: `✅ Temp files cleared!\n\n📊 Statistics:\n• Total files cleared: ${result.total}\n• App state sync files: ${result.appState}\n• Logs files: ${result.logs}\n• Pre-key files: ${result.preKeys}\n\n© Powered by *Muaz*.` });
    await reactToCommand(sock, msg); return true;
  }
  if (isViewOnce) {
    const quoted = getQuotedMessage(msg), vo = getViewOnceContainer(quoted);
    if (!vo) { await sock.sendMessage(owner, { text: withFooter(`❌ ${cmdLabel(commands.viewOnce)} must reply to a view-once photo/video.`) }); return true; }
    const ctx = msg.message?.extendedTextMessage?.contextInfo, sender = ctx?.participant || chatId;
    const success = await forwardViewOnce(sock, vo, { sender, senderName: msg.pushName || sender.split('@')[0], chatId, chatName: await resolveChatName(sock, chatId) });
    if (success) await reactToCommand(sock, msg); return true;
  }
  if (isProfile) {
    const target = extractTargetJid(msg);
    if (!target) { await sock.sendMessage(owner, { text: withFooter(`⚠️ ${cmdLabel(commands.profilePicture)} requires a reply or mention.`) }); return true; }
    try { const ppUrl = await sock.profilePictureUrl(target, 'image'); await sock.sendMessage(owner, { image: { url: ppUrl }, caption: withFooter(`🖼️ *Profile Picture*\n\n*User:* @${target.split('@')[0]}\n*Time:* ${fmtTime(Date.now())}`), mentions: [target] }); await reactToCommand(sock, msg); }
    catch (_) { await sock.sendMessage(owner, { text: withFooter(`❌ Could not fetch profile picture for @${target.split('@')[0]}.`), mentions: [target] }); }
    return true;
  }
  if (isStory) {
    const target = extractTargetJid(msg);
    if (!target) { await sock.sendMessage(owner, { text: withFooter(`⚠️ ${cmdLabel(commands.story)} requires a reply to someone.`) }); return true; }
    const status = store.getStatus(target);
    if (!status) { await sock.sendMessage(owner, { text: withFooter(`❌ No recent story captured for @${target.split('@')[0]}.`), mentions: [target] }); return true; }
    try {
      const caption = withFooter(`📥 *Story Captured*\n\n*User:* @${target.split('@')[0]}\n*Time:* ${fmtTime(status.timestamp)}\n\n${status.caption || ''}`);
      if (status.mediaPath && fs.existsSync(status.mediaPath)) {
        if (status.mediaType === 'image') await sock.sendMessage(owner, { image: { url: status.mediaPath }, caption, mentions: [target] });
        else if (status.mediaType === 'video') await sock.sendMessage(owner, { video: { url: status.mediaPath }, caption, mentions: [target] });
        else await sock.sendMessage(owner, { text: caption, mentions: [target] });
      } else await sock.sendMessage(owner, { text: caption, mentions: [target] });
      await reactToCommand(sock, msg);
    } catch (_) { await sock.sendMessage(owner, { text: withFooter('❌ Failed to forward story.') }); }
    return true;
  }
  return false;
}

async function handleIncoming(sock, upsert) {
  const { messages, type } = upsert;
  if (type !== 'notify') return;
  for (const msg of messages || []) {
    try {
      if (!msg?.message) continue;
      msg.message = unwrapMessage(msg.message);
      if (msg.message?.protocolMessage?.type === REVOKE_TYPE) { await handleRevocation(sock, msg); continue; }
      if (msg.key?.remoteJid === 'status@broadcast') { await captureStatusMessage(sock, msg); continue; }
      if (msg.key.fromMe) {
        const text = getMessageText(msg);
        if (text && await handleCommand(sock, msg, text)) continue;
      }
      await storeAndCheckViewOnce(sock, msg);
    } catch (e) { console.error('[incoming] message handling error:', e.message); }
  }
}

async function handleMessageUpdate(sock, updates) {
  for (const item of updates || []) {
    try { await handleEditedUpdate(sock, item); } catch (e) { console.error('[antiedit] update error:', e.message); }
  }
}

module.exports = { handleIncoming, handleStatusEvent, handleMessageUpdate };
