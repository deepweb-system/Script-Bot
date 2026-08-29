/**
 * Muaz Plus - personal WhatsApp automation bot
 * Private use only. Direct Baileys WebSocket — no browser automation/server.
 */

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const readline = require('readline');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  delay
} = require('@whiskeysockets/baileys');
const settings = require('./settings');
const { handleIncoming, handleStatusEvent, handleMessageUpdate } = require('./handlers');

const SESSION_DIR = path.join(process.cwd(), 'session');
let reconnectTimer = null;
let startInProgress = false;
let stopping = false;
// WhatsApp/Baileys drops and silently re-establishes the socket periodically
// (commonly every ~1 hour) even while the session stays authenticated. Each
// re-establishment fires a fresh 'open' connection event. This flag ensures
// the "connected" notice is sent only once per process run, not on every
// automatic reconnect.
let ownerNotifiedThisRun = false;

const rl = process.stdin.isTTY
  ? readline.createInterface({ input: process.stdin, output: process.stdout })
  : null;

function log(message) { console.log(`[MUAZ] ${message}`); }
function warn(message) { console.warn(`[MUAZ] ⚠️ ${message}`); }
function fail(message, error) {
  console.error(`[MUAZ] ❌ ${message}`, error ? `\n   ${error?.stack || error?.message || error}` : '');
}
function question(text) {
  if (rl) return new Promise(resolve => rl.question(text, resolve));
  return Promise.resolve(settings.ownerNumber || '');
}
function cleanPhoneNumber(value) { return String(value || '').replace(/\D/g, ''); }
function formatPairingCode(code) {
  const clean = String(code || '').replace(/[^A-Za-z0-9]/g, '');
  return clean.match(/.{1,4}/g)?.join('-') || String(code || '');
}
function getOwnerJid(sock) {
  const rawId = sock?.user?.id || '';
  const number = rawId.split(':')[0].split('@')[0].replace(/\D/g, '');
  return number ? `${number}@s.whatsapp.net` : null;
}
function statusCodeOf(error) {
  return error?.output?.statusCode || error?.data?.statusCode;
}
function ensureSessionFolder() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    log('☕ Grab a coffee — session folder has been created.');
    log(`📁 Session path: ${SESSION_DIR}`);
  } else {
    log(`📁 Session folder found: ${SESSION_DIR}`);
  }
}
function showSessionFiles() {
  try {
    const files = fs.readdirSync(SESSION_DIR);
    if (files.includes('creds.json')) {
      log('🔐 creds.json found — existing WhatsApp credentials will be reused.');
    } else {
      log('🔐 creds.json not found — fresh WhatsApp login detected.');
      log('📝 Baileys will create creds.json automatically during authentication.');
    }
  } catch (e) { warn(`Could not inspect session folder: ${e.message}`); }
}
async function getCurrentWaVersion() {
  log('🌐 Looking for the current WhatsApp Web API version...');
  const result = await fetchLatestWaWebVersion({});
  if (!result?.version?.length) throw new Error('Could not obtain current WhatsApp Web version');
  log(`🌐 WhatsApp Web version: ${result.version.join('.')} ${result.isLatest ? '(latest)' : '(server suggested)'}`);
  return result.version;
}

async function start() {
  if (startInProgress || stopping) return;
  startInProgress = true;
  try {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log(`🚀 Starting ${settings.botName}...`);
    log('🔌 Direct WhatsApp WebSocket connection — no Selenium/Chrome/server.');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    ensureSessionFolder();
    showSessionFiles();
    const version = await getCurrentWaVersion();

    log('🔑 Loading multi-file authentication state...');
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const registeredAtStartup = !!state.creds.registered;

    if (registeredAtStartup) {
      log('♻️ Existing authenticated session detected. Restoring session...');
    } else {
      log('🆕 No authenticated session detected. Preparing first-time pairing...');
    }

    let phoneNumber = cleanPhoneNumber(settings.ownerNumber);
    if (!registeredAtStartup && !phoneNumber) {
      phoneNumber = cleanPhoneNumber(await question('Enter WhatsApp number (country code + number, digits only): '));
    }
    if (!registeredAtStartup && !phoneNumber) throw new Error('No WhatsApp number supplied. Set settings.ownerNumber first.');
    if (!registeredAtStartup) log(`📱 Pairing number: ${phoneNumber}`);

    const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });
    log('🔧 Creating WhatsApp socket...');
    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      defaultQueryTimeoutMs: 60000,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 15000,
      qrTimeout: 120000
    });
    log('📡 Socket created. Waiting for WhatsApp handshake...');

    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        if (!state.creds.registered) log('💾 Authentication state updated; waiting for device linking...');
      } catch (e) { fail('Could not save authentication credentials.', e); }
    });

    sock.ev.on('messages.upsert', async upsert => {
      try { await handleIncoming(sock, upsert); }
      catch (e) { fail('Message handler error.', e); }
    });

    sock.ev.on('messages.update', async updates => {
      try { await handleMessageUpdate(sock, updates); }
      catch (e) { fail('Edited-message handler error.', e); }
    });

    sock.ev.on('status.update', async status => {
      try { await handleStatusEvent(sock, status); }
      catch (e) { fail('Status handler error.', e); }
    });

    // ==================== FIXED PAIRING LOGIC (now uses Linux Chrome) ====================
    let pairingRequested = false;
    let pairingInProgress = false;
    let opened = false;

    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect, qr } = update;
      const code = statusCodeOf(lastDisconnect?.error);

      if (connection === 'connecting') log('🔄 WhatsApp state: CONNECTING');

      // === Request one pairing code only. Keep the single clean display. ===
      if (qr && !registeredAtStartup && !pairingRequested && !pairingInProgress) {
        pairingInProgress = true;
        try {
          log('📲 Pairing interface ready. Waiting for full handshake...');
          await delay(1500);

          if (state.creds.registered || opened || stopping) return;

          log('🔗 Requesting the single pairing code...');
          const rawCode = await sock.requestPairingCode(phoneNumber);
          const formatted = formatPairingCode(rawCode);
          pairingRequested = true;

          log('');
          log('╔══════════════════════════════════════╗');
          log(`║       📱 PAIRING CODE: ${formatted}       ║`);
          log('╚══════════════════════════════════════╝');
          log('');
          log('📱 WhatsApp → Settings → Linked Devices → Link a Device');
          log('🔗 Choose “Link with phone number instead”.');
          log(`⌨️ Enter: ${formatted}`);
          log('⏱️ Enter the code **once**. Do not request another code.');
          log('⌛ Waiting for WhatsApp to approve the new linked device...');
        } catch (e) {
          pairingRequested = false;
          const pairCode = statusCodeOf(e);
          fail(`Pairing-code request failed${pairCode ? ` (status ${pairCode})` : ''}.`, e);
          if ([400, 408, 428, 429, 515].includes(pairCode)) {
            warn('WhatsApp/Baileys rejected the new-device handshake.');
            warn('Do not spam pairing requests; wait before trying a fresh login.');
          }
        } finally {
          pairingInProgress = false;
        }
      }

      if (connection === 'open') {
        opened = true;
        pairingRequested = true;
        log('');
        log('╔══════════════════════════════════════════╗');
        log(`║  ✅ ${settings.botName} CONNECTED SUCCESSFULLY  ║`);
        log('╚══════════════════════════════════════════╝');
        log(`👤 Linked account: ${sock.user?.id || 'unknown'}`);
        log('💾 Session credentials are active on disk.');
        log('🤖 Bot handlers are running.');

        if (!ownerNotifiedThisRun) {
          const owner = getOwnerJid(sock);
          if (owner) {
            try {
              await sock.sendMessage(owner, {
                text: `✅ *${settings.botName} Connected*\n\nYour WhatsApp linked-device session is active.\nThe bot is now running normally.\n\n> ⓘSpecial System by *Muaz*.`
              });
              ownerNotifiedThisRun = true;
              log(`📨 Connection confirmation sent to ${owner}.`);
            } catch (e) { warn(`Connected, but confirmation message could not be sent: ${e.message}`); }
          }
        } else {
          log('🔄 Session re-established after a routine reconnect (notice already sent this run).');
        }
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.message || 'unknown reason';
        fail(`WhatsApp connection closed (${code || 'no status code'}): ${reason}`);

        if (!opened && !state.creds.registered) {
          if (code === 428) warn('New-device handshake closed with 428 (Precondition Required).');
          if (code === 515) warn('WhatsApp requested a restart during new-device pairing.');
          if (code === 429) warn('WhatsApp rate-limited the pairing attempt.');
        }
        if (code === DisconnectReason.loggedOut) {
          warn('Session was logged out. Delete session/ only when intentionally starting fresh.');
          startInProgress = false;
          return;
        }
        if (stopping || reconnectTimer) return;

        let wait = 5000;
        if ([408, 428, 515].includes(code) && !state.creds.registered) wait = 30000;
        if (code === 429) wait = 120000;
        log(`🔁 Reconnect scheduled in ${Math.round(wait / 1000)} seconds...`);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          startInProgress = false;
          start().catch(e => fail('Reconnect failed.', e));
        }, wait);
      }
    });
  } catch (err) {
    fail('Fatal startup error.', err);
    if (!stopping) {
      startInProgress = false;
      log('🔁 Retrying startup in 10 seconds...');
      setTimeout(() => start().catch(e => fail('Restart failed.', e)), 10000);
    }
    return;
  }
  startInProgress = false;
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log(`🛑 ${signal} received. Shutting down cleanly...`);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (rl) rl.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', e => fail('Uncaught exception.', e));
process.on('unhandledRejection', e => fail('Unhandled promise rejection.', e));
start().catch(e => fail('Fatal startup error.', e));