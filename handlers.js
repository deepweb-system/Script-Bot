const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage, proto } = require('@whiskeysockets/baileys');
const settings = require('./settings');
const store = require('./lib/store');
const commands = require('./lib/cmd');

const REVOKE_TYPE = proto?.Message?.ProtocolMessage?.Type?.REVOKE ?? 0;

function ownerJid(sock) {
  try {
    const rawId = sock?.user?.id;
    if (rawId) {
      const num = rawId.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
      if (num) return num + '@s.whatsapp.net';
    }
  } catch (_) {}
  return settings.ownerNumber
    ? settings.ownerNumber.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
    : null;
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
  return new Date(ts || Date.now()).toLocaleString('en-US', {
    hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit',
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function unwrapMessage(message) {
  let m = message || {};
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  return m;
}

function getViewOnceContainer(message) {
  let m = unwrapMessage(message);
  const wrapped =
    m.viewOnceMessageV2?.message ||
    m.viewOnceMessage?.message ||
    m.viewOnceMessageV2Extension?.message ||
    m.viewOnceMessageV2Extension || null;
  if (wrapped) return unwrapMessage(wrapped);
  if (m.imageMessage?.viewOnce === true) return { imageMessage: m.imageMessage };
  if (m.videoMessage?.viewOnce === true) return { videoMessage: m.videoMessage };
  return null;
}

function getQuotedMessage(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo ||
    msg.message?.imageMessage?.contextInfo ||
    msg.message?.videoMessage?.contextInfo ||
    msg.message?.documentMessage?.contextInfo;
  return ctx?.quotedMessage || null;
}

function extractTargetJid(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (ctx?.mentionedJid?.length > 0) return ctx.mentionedJid[0];
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
    } catch (e) {
      console.error(`[chat-name] groupMetadata failed for ${chatId}: ${e.message}`);
      return fallbackName || 'WhatsApp Group';
    }
  }
  return fallbackName || 'Private Chat';
}

function participantDisplayName(msg, sender) {
  return msg.pushName || msg.verifiedBizName || sender?.split('@')[0] || 'Unknown';
}

async function storeAndCheckViewOnce(sock, msg) {
  const chatId = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  const id = msg.key.id;
  if (!id) return;

  const chatName = await resolveChatName(sock, chatId, sender === chatId ? msg.pushName : undefined);
  const senderName = participantDisplayName(msg, sender);
  let text = '';
  let mediaType = null;
  let mediaPath = null;
  const m = unwrapMessage(msg.message);

  try {
    const voContainer = getViewOnceContainer(m);
    if (voContainer) {
      console.log(`[viewonce] detected from ${sender} in ${chatName}`);
      if (voContainer.imageMessage) {
        mediaType = 'image';
        text = voContainer.imageMessage.caption || '';
      } else if (voContainer.videoMessage) {
        mediaType = 'video';
        text = voContainer.videoMessage.caption || '';
      }
    } else if (m.conversation) {
      text = m.conversation;
    } else if (m.extendedTextMessage?.text) {
      text = m.extendedTextMessage.text;
    } else if (m.imageMessage) {
      mediaType = 'image'; text = m.imageMessage.caption || '';
      const buf = await downloadToBuffer(m.imageMessage, 'image');
      mediaPath = await saveMediaToTmp(buf, 'jpg');
    } else if (m.videoMessage) {
      mediaType = 'video'; text = m.videoMessage.caption || '';
      const buf = await downloadToBuffer(m.videoMessage, 'video');
      mediaPath = await saveMediaToTmp(buf, 'mp4');
    } else if (m.stickerMessage) {
      mediaType = 'sticker';
      const buf = await downloadToBuffer(m.stickerMessage, 'sticker');
      mediaPath = await saveMediaToTmp(buf, 'webp');
    } else if (m.audioMessage) {
      mediaType = 'audio';
      const buf = await downloadToBuffer(m.audioMessage, 'audio');
      mediaPath = await saveMediaToTmp(buf, 'mp3');
    }
  } catch (e) { console.error('[store] media download error:', e.message); }

  store.addMessage(id, { chatId, chatName, sender, senderName, timestamp: Date.now(), text, mediaType, mediaPath });
}

async function forwardViewOnce(sock, voContainer, info) {
  const owner = ownerJid(sock);
  if (!owner) { console.error('[viewonce] could not resolve owner JID'); return false; }
  try {
    const header = `👁️ *View-Once Media Captured*\n\n` +
      `*From:* ${info.senderName || 'Unknown'} (@${info.sender.split('@')[0]})\n` +
      `*Chat:* ${info.chatName || 'Unknown chat'}\n` +
      `*Time:* ${fmtTime(Date.now())}`;
    const caption = withFooter(header);

    if (voContainer.imageMessage) {
      const buf = await downloadToBuffer(voContainer.imageMessage, 'image');
      await sock.sendMessage(owner, { image: buf, caption, mentions: [info.sender] });
      console.log(`[viewonce] image forwarded from ${info.chatName}`);
      return true;
    }
    if (voContainer.videoMessage) {
      const buf = await downloadToBuffer(voContainer.videoMessage, 'video');
      await sock.sendMessage(owner, { video: buf, caption, mentions: [info.sender] });
      console.log(`[viewonce] video forwarded from ${info.chatName}`);
      return true;
    }
    console.error('[viewonce] wrapper found but no image/video was inside it');
  } catch (e) { console.error('[viewonce] forward error:', e.message); }
  return false;
}

async function handleQuotedViewOnceCommand(sock, msg) {
  const owner = ownerJid(sock);
  if (!owner) return true;
  const quoted = getQuotedMessage(msg);
  const voContainer = getViewOnceContainer(quoted);
  if (!voContainer) {
    await sock.sendMessage(owner, { text: withFooter('❌ The replied message is not a view-once photo/video.') });
    return true;
  }
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const sender = ctx?.participant || msg.key.remoteJid;
  const chatId = msg.key.remoteJid;
  const chatName = await resolveChatName(sock, chatId);
  await forwardViewOnce(sock, voContainer, {
    sender,
    senderName: msg.pushName || sender.split('@')[0],
    chatId,
    chatName
  });
  return true;
}

async function handleRevocation(sock, msg) {
  if (!settings.antideleteEnabled) return;
  const owner = ownerJid(sock);
  if (!owner) return;
  try {
    const revokedId = msg.message.protocolMessage.key.id;
    if (msg.key.fromMe) { console.log('[antidelete] skipped — you deleted your own message'); return; }
    const original = store.getMessage(revokedId);
    if (!original) { console.log('[antidelete] no cached copy found'); return; }

    const senderLabel = original.senderName
      ? `${original.senderName} (@${original.sender.split('@')[0]})`
      : `@${original.sender.split('@')[0]}`;
    const chatLabel = original.chatName || (original.chatId?.endsWith('@g.us') ? 'WhatsApp Group' : 'Private Chat');
    let bodyText = `🗑️ *Deleted Message Recovered*\n\n` +
      `*Sender:* ${senderLabel}\n` + `*Chat:* ${chatLabel}\n` + `*Time:* ${fmtTime(original.timestamp)}`;
    if (original.text) bodyText += `\n\n*Message:*\n${original.text}`;
    const caption = withFooter(bodyText);

    if (original.mediaPath && fs.existsSync(original.mediaPath)) {
      switch (original.mediaType) {
        case 'image': await sock.sendMessage(owner, { image: { url: original.mediaPath }, caption, mentions: [original.sender] }); break;
        case 'video': await sock.sendMessage(owner, { video: { url: original.mediaPath }, caption, mentions: [original.sender] }); break;
        case 'sticker':
          await sock.sendMessage(owner, { sticker: { url: original.mediaPath }, mentions: [original.sender] });
          await sock.sendMessage(owner, { text: caption, mentions: [original.sender] }); break;
        case 'audio':
          await sock.sendMessage(owner, { audio: { url: original.mediaPath }, mimetype: 'audio/mpeg', mentions: [original.sender] });
          await sock.sendMessage(owner, { text: caption, mentions: [original.sender] }); break;
        default: await sock.sendMessage(owner, { text: caption, mentions: [original.sender] });
      }
    } else await sock.sendMessage(owner, { text: caption, mentions: [original.sender] });

    store.deleteMessage(revokedId);
    console.log(`[antidelete] forwarded from chat: ${chatLabel}`);
  } catch (e) { console.error('[antidelete] error:', e.message); }
}

async function captureStatusMessage(sock, statusMsg) {
  if (!settings.autoStatusCapture) return;
  try {
    if (statusMsg.key?.remoteJid !== 'status@broadcast') return;
    const sender = statusMsg.key.participant || statusMsg.participant;
    if (!sender) return;
    const m = unwrapMessage(statusMsg.message);
    let mediaType = null, mediaPath = null, caption = '';
    if (m.imageMessage) {
      mediaType = 'image'; caption = m.imageMessage.caption || '';
      mediaPath = await saveMediaToTmp(await downloadToBuffer(m.imageMessage, 'image'), 'jpg');
    } else if (m.videoMessage) {
      mediaType = 'video'; caption = m.videoMessage.caption || '';
      mediaPath = await saveMediaToTmp(await downloadToBuffer(m.videoMessage, 'video'), 'mp4');
    } else if (m.extendedTextMessage?.text || m.conversation) {
      mediaType = 'text'; caption = m.extendedTextMessage?.text || m.conversation;
    } else return;
    store.setStatus(sender, { mediaType, mediaPath, caption, timestamp: Date.now() });
  } catch (e) { console.error('[status] capture error:', e.message); }
}

async function handleStatusEvent(sock, status) {
  if (status?.messages?.length) {
    for (const m of status.messages) if (m.key?.remoteJid === 'status@broadcast') await captureStatusMessage(sock, m);
  } else if (status?.key?.remoteJid === 'status@broadcast') await captureStatusMessage(sock, status);
}

function commandMatches(text, commandValue) {
  const input = String(text || '').trim().toLowerCase();
  const values = Array.isArray(commandValue) ? commandValue : [commandValue];
  return values.some(value => String(value || '').trim().toLowerCase() === input);
}

// cmd.js values can be a plain string or an array of aliases — always display the first one
function cmdLabel(value) {
  return Array.isArray(value) ? value[0] : value;
}

const MENU_TEXT = () => {
  const menuCmd = cmdLabel(commands.menu);
  const okCmd = cmdLabel(commands.profilePicture);
  const hmmCmd = cmdLabel(commands.story);
  const wowCmd = cmdLabel(commands.viewOnce);
  const clearCmd = cmdLabel(commands.clear);
  const ownerCmd = cmdLabel(commands.owner);

  return `═════      *${settings.commandReaction || '🍭'} ${settings.botName}*     ════
_A private WhatsApp mini bot made for self security and safety purposes; with totally anonymous commands that will triggered useful info._
════════════════════

  •── Available Commands ──•

╔═══════ ≪ 👾 ≫ ═══════╗
║ 📃 ➤ *${menuCmd}*    (show menu)
║ 🖼 ➤ *${okCmd}* ㅤ    <reply / @tag>
║ 📥 ➤ *${hmmCmd}*    <reply to story>
║ 📸 ➤ *${wowCmd}*       <reply to v.once>
║ 🗑 ➤ *${clearCmd}*      (clear tmp files)
║ 🔐 ➤ *${ownerCmd}* (owner info)
╚════════════════════╝

  •── Command Details ──•
  
• ${menuCmd} = Show commands menu.

• ${okCmd} = Fetch another person's dp by replying to their message.

• ${hmmCmd} = Capture story by replying to that person's message.

• ${wowCmd} = Capture a view-once photo/video by replying it.

• ${clearCmd} = Clear temporary cached files.

• ${ownerCmd} = Show owner info and contact.

> Made by ©Ahsan Habib Muaz`;
};

function getMessageText(msg) {
  return msg.message?.conversation?.trim() ||
    msg.message?.extendedTextMessage?.text?.trim() || '';
}

async function reactToCommand(sock, msg) {
  if (!settings.commandReaction) return;
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      react: { text: settings.commandReaction, key: msg.key }
    });
  } catch (e) {
    console.error('[cmd] reaction failed:', e.message);
  }
}

async function handleCommand(sock, msg, text) {
  const owner = ownerJid(sock);
  const chatId = msg.key.remoteJid;

  const isMenu = commandMatches(text, commands.menu);
  const isProfile = commandMatches(text, commands.profilePicture);
  const isStory = commandMatches(text, commands.story);
  const isViewOnce = commandMatches(text, commands.viewOnce);
  const isClear = commandMatches(text, commands.clear);
  const isOwner = commandMatches(text, commands.owner);

  if (!isMenu && !isProfile && !isStory && !isViewOnce && !isClear && !isOwner) return false;
  if (!owner) return true;

  // Commands are intentionally kept in the chat. Do not delete them.
  // Only react after a successful command execution.

  if (isMenu) {
    await sock.sendMessage(owner, {
      image: { url: 'https://files.catbox.moe/6629iv.jpg' },
      caption: withFooter(MENU_TEXT())
    });
    await reactToCommand(sock, msg);
    return true;
  }

  if (isOwner) {
    await sock.sendMessage(owner, {
      image: { url: 'https://files.catbox.moe/2qklbv.jpg' },
      caption: withFooter(
        `✨ *Special Script Bot*\n\n` +
        `Created by *Muaz*\n` +
        `Contact: https://t.me/ahsanhabibmuaz\n\n` +
        `> Personal WhatsApp Automation Bot.`
      )
    });
    await reactToCommand(sock, msg);
    return true;
  }

  if (isClear) {
    const result = store.clearAll();
    await sock.sendMessage(owner, {
      text: withFooter(
        `🧹 *Cleanup Complete*\n\n` +
        `✅️ Temporary files removed: *${result.tmpRemoved}*`
      )
    });
    await reactToCommand(sock, msg);
    return true;
  }

  if (isViewOnce) {
    const quoted = getQuotedMessage(msg);
    const voContainer = getViewOnceContainer(quoted);
    if (!voContainer) {
      await sock.sendMessage(owner, {
        text: withFooter(`❌ ${commands.viewOnce} must be used by replying to a view-once photo/video.`)
      });
      return true;
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const sender = ctx?.participant || msg.key.remoteJid;
    const chatName = await resolveChatName(sock, chatId);
    const success = await forwardViewOnce(sock, voContainer, {
      sender,
      senderName: msg.pushName || sender.split('@')[0],
      chatId,
      chatName
    });

    if (success) await reactToCommand(sock, msg);
    return true;
  }

  if (isProfile) {
    const target = extractTargetJid(msg);
    if (!target) {
      await sock.sendMessage(owner, {
        text: withFooter(`⚠️ ${commands.profilePicture} requires a reply or mention.`)
      });
      return true;
    }

    try {
      const ppUrl = await sock.profilePictureUrl(target, 'image');
      await sock.sendMessage(owner, {
        image: { url: ppUrl },
        caption: withFooter(`🖼️ *Profile Picture*\n\n*User:* @${target.split('@')[0]}\n*Time:* ${fmtTime(Date.now())}`),
        mentions: [target]
      });
      await reactToCommand(sock, msg);
    } catch (e) {
      await sock.sendMessage(owner, {
        text: withFooter(`❌ Could not fetch profile picture for @${target.split('@')[0]}.`),
        mentions: [target]
      });
    }
    return true;
  }

  if (isStory) {
    const target = extractTargetJid(msg);
    if (!target) {
      await sock.sendMessage(owner, {
        text: withFooter(`⚠️ ${commands.story} requires a reply to someone.`)
      });
      return true;
    }

    const status = store.getStatus(target);
    if (!status) {
      await sock.sendMessage(owner, {
        text: withFooter(`❌ No recent story captured for @${target.split('@')[0]}.`),
        mentions: [target]
      });
      return true;
    }

    try {
      const caption = withFooter(
        `📖 *Story Captured*\n\n*User:* @${target.split('@')[0]}\n*Time:* ${fmtTime(status.timestamp)}` +
        `${status.caption ? `\n\n${status.caption}` : ''}`
      );

      if (status.mediaType === 'image') {
        await sock.sendMessage(owner, { image: { url: status.mediaPath }, caption, mentions: [target] });
      } else if (status.mediaType === 'video') {
        await sock.sendMessage(owner, { video: { url: status.mediaPath }, caption, mentions: [target] });
      } else {
        await sock.sendMessage(owner, { text: caption, mentions: [target] });
      }
      await reactToCommand(sock, msg);
    } catch (e) {
      await sock.sendMessage(owner, { text: withFooter('❌ Failed to forward story.') });
    }
    return true;
  }

  return false;
}

async function handleIncoming(sock, upsert) {
  const { messages, type } = upsert;
  if (type !== 'notify') return;

  // Process every message in the batch; don't silently discard messages[1..n].
  for (const msg of messages || []) {
    try {
      if (!msg?.message) continue;
      msg.message = unwrapMessage(msg.message);

      if (msg.message?.protocolMessage?.type === REVOKE_TYPE) {
        await handleRevocation(sock, msg);
        continue;
      }
      if (msg.key?.remoteJid === 'status@broadcast') {
        await captureStatusMessage(sock, msg);
        continue;
      }

      if (msg.key.fromMe) {
        const text = getMessageText(msg);
        if (text && await handleCommand(sock, msg, text)) continue;
      }

      await storeAndCheckViewOnce(sock, msg);
    } catch (e) { console.error('[incoming] message handling error:', e.message); }
  }
}

module.exports = { handleIncoming, handleStatusEvent };
