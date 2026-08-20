const fs = require('fs');
const path = require('path');
const settings = require('../settings');

const TMP_DIR = path.join(process.cwd(), 'tmp_media');
const SESSION_DIR = path.join(process.cwd(), 'session');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const messageStore = new Map();
const statusStore = new Map();

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) {}
}

function clearTmpFiles() {
  let removed = 0;
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  for (const name of fs.readdirSync(TMP_DIR)) {
    const p = path.join(TMP_DIR, name);
    try {
      if (fs.statSync(p).isFile()) {
        fs.unlinkSync(p);
        removed++;
      }
    } catch (_) {}
  }

  for (const data of messageStore.values()) {
    if (data?.mediaPath) data.mediaPath = null;
  }
  for (const data of statusStore.values()) {
    if (data?.mediaPath) data.mediaPath = null;
  }

  messageStore.clear();
  statusStore.clear();
  return removed;
}

function clearSessionFiles() {
  // IMPORTANT: Never delete authenticated WhatsApp session credentials here.
  // /clear must not force the owner to pair the bot again.
  // The session directory is intentionally preserved.
  return 0;
}

function clearAll() {
  const tmpRemoved = clearTmpFiles();
  const sessionRemoved = clearSessionFiles();
  return { tmpRemoved, sessionRemoved };
}

function addMessage(id, data) {
  messageStore.set(id, data);
  if (messageStore.size > settings.maxStoredMessages) {
    const oldestKey = messageStore.keys().next().value;
    const old = messageStore.get(oldestKey);
    if (old?.mediaPath) safeUnlink(old.mediaPath);
    messageStore.delete(oldestKey);
  }
}

function getMessage(id) {
  return messageStore.get(id);
}

function deleteMessage(id) {
  const m = messageStore.get(id);
  if (m?.mediaPath) safeUnlink(m.mediaPath);
  messageStore.delete(id);
}

function setStatus(jid, data) {
  const prev = statusStore.get(jid);
  if (prev?.mediaPath) safeUnlink(prev.mediaPath);
  statusStore.set(jid, data);
}

function getStatus(jid) {
  return statusStore.get(jid);
}

setInterval(() => {
  const now = Date.now();

  for (const [id, data] of messageStore.entries()) {
    if (now - data.timestamp > settings.mediaMaxAgeMs) {
      if (data.mediaPath) safeUnlink(data.mediaPath);
      messageStore.delete(id);
    }
  }

  for (const [jid, data] of statusStore.entries()) {
    if (now - data.timestamp > settings.mediaMaxAgeMs) {
      if (data.mediaPath) safeUnlink(data.mediaPath);
      statusStore.delete(jid);
    }
  }
}, 60 * 60 * 1000);

module.exports = {
  TMP_DIR,
  SESSION_DIR,
  addMessage,
  getMessage,
  deleteMessage,
  setStatus,
  getStatus,
  safeUnlink,
  clearTmpFiles,
  clearSessionFiles,
  clearAll
};
