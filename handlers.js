const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage, proto } = require('@whiskeysockets/baileys');
const settings = require('./settings');
const store = require('./lib/store');
const commands = require('./lib/cmd');
const menu = require('./menu');
const { searchYoutube, downloadSong } = require('./lib/song');

const REVOKE_TYPE = proto?.Message?.ProtocolMessage?.Type?.REVOKE ?? 0;

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
const contactNameCache = new Map();
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
  const cached = contactNameCache.get(chatId);
  if (cached) return cached;
  const contact = sock?.contacts?.[chatId] || sock?.store?.contacts?.[chatId];
  const contactName = contact?.name || contact?.notify || contact?.verifiedName || contact?.shortName;
  if (contactName) { contactNameCache.set(chatId, String(contactName).trim()); return String(contactName).trim(); }
  return fallbackName || chatId.split('@')[0] || 'Private Chat';
}
function participantDisplayName(msg, sender) { return msg.pushName || msg.verifiedBizName || sender?.split('@')[0] || 'Unknown'; }
function cacheContactNames(contacts) {
  for (const contact of contacts || []) {
    const jid = contact?.id;
    const name = contact?.name || contact?.notify || contact?.verifiedName || contact?.shortName;
    if (jid && name) contactNameCache.set(jid, String(name).trim());
  }
}
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
function parseArgCommand(text, command) {
  const raw = String(text || '').trim();
  const base = String(command).trim();
  if (!raw.toLowerCase().startsWith(base.toLowerCase())) return null;
  const rest = raw.slice(base.length).trim();
  return rest;
}

async function commandPrefixArg(text, commandValue) {
  const raw = String(text || '').trim();
  const values = Array.isArray(commandValue) ? commandValue : [commandValue];
  for (const value of values) {
    const prefix = String(value || '').trim();
    if (!prefix) continue;
    if (raw.toLowerCase() === prefix.toLowerCase()) return '';
    if (raw.toLowerCase().startsWith(prefix.toLowerCase() + ' ')) {
      return raw.slice(prefix.length).trim();
    }
  }
  return null;
}

async function editOwnerSongStatus(sock, owner, sentMessage, text) {
  if (!owner || !sentMessage?.key?.id) return false;
  try {
    // Give WhatsApp a short moment to register the original message before
    // sending the edit. This also avoids relying on an undefined helper.
    await new Promise(resolve => setTimeout(resolve, 400));
    await sock.sendMessage(owner, { text, edit: sentMessage.key });
    return true;
  } catch (e) {
    console.error('[song] owner status edit failed:', e.message);
    return false;
  }
}

function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 'N/A';
  if (n < 1000) return String(Math.floor(n));

  const units = [
    { value: 1e12, suffix: 'tn' },
    { value: 1e9, suffix: 'bn' },
    { value: 1e6, suffix: 'm' },
    { value: 1e3, suffix: 'k' }
  ];

  const unit = units.find(u => n >= u.value) || units[units.length - 1];
  const short = n / unit.value;
  const digits = short >= 100 ? 0 : short >= 10 ? 1 : 2;
  return `${parseFloat(short.toFixed(digits))}${unit.suffix}`;
}

function formatSongDuration(result, video) {
  const rawSeconds = Number(result?.seconds || video?.seconds || 0);
  if (Number.isFinite(rawSeconds) && rawSeconds > 0) {
    const total = Math.floor(rawSeconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  }
  const timestamp = result?.duration || video?.duration;
  return timestamp || 'N/A';
}


async function handleSong(sock, msg, text) {
  const query = await commandPrefixArg(text, commands.song);
  if (query === null) return false;

  const destination = msg?.key?.remoteJid;
  const owner = ownerJid(sock);
  if (!destination || destination === 'status@broadcast' || !owner) return true;

  // Song requests are owner-only, but delivery is chat-local. The only
  // message sent to the destination chat is the actual audio file.
  // Progress/errors always stay in the owner's DM.
  if (!query) {
    await sock.sendMessage(owner, {
      text: withFooter(`⚠️ Usage: ${cmdLabel(commands.song)} <song name or YouTube URL>`)
    });
    return true;
  }

  let searchingMessage = null;
  try {
    // Send the searching message FIRST. It is always created in the owner's
    // DM, so the same message can be edited after the audio is delivered.
    searchingMessage = await sock.sendMessage(owner, {
      text: withFooter(`🔎 _Searching....._\n"*${query}*"`)
    });

    // Resolve the video after the searching message is visible.
    const video = await searchYoutube(query);
    if (!video) {
      await editOwnerSongStatus(sock, owner, searchingMessage, withFooter(`❌ No results found for "${query}".`));
      return true;
    }

    console.log(`[song] downloading for ${destination}: ${video.title}`);
    const result = await downloadSong(video);
    if (!result?.buffer?.length) throw new Error('No playable audio data returned');

    const safeTitle = String(result.title || video.title || 'song')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/[\u0000-\u001f]/g, '')
      .trim()
      .slice(0, 120) || 'song';

    // Deliberately no caption, status text, or reaction is sent to the
    // recipient chat. It receives the music file only.
    // mimetype audio/mpeg + ptt:false makes WhatsApp render this as a
    // normal playable audio-file message, not a voice-note bubble (that
    // round waveform UI is tied to the audio/ogg;codecs=opus codec itself,
    // not just the ptt flag).
    await sock.sendMessage(destination, {
      audio: result.buffer,
      mimetype: 'audio/mpeg',
      fileName: `${safeTitle}.mp3`,
      ptt: false
    });

    const foundTitle = String(result.title || video.title || query).trim();
    const duration = formatSongDuration(result, video);
    const views = formatCount(result.views ?? video.views);
    const likes = formatCount(result.likes ?? video.likes);
    await editOwnerSongStatus(sock, owner, searchingMessage,
      `🎵 *Song Found:*\n ${foundTitle}\n\n⏱️ Duration: ${duration} — ▶️ Views: ${views}`);

    console.log(`[song] sent "${result.title}" to ${destination} via ${result.source}`);
  } catch (e) {
    console.error('[song] download/conversion failed:', e?.stack || e?.message || e);

    // Never expose downloader/conversion errors in the recipient's chat.
    const errorText = `❌ Failed to download a playable version of the song.\n\n${e?.message || 'All download sources failed.'}`;
    if (searchingMessage) {
      await editOwnerSongStatus(sock, owner, searchingMessage, withFooter(errorText));
    } else {
      await sock.sendMessage(owner, { text: withFooter(errorText) });
    }
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
  const resetDelete = commandMatches(text, commands.resetAntiDelete);

  if (!isMenu && !isHelp && !isProfile && !isStory && !isViewOnce && !isClear && !isOwner && antiDeleteArg === null && !resetDelete) return false;

  if (isMenu) { await sock.sendMessage(owner, { image: { url: 'https://files.catbox.moe/6629iv.jpg' }, caption: menu.getMenuText() }); return true; }
  if (isHelp) { await sock.sendMessage(owner, { text: menu.getHelpText() }); return true; }
  if (isOwner) { await sock.sendMessage(owner, { image: { url: 'https://files.catbox.moe/2qklbv.jpg' }, caption: `This is a Privacy Focused *Special Script Bot*. Built with Node.js and Baileys, using a direct WhatsApp Web socket connection.\n\nDeveloped by *©Ahsan Habib Muaz*.\n\nContact : +966500896152\n\nChannel:\nhttps://whatsapp.com/channel/0029VaqXjE9LSmbZG7l1im1o\n\n> Made with ❤️ from Bangladesh.` }); return true; }


  if (resetDelete) {
    if (!chatId.endsWith('@g.us')) { store.resetFeature('antiDelete'); await sock.sendMessage(owner, { text: '✅ Anti-Delete group/person settings have been reset.' }); }
    return true;
  }
  if (antiDeleteArg !== null) {
    const v = antiDeleteArg.toLowerCase();
    if (!['on', 'off'].includes(v)) { await sock.sendMessage(owner, { text: `⚠️ Usage: ${cmdLabel(commands.antiDelete)} <on/off>` }); return true; }
    const key = store.setFeature('antiDelete', chatId, msg.key.participant || chatId, v === 'on');
    await sock.sendMessage(owner, { text: `🛡️ Anti-Delete is now *${v.toUpperCase()}*\nScope: *${key.startsWith('group:') ? 'This group' : 'This person/chat'}*.` });
    return true;
  }

  if (isClear) {
    const result = store.clearAll();
    const s = result.session;
    const totalRemoved = result.tmp.total + s.removed;
    await sock.sendMessage(owner, {
      text: `✅️ Temp files cleared!\n\n`
        + `📊 Statistics:\n`
        + `• Media cache : ${result.tmp.total}\n`
        + `• App state sync files: ${s.appState}\n`
        + `• Pre-key files: ${s.preKeys}\n`
        + `• Sender-key files: ${s.senderKeys}\n`
        + `• Other files: ${s.other}\n`
        + `= Total files removed: ${totalRemoved}\n\n`
        + `🔐 \`creds.json\` preserved.\n\n`
        + `© Powered by Muaz.`
    });
    return true;
  }
  if (isViewOnce) {
    const quoted = getQuotedMessage(msg), vo = getViewOnceContainer(quoted);
    if (!vo) { await sock.sendMessage(owner, { text: withFooter(`❌ ${cmdLabel(commands.viewOnce)} must reply to a view-once photo/video.`) }); return true; }
    const ctx = msg.message?.extendedTextMessage?.contextInfo, sender = ctx?.participant || chatId;
    const success = await forwardViewOnce(sock, vo, { sender, senderName: msg.pushName || sender.split('@')[0], chatId, chatName: await resolveChatName(sock, chatId) });
    if (success) return true;
  }
  if (isProfile) {
    const target = extractTargetJid(msg);
    if (!target) { await sock.sendMessage(owner, { text: withFooter(`⚠️ ${cmdLabel(commands.profilePicture)} requires a reply or mention.`) }); return true; }
    try { const ppUrl = await sock.profilePictureUrl(target, 'image'); await sock.sendMessage(owner, { image: { url: ppUrl }, caption: withFooter(`🖼️ *Profile Picture*\n\n*User:* @${target.split('@')[0]}\n*Time:* ${fmtTime(Date.now())}`), mentions: [target] }); }
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


module.exports = { handleIncoming, handleStatusEvent, cacheContactNames };
