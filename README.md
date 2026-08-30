<div align="center">

# 🛡️ Special Script Bot

### A Private WhatsApp Mini Bot for Personal Automation

**Built with Node.js + Baileys**

<img src="https://raw.githubusercontent.com/deepweb-system/deepweb-system.github.io/b00718d28b97be6b349bf50894d0b6fdb59328f4/bot-image/script-bot.svg" alt="Special Script Bot by Muaz" width="700"/>

<br>

<img src="https://files.catbox.moe/6629iv.jpg" alt="Special Script Bot" width="420"/>

<br><br>

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Baileys](https://img.shields.io/badge/Baileys-WhatsApp_Web-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)](LICENSE)
[![Private](https://img.shields.io/badge/Project-Private-purple?style=for-the-badge)](#)
[![Maintained](https://img.shields.io/badge/Maintained-Yes-success?style=for-the-badge)](#)

<br>

> **A lightweight, owner-focused WhatsApp automation bot designed for personal use, message recovery, media capture, status caching and useful private commands.**

<br>

**Created & maintained by [Muaz](#-credits)**

</div>

---

# 📖 About

**Special Script Bot** is a private Node.js WhatsApp mini bot created for **personal automation and self-privacy**.

The bot uses **Baileys** to communicate directly with WhatsApp through a WhatsApp Web socket connection without browser automation.

It is intentionally designed around an **owner-only workflow** rather than public or bulk messaging.

### 🎯 Design Philosophy

```text
Private
   ↓
Lightweight
   ↓
Owner-focused
   ↓
Temporary caching
   ↓
Useful automation
```

> ⚠️ **Important**
>
> This project uses an unofficial WhatsApp library. WhatsApp may restrict, disconnect or log out unofficial clients. Use the bot responsibly and only with WhatsApp accounts you control.

---

# ✨ Features

<table>
<tr>
<td width="50%">

### 🗑️ Anti-Delete Recovery

Recover cached messages when they are deleted for everyone.

- 💬 Text
- 🖼️ Images
- 🎥 Videos
- 🎵 Audio
- 🎭 Stickers
- 👤 Sender information
- 🏠 Chat/group information
- 🕒 Original timestamp
- 📝 Caption/text

</td>
<td width="50%">

### 👁️ View-Once Capture

Capture view-once photos and videos and explicitly forward them to the owner's private chat.

```text
Reply → /wow
```

Aliases:

```text
✨️
what?
```

</td>
</tr>

<tr>
<td>

### 📖 Status / Story Capture

Automatically cache recent WhatsApp statuses.

Supported:

- 🖼️ Photo
- 🎥 Video
- 💬 Text

Retrieve a person's latest cached status with:

```text
/hmm
```

</td>
<td>

### 🖼️ Profile Picture Fetch

Fetch a person's current WhatsApp profile picture by:

```text
Reply → /OK
```

or:

```text
@person /OK
```

</td>
</tr>

<tr>
<td>

### 🎵 YouTube Song Downloader

Search YouTube, download audio and convert it to MP3.

```text
/song <song name or URL>
```

Alias:

```text
🎵
```

</td>
<td>

### 🧹 Smart Cache Cleanup

Clear temporary media and protocol session cache while preserving:

```text
session/creds.json
```

No intentional re-pair is required.

</td>
</tr>

<tr>
<td>

### 🍭 Command Reactions

Successful commands receive a configurable WhatsApp reaction.

Default:

```text
🍭
```

</td>
<td>

### 🔐 Owner-Only Workflow

Captured information and bot-generated notifications are directed to the configured owner destination.

</td>
</tr>
</table>

---

# 🧩 Complete Command List

| Command | Alias | Usage | Purpose |
|:---|:---|:---|:---|
| `/menu` | — | `/menu` | Shows the bot menu |
| `/help` | — | `/help` | Detailed command help |
| `/OK` | `gimme your dp!` | Reply / mention | Fetch profile picture |
| `/hmm` | `❤️‍🩹` | Reply to person | Retrieve latest cached status |
| `/wow` | `✨️`, `what?` | Reply to view-once | Forward captured view-once media |
| `/song` | `🎵` | `/song <query>` | Download YouTube audio as MP3 |
| `/clear` | — | `/clear` | Clear temporary cache |
| `/owner` | `bot` | `/owner` | Show owner information |
| `/a-del` | — | `/a-del on/off` | Per-chat anti-delete toggle |
| `/reset-antidelete` | — | DM only | Reset anti-delete overrides |
| `/a-edit` | — | `/a-edit on/off` | Per-chat anti-edit toggle |
| `/reset-antiedit` | — | DM only | Reset anti-edit overrides |

> 💡 **Commands are case-insensitive.**
>
> `/menu`, `/MENU` and `/MeNu` are treated as the same command.

---

# 🗑️ Anti-Delete Recovery

The bot maintains a temporary cache of supported incoming messages.

```text
┌─────────────────────┐
│   Incoming Message  │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   Temporary Cache   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│ Message Deleted     │
│   For Everyone      │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   Delete Event      │
│      Detected       │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│   Cached Copy Found │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│     Owner DM        │
└─────────────────────┘
```

The recovery notification can contain:

- 👤 Sender name
- 📱 WhatsApp number/JID mention
- 💬 Chat/group name
- 🕒 Original timestamp
- 📝 Original message/caption
- 📎 Recovered media

### Owner messages

Messages sent by the owner and subsequently deleted by the owner are intentionally ignored by the recovery system.

### Global setting

```js
antideleteEnabled: true
```

---

# 👁️ View-Once Media

View-once content is captured but **is not automatically forwarded**.

The owner must explicitly reply to the view-once message.

```text
View-Once Photo / Video
          ↓
     Reply to it
          ↓
        /wow
          ↓
   Media downloaded
          ↓
       Owner DM
```

### Default command

```text
/wow
```

### Aliases

```text
✨️
what?
```

---

# 📖 WhatsApp Status / Story

When enabled, the bot caches the latest status received from each contact.

```text
Contact posts status
        ↓
 Status event received
        ↓
   Temporary cache
        ↓
Reply to contact's message
        ↓
       /hmm
        ↓
Latest cached status
        ↓
      Owner DM
```

### Supported status types

- 🖼️ Photo
- 🎥 Video
- 💬 Text

### Configuration

```js
autoStatusCapture: true
```

Only the **most recent captured status per contact** is retained.

---

# 🖼️ Profile Picture Fetch

Fetch a person's current WhatsApp profile picture.

### Reply method

```text
Reply to person's message
        ↓
       /OK
```

### Mention method

```text
@person /OK
```

The bot forwards the available profile picture to the owner's private chat together with:

- 📱 Target WhatsApp number
- 🕒 Current time
- 🖼️ Profile picture

> If WhatsApp does not permit access to the person's profile picture, the bot reports that it could not fetch it.

---

# 🎵 YouTube Song Downloader

Download YouTube audio directly through the bot.

### Usage

```text
/song <song name>
```

or:

```text
/song <YouTube URL>
```

Alias:

```text
🎵
```

### Processing flow

```text
/song query
     ↓
YouTube search
     ↓
Resolve title
     ↓
Download audio
     ↓
FFmpeg conversion
     ↓
MP3 generated
     ↓
Send audio
```

### Owner notification

Status messages are always sent to the **owner's private DM**:

```text
🔍 Searching <resolved YouTube title>
```

Then:

```text
🎧 Found: <resolved YouTube title>
```

The resulting MP3 is sent to the chat where `/song` was executed.

If the command was executed in another person's DM:

```text
Other Chat
   ↓
MP3 only
```

while:

```text
Owner DM
   ↓
Search / status / errors
```

This prevents bot-generated search and error messages from appearing in someone else's conversation.

### Audio format

The bot intentionally sends:

```text
audio/mpeg
```

as a normal playable MP3 file rather than an OGG/Opus voice note.

---

# 🧹 `/clear` — Smart Cache Cleanup

The `/clear` command removes temporary cached data.

### Temporary media

```text
tmp_media/
```

### Session cleanup

The command removes protocol/session cache files while preserving:

```text
session/creds.json
```

### Example output

```text
✅ Temp files & session cache cleared!

📊 Temp Media:
• Files removed: 4

🔐 Session Cache (creds.json kept):
• App state sync files: 3
• Pre-key files: 12
• Sender-key files: 8
• Session files: 15
• Other files: 0
• Total session files removed: 38

✅ creds.json preserved — linked device stays connected.
```

### Why is `creds.json` preserved?

`creds.json` contains the actual WhatsApp authentication credentials.

Therefore:

```text
/clear
   ↓
Delete temporary files
   ↓
Delete protocol cache
   ↓
KEEP creds.json
   ↓
Linked session remains authenticated
```

Baileys can rebuild deleted protocol state as communication continues.

> ⚠️ The next message involving a contact may occasionally require Signal-session renegotiation. This can briefly result in a WhatsApp **"waiting for this message"** notice.

---

# 🍭 Command Reactions

Successful commands are confirmed using a WhatsApp reaction instead of deleting the command message.

Default:

```js
commandReaction: '🍭'
```

Change it to anything you prefer:

```js
commandReaction: '🔥'
```

```js
commandReaction: '❤️'
```

```js
commandReaction: '👍'
```

Disable reactions:

```js
commandReaction: ''
```

---

# 🛡️ Per-Chat Feature Controls

Anti-delete and anti-edit can be independently controlled for each group or individual chat.

### Anti-Delete

Enable:

```text
/a-del on
```

Disable:

```text
/a-del off
```

### Anti-Edit

Enable:

```text
/a-edit on
```

Disable:

```text
/a-edit off
```

Settings are stored in:

```text
data/feature-settings.json
```

and survive restarts.

### Reset overrides

Reset all anti-delete overrides:

```text
/reset-antidelete
```

Reset all anti-edit overrides:

```text
/reset-antiedit
```

> 🔐 Reset commands are available from the owner's DM only.

---

# 🆘 Help

Use:

```text
/help
```

The bot sends a detailed explanation of the available commands to the owner's private chat.

---

# 🛠️ Command Customization

All command names and aliases are centralized inside:

```text
lib/cmd.js
```

Example:

```js
module.exports = {
  menu: '/menu',

  profilePicture: [
    '/OK',
    'gimme your dp!'
  ],

  story: [
    '/hmm',
    '❤️‍🩹'
  ],

  viewOnce: [
    '/wow',
    '✨️',
    'what?'
  ],

  clear: '/clear',

  owner: [
    '/owner',
    'bot'
  ]
};
```

### Change a command

For example, change:

```text
/OK
```

to:

```text
/dp
```

Simply modify:

```js
profilePicture: [
  '/dp',
  'gimme your dp!'
],
```

The command handler and menu will use the updated command automatically.

---

# ⚙️ Configuration

Main configuration:

```text
settings.js
```

| Setting | Description |
|:---|:---|
| `botName` | Bot display name |
| `ownerNumber` | Owner WhatsApp number |
| `footer` | Footer added to owner messages |
| `commandReaction` | Successful-command reaction |
| `antideleteEnabled` | Global anti-delete switch |
| `viewOnceForwardEnabled` | View-once functionality setting |
| `autoStatusCapture` | Automatic status caching |
| `maxStoredMessages` | Maximum cached messages |
| `mediaMaxAgeMs` | Cache retention duration |

### Example

```js
module.exports = {
  botName: 'Special Script Bot',

  ownerNumber: '9665XXXXXXXX',

  footer: '\n\n> ⓘSpecial Script by *Muaz*.',

  commandReaction: '🍭',

  antideleteEnabled: true,
  viewOnceForwardEnabled: true,
  autoStatusCapture: true,

  maxStoredMessages: 500,

  mediaMaxAgeMs: 24 * 60 * 60 * 1000
};
```

### 📱 Owner number format

Use the international number without:

```text
+
spaces
-
```

Example:

```js
ownerNumber: '9665XXXXXXXX'
```

After connection, the bot can also resolve the logged-in WhatsApp account from the active socket session.

---

# 🚀 Installation

## Requirements

- 🟢 Node.js **18 or newer**
- 📱 WhatsApp account you control
- 🌐 Internet connection
- 🖥️ Local machine, VPS or compatible Node.js server

---

## 1️⃣ Clone the repository

```bash
git clone https://github.com/deepweb-system/Script-Bot.git
cd Script-Bot
```

---

## 2️⃣ Install dependencies

```bash
npm install
```

---

## 3️⃣ Configure the bot

Open:

```text
settings.js
```

Set your:

```js
ownerNumber
```

and adjust any other options you need.

---

## 4️⃣ Start

```bash
npm start
```

For lower-memory environments:

```bash
npm run start:optimized
```

---

# 🔗 WhatsApp Pairing

On the first run, the bot prepares a WhatsApp socket and requests a pairing code.

The console will display the code and instructions.

On your phone:

```text
WhatsApp
   ↓
Settings
   ↓
Linked Devices
   ↓
Link a Device
   ↓
Link with phone number instead
   ↓
Enter pairing code
```

After successful authentication, credentials are stored in:

```text
session/
```

Future launches attempt to restore the existing session automatically.

### ⚠️ Pairing recommendations

Avoid repeatedly requesting pairing codes.

If WhatsApp rejects or rate-limits a new-device handshake, repeatedly requesting codes can make the situation worse.

If pairing is unreliable from a VPS/datacenter IP:

```text
Local / Residential Connection
             ↓
        Pair Once
             ↓
          session/
             ↓
       Move session to VPS
```

This can be more reliable than performing the initial pairing directly from some datacenter environments.

---

# 📁 Project Structure

```text
Special Script Bot/
│
├── index.js
│   └── WhatsApp connection, pairing & reconnect logic
│
├── handlers.js
│   └── Message, status, command & recovery handlers
│
├── settings.js
│   └── Main bot configuration
│
├── package.json
│   └── Dependencies & npm scripts
│
├── README.md
│   └── Project documentation
│
├── lib/
│   ├── cmd.js
│   │   └── Command names & aliases
│   │
│   └── store.js
│       └── Temporary files & in-memory cache
│
├── data/
│   └── feature-settings.json
│       └── Per-chat feature overrides
│
├── session/
│   └── Created after authentication
│
└── tmp_media/
    └── Temporary cached media
```

---

# 🧠 Architecture

```text
                    WhatsApp
                        │
                        ▼
                ┌───────────────┐
                │    Baileys    │
                │ WhatsApp Web  │
                │    Socket     │
                └───────┬───────┘
                        │
                        ▼
                ┌───────────────┐
                │   index.js    │
                │ Connection &  │
                │   Session     │
                └───────┬───────┘
                        │
                        ▼
                ┌───────────────┐
                │  handlers.js  │
                │ Message/Event │
                │    Handler    │
                └───────┬───────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
      Commands        Store        Status
          │             │             │
          ▼             ▼             ▼
      lib/cmd.js    lib/store.js   Cache
          │             │             │
          └─────────────┼─────────────┘
                        ▼
                    Owner DM
```

---

# 🧠 Message Lifecycle

### Normal message

```text
WhatsApp
   ↓
Incoming event
   ↓
Check message type
   ↓
Cache supported content
   ↓
Check owner command
   ↓
Execute command
   ↓
React 🍭
```

### Deleted message

```text
Message received
      ↓
Temporary cache
      ↓
Delete event
      ↓
Search cached message
      ↓
Recover content
      ↓
Owner notification
      ↓
Forward recovered media/text
```

### View-once

```text
View-once media
      ↓
Detected
      ↓
Owner replies /wow
      ↓
Download media
      ↓
Forward to owner
```

### Status

```text
Status received
      ↓
Capture
      ↓
Store latest status
      ↓
Owner replies /hmm
      ↓
Find target contact
      ↓
Forward latest cached status
```

---

# 🧹 Automatic Cache Management

Temporary data is automatically cleaned.

The store performs a cleanup sweep every hour.

Default retention:

```text
24 hours
```

Controlled by:

```js
mediaMaxAgeMs
```

Default:

```js
mediaMaxAgeMs: 24 * 60 * 60 * 1000
```

The message cache is also limited:

```js
maxStoredMessages: 500
```

When the maximum is reached:

```text
Newest message
      ↑
      │
Message cache
      │
      ↓
Oldest message → Removed
```

---

# 🔐 Privacy & Security

Special Script Bot is designed around a private, owner-focused workflow.

### The bot:

- 🔒 Sends captured information to the configured owner destination
- 🛑 Does not provide public/bulk messaging features
- 📝 Does not delete command messages
- 🧹 Automatically removes expired temporary media
- 🔐 Preserves `creds.json` during `/clear`

### Protect your session

The following directory contains authentication credentials:

```text
session/
```

Treat it like a password.

### ❌ Never

```text
❌ Upload session/ to public GitHub
❌ Share creds.json publicly
❌ Send session files to strangers
❌ Run the same session on multiple servers
```

### ✅ Recommended `.gitignore`

```gitignore
session/
tmp_media/
node_modules/
data/feature-settings.json
```

If the authentication session is intentionally compromised or invalidated, remove:

```text
session/
```

and pair the bot again.

---

# 📦 Dependencies

| Package | Purpose |
|:---|:---|
| `@whiskeysockets/baileys` | WhatsApp Web protocol/client |
| `@hapi/boom` | Error & status handling |
| `pino` | Logging |
| `axios` | HTTP requests & file fetching |
| `yt-search` | YouTube search |
| `ffmpeg-static` | Bundled FFmpeg |
| `youtube-dl-exec` | Kept for project requirements; not used by current `/song` implementation |

Install everything with:

```bash
npm install
```

> ⚠️ **Baileys version**
>
> The project currently uses a pinned Baileys version. Avoid upgrading it casually because WhatsApp protocol changes can introduce compatibility problems.

---

# 🩹 Troubleshooting

## ❌ Pairing code does not work

Check:

```text
1. Correct WhatsApp number
2. International number format
3. No +, spaces or dashes
4. Enter the code only once
5. Avoid repeatedly requesting codes
6. Try pairing from a local/residential connection
7. Re-pair only if the existing session is invalid
```

---

## ❌ Bot keeps reconnecting

Check the console for the WhatsApp disconnect status.

Possible causes include:

- Network instability
- WhatsApp handshake problems
- Invalidated session
- Multiple bot instances
- VPS/datacenter restrictions

Do not run multiple copies using the same:

```text
session/
```

directory.

---

## ❌ `/wow` does nothing

Make sure you are replying **directly to the view-once photo/video**.

Correct:

```text
[View Once Photo]
       ↳ Reply: /wow
```

Incorrect:

```text
/wow
```

without a quoted view-once message.

---

## ❌ `/OK` requires a reply or mention

Reply to the target person's message:

```text
Reply → /OK
```

or mention them:

```text
@person /OK
```

---

## ❌ `/hmm` says no recent story

Check:

```js
autoStatusCapture: true
```

The target contact must also have a recently captured status.

Only the latest cached status for that contact is retained.

---

## ❌ `/clear` appears to cause pairing

`/clear` is designed to preserve:

```text
session/creds.json
```

while deleting protocol/session cache.

If pairing is requested afterward, verify:

```text
session/creds.json
```

still exists and was not already missing or corrupted.

That would be separate from the intended `/clear` behavior.

---

# 🗂️ Important Files

| File | Role |
|:---|:---|
| `index.js` | WhatsApp connection & pairing |
| `handlers.js` | Main message/event processing |
| `settings.js` | Bot configuration |
| `lib/cmd.js` | Commands & aliases |
| `lib/store.js` | Cache & temporary storage |
| `data/feature-settings.json` | Per-chat settings |
| `package.json` | Dependencies/scripts |
| `README.md` | Documentation |
| `session/` | WhatsApp authentication |
| `tmp_media/` | Temporary media |

---

# ⚡ Quick Reference

```text
/menu
```

Show menu.

```text
/help
```

Show detailed help.

```text
/OK
```

Fetch profile picture.

```text
/hmm
```

Retrieve latest cached status.

```text
/wow
```

Forward replied view-once media.

```text
/song <query>
```

Download YouTube audio.

```text
/clear
```

Clear temporary cache.

```text
/owner
```

Show owner information.

```text
/a-del on
/a-del off
```

Control anti-delete for the current chat.

```text
/a-edit on
/a-edit off
```

Control anti-edit for the current chat.

```text
/reset-antidelete
/reset-antiedit
```

Reset per-chat overrides from the owner's DM.

---

# ⚖️ License

**ISC License — Personal / Private Use**

This project is provided for personal automation.

You are responsible for:

- How you use the software
- The data you capture
- Compliance with applicable laws
- Compliance with WhatsApp's terms and policies
- Protecting your WhatsApp authentication credentials

---

<div align="center">

# ❤️ Credits

### Special Script Bot

**Designed, configured and maintained by Muaz**

<br>

**© 2026 Muaz — All Rights Reserved.**

<br>

**GitHub:** `deepweb-system/Script-Bot`

**Telegram:** `@ahsanhabibmuaz`

<br>

> ⓘ **Special System by Muaz.**

<br>

---

### 🛡️ Private • Lightweight • Owner-Focused

**Built with Node.js + Baileys**

</div>
