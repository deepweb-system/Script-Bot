<div align="center">

<img src="https://files.catbox.moe/6629iv.jpg" alt="Special Script Bot Menu" width="420"/>

# Special Script Bot

**A private WhatsApp automation bot for personal security, monitoring, and self-privacy.**

Built with [Node.js](https://nodejs.org) + [Baileys](https://github.com/WhiskeySockets/Baileys) — a direct WebSocket connection to WhatsApp Web, no browser automation, no third-party server.

</div>

---

## ⚠️ Personal Use Only

This bot is built for **one owner, one number**. It is not designed for groups, public use, or bulk messaging.
Using unofficial libraries like Baileys is against WhatsApp's Terms of Service — ban risk is real, though lower for bots that stay owner-only, avoid mass outreach, and behave like a normal linked device. Use responsibly.

---

## ✨ Features

### 🗑️ Anti-Delete Recovery
Recovers messages that are deleted for everyone in any chat you're part of. The original text and/or media (image, video, sticker, audio) is cached temporarily and, the moment a delete is detected, forwarded privately to you with the sender, chat name, and original timestamp attached.

### 👁️ View-Once Capture
Captures view-once photos and videos so they aren't gone after a single view. Nothing is forwarded automatically — you stay in control by replying `/wow` (or an alias) to the view-once message, and only then is it sent to your own chat.

### 📖 Status / Story Capture
Automatically caches statuses (photos, videos, or text) posted by your contacts as they come in. Reply `/hmm` to any message from that contact to pull up their most recently captured story, complete with caption and timestamp.

### 🖼️ Profile Picture Fetch
Reply to (or mention) any contact with `/OK` to instantly fetch and forward their current profile picture to you.

### 🧹 Temporary File Cleanup
`/clear` wipes cached temp media and in-memory message/status stores to free up space — without ever touching your authenticated WhatsApp session, so you never have to re-pair the device.

### 📃 Menu & Owner Info
`/menu` shows all available commands with a banner image. `/owner` shows bot credit and contact info.

### 🔒 Privacy by Design
- Every captured or recovered item is sent **only to the owner's own chat** — never to groups or third parties.
- Command messages are never deleted from the original chat; the bot simply reacts with an emoji (⚙️ configurable) to confirm execution.
- Auto-expiry: cached messages/media older than a configurable age are purged automatically on an hourly sweep.

---

## 🧾 Commands

| Command | Aliases | Description |
|---|---|---|
| `/menu` | — | Show the command menu with banner image |
| `/OK` | `gimme your dp!` | Fetch a profile picture (reply or @mention) |
| `/hmm` | `❤️‍🩹` | Fetch a captured story (reply to the person) |
| `/wow` | `✨️`, `what?` | Forward a view-once photo/video (reply to it) |
| `/clear` | — | Clear temporary cached files (session is preserved) |
| `/owner` | `bot` | Show owner info and contact |

Commands and their aliases are fully configurable in [`lib/cmd.js`](./lib/cmd.js).

---

## ⚙️ Configuration

All bot behavior is controlled from [`settings.js`](./settings.js):

```js
module.exports = {
  botName: 'Special Script Bot',
  ownerNumber: '9665XXXXXXXX',   // country code + number, digits only
  footer: '\n\n> ⓘSpecial Script by *Muaz*.',
  commandReaction: '🍭',          // emoji reaction after a successful command

  antideleteEnabled: true,
  viewOnceForwardEnabled: true,
  autoStatusCapture: true,

  maxStoredMessages: 500,
  mediaMaxAgeMs: 24 * 60 * 60 * 1000
};
```

| Setting | Purpose |
|---|---|
| `ownerNumber` | Your WhatsApp number — the only chat the bot ever sends captured content to |
| `commandReaction` | Emoji the bot reacts with after a command runs successfully |
| `antideleteEnabled` | Toggle deleted-message recovery |
| `viewOnceForwardEnabled` | Toggle view-once capture |
| `autoStatusCapture` | Toggle automatic status/story caching |
| `maxStoredMessages` | Cap on in-memory cached messages before oldest is evicted |
| `mediaMaxAgeMs` | How long cached media is kept before auto-purge |

---

## 🚀 Getting Started

### Requirements
- Node.js **v18+**
- A WhatsApp account you control (used only as the linked device)

### Install

```bash
npm install
```

### Run

```bash
npm start
```

or, on constrained hosts:

```bash
npm run start:optimized
```

### First-time pairing

1. Start the bot — a **pairing code** is printed once in the console.
2. On your phone: **WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number instead**.
3. Enter the code shown. Do this only once per code.

> **📶 Pairing from a VPS/datacenter IP can be unreliable** — WhatsApp's device-registration handshake sometimes flags datacenter IPs, causing repeated pairing failures (status codes like `401`, `403`, `428`, `515`).
> **Recommended workaround:** pair the bot once on a local machine using a residential internet connection, then copy the generated `session/` folder to your VPS via SFTP. Once authenticated this way, the bot runs reliably on the server.

---

## 🗂️ Project Structure

```
.
├── index.js        # Socket connection, pairing, reconnect logic
├── handlers.js      # Message/status event handling, command logic
├── settings.js       # Bot configuration
├── lib/
│   ├── cmd.js         # Command names & aliases
│   └── store.js       # Temp file + in-memory cache management
└── package.json
```

---

## 🔐 Session & Credential Safety

- The `session/` folder (including `creds.json` and pre-key files) **is a login credential** — treat it like a password.
- **Never** commit `session/` to a public repository or share it in chat/screenshots. Add it to `.gitignore`.
- Do not run the bot from two locations at once using the same `session/` folder — this causes conflicts and forces a logout.
- If a session is ever compromised or logged out unexpectedly, delete `session/` and re-pair fresh.

---

## 🩹 Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Pairing code request fails repeatedly on VPS | Datacenter IP flagged by WhatsApp | Pair locally, then SFTP the `session/` folder to the VPS |
| Connection closes with `515` | WhatsApp requested a restart mid-handshake | The bot auto-reconnects with backoff; avoid rapid manual retries |
| Repeated "logged out" | Session was invalidated on WhatsApp's side | Delete `session/` and pair again |
| Bot works but view-once isn't forwarded | You didn't reply `/wow` to it | Forwarding is manual by design — reply to the view-once message directly |

---

## 📄 License

ISC — personal/private use.

---

<div align="center">

### Made with ❤️ by **Muaz**
Contact: [t.me/ahsanhabibmuaz](https://t.me/ahsanhabibmuaz)

*This project is for personal use only — please don't use it for groups or bulk automation. Enjoy the freedom, feel the privacy.*

</div>
