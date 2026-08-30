const fs = require('fs');
const path = require('path');
const settings = require('../settings');

const TMP_DIR = path.join(process.cwd(), 'tmp_media');
const SESSION_DIR = path.join(process.cwd(), 'session');
const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'feature-settings.json');

for (const dir of [TMP_DIR, DATA_DIR]) if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const messageStore = new Map();
const statusStore = new Map();
let featureSettings = { antiDelete: {}, antiEdit: {} };

try {
  if (fs.existsSync(SETTINGS_FILE)) {
    featureSettings = { ...featureSettings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    featureSettings.antiDelete ||= {};
    featureSettings.antiEdit ||= {};
  }
} catch (e) { console.error('[store] feature settings load failed:', e.message); }

function persistFeatureSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(featureSettings, null, 2)); }
  catch (e) { console.error('[store] feature settings save failed:', e.message); }
}

function safeUnlink(p) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
}

function clearTmpFiles() {
  const stats = { total: 0, appState: 0, logs: 0, preKeys: 0, other: 0 };
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  for (const name of fs.readdirSync(TMP_DIR)) {
    const p = path.join(TMP_DIR, name);
    try {
      if (fs.statSync(p).isFile()) { fs.unlinkSync(p); stats.total++; }
    } catch (_) {}
  }
  for (const data of messageStore.values()) if (data?.mediaPath) data.mediaPath = null;
  for (const data of statusStore.values()) if (data?.mediaPath) data.mediaPath = null;
  messageStore.clear(); statusStore.clear();
  return stats;
}

const CREDS_FILE = 'creds.json';

function clearSessionFiles() {
  // Policy: delete EVERY file inside session/ except creds.json.
  // creds.json holds the actual WhatsApp linked-device credentials — losing
  // it means re-pairing. Everything else here (app-state-sync keys/versions,
  // pre-keys, sender-keys, per-contact session-*.json Signal sessions) is
  // Baileys-managed protocol state that gets regenerated automatically as
  // the bot talks to WhatsApp again; it is not required to stay linked.
  const stats = { removed: 0, appState: 0, preKeys: 0, senderKeys: 0, sessions: 0, other: 0, credsPreserved: false };
  if (!fs.existsSync(SESSION_DIR)) return stats;

  for (const name of fs.readdirSync(SESSION_DIR)) {
    if (name === CREDS_FILE) continue; // NEVER delete this one.
    const p = path.join(SESSION_DIR, name);
    try {
      if (!fs.statSync(p).isFile()) continue; // skip subdirectories defensively
      fs.unlinkSync(p);
      stats.removed++;
      if (/^app-state-sync/i.test(name)) stats.appState++;
      else if (/^pre-key/i.test(name)) stats.preKeys++;
      else if (/^sender-key/i.test(name)) stats.senderKeys++;
      else if (/^session-/i.test(name)) stats.sessions++;
      else stats.other++;
    } catch (_) {}
  }

  stats.credsPreserved = fs.existsSync(path.join(SESSION_DIR, CREDS_FILE));
  return stats;
}

function clearAll() {
  const tmp = clearTmpFiles();
  const session = clearSessionFiles();
  return { tmp, session };
}

function addMessage(id, data) {
  if (!id) return;
  messageStore.set(id, data);
  if (messageStore.size > settings.maxStoredMessages) {
    const oldestKey = messageStore.keys().next().value;
    const old = messageStore.get(oldestKey);
    if (old?.mediaPath) safeUnlink(old.mediaPath);
    messageStore.delete(oldestKey);
  }
}
function getMessage(id) { return messageStore.get(id); }
function deleteMessage(id) {
  const m = messageStore.get(id); if (m?.mediaPath) safeUnlink(m.mediaPath); messageStore.delete(id);
}
function setStatus(jid, data) { const prev = statusStore.get(jid); if (prev?.mediaPath) safeUnlink(prev.mediaPath); statusStore.set(jid, data); }
function getStatus(jid) { return statusStore.get(jid); }

function featureKey(chatId, personJid) {
  // Group setting is group-wide; private setting is per person/chat.
  return chatId?.endsWith('@g.us') ? `group:${chatId}` : `person:${personJid || chatId}`;
}
function getFeature(feature, chatId, personJid, defaultValue = true) {
  const key = featureKey(chatId, personJid);
  const value = featureSettings[feature]?.[key];
  return typeof value === 'boolean' ? value : defaultValue;
}
function setFeature(feature, chatId, personJid, enabled) {
  const key = featureKey(chatId, personJid);
  featureSettings[feature][key] = !!enabled;
  persistFeatureSettings();
  return key;
}
function resetFeature(feature) { featureSettings[feature] = {}; persistFeatureSettings(); }
function resetAllFeatures() { featureSettings = { antiDelete: {}, antiEdit: {} }; persistFeatureSettings(); }

setInterval(() => {
  const now = Date.now();
  for (const [id, data] of messageStore.entries()) {
    if (now - data.timestamp > settings.mediaMaxAgeMs) { if (data.mediaPath) safeUnlink(data.mediaPath); messageStore.delete(id); }
  }
  for (const [jid, data] of statusStore.entries()) {
    if (now - data.timestamp > settings.mediaMaxAgeMs) { if (data.mediaPath) safeUnlink(data.mediaPath); statusStore.delete(jid); }
  }
}, 60 * 60 * 1000);

module.exports = {
  TMP_DIR, SESSION_DIR, addMessage, getMessage, deleteMessage, setStatus, getStatus,
  safeUnlink, clearTmpFiles, clearSessionFiles, clearAll,
  getFeature, setFeature, resetFeature, resetAllFeatures, featureKey
};
