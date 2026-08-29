<div align="center">
    <img src="https://raw.githubusercontent.com/deepweb-system/Script-Bot/4e2d464ff44265af987ff53a10966e33aebfd62b/Animation-Git/Script-Bot.svg" alt="Script-Bot by Muaz"/>

**A private Node.js WhatsApp mini bot for personal automation, message recovery and self-privacy.**

</div>
<div align="center">

<img src="https://files.catbox.moe/6629iv.jpg" alt="Special Script Bot" width="420"/>

Built with **Node.js** and **Baileys**, using a direct WhatsApp Web socket connection without browser automation.<br>

**Created & maintained by Muaz**

---

## 📌 About

**Special Script Bot** is a private, owner-focused WhatsApp automation project. It is designed to keep useful captured information inside the owner's own WhatsApp chat while providing a small set of simple commands.

The bot is intentionally lightweight and does not provide public/bulk messaging features.

> ⚠️ **Important:** This project uses an unofficial WhatsApp library. WhatsApp may restrict or log out unofficial clients. Use the bot responsibly and only with accounts you control.

---

## ✨ Features

### 🗑️ 1. Anti-Delete Message Recovery

The bot keeps a temporary copy of incoming messages so that a message deleted for everyone can be recovered when WhatsApp sends the deletion event.

Supported cached content includes:

- 💬 Text messages
- 🖼️ Images
- 🎥 Videos
- 🎵 Audio
- 🎭 Stickers

When another person deletes a cached message, the bot sends the recovered content to the **owner's private WhatsApp chat**.

The recovery notification includes:

- 👤 Sender name
- 📱 Sender WhatsApp number/JID mention
- 💬 Chat/group name
- 🕒 Original message timestamp
- 📝 Original text/caption when available
- 📎 Original media when it was successfully cached

**Important:** Messages sent by the owner and then deleted by the owner are intentionally ignored by the recovery system.

Anti-delete can be globally enabled or disabled from `settings.js`:

```js
antideleteEnabled: true
```

---

### 👁️ 2. View-Once Media Capture

The bot detects view-once photos and videos and keeps the media available for the owner.

View-once content is **not automatically forwarded** to the owner. You must explicitly reply to the view-once message with the configured view-once command.

Default command:

```text
/wow
```

Aliases:

```text
✨️
what?
```

Example:

```text
Reply to the view-once photo/video → /wow
```

The bot then forwards the media to the owner's chat with sender, chat and capture information.

---

### 📖 3. WhatsApp Status / Story Capture

When enabled, the bot automatically caches status updates received from contacts.

Supported status types:

- 🖼️ Photo status
- 🎥 Video status
- 💬 Text status

The bot keeps the **most recent captured status for each contact**. You can retrieve it by replying to one of that person's messages with the story command.

Default command:

```text
/hmm
```

Alias:

```text
❤️‍🩹
```

Example:

```text
Reply to a message from John → /hmm
```

If a recent cached status exists for John, the bot forwards it to the owner's private chat.

Status capture can be controlled with:

```js
autoStatusCapture: true
```

---

### 🖼️ 4. Profile Picture Fetch

Fetch another person's current WhatsApp profile picture by replying to their message or mentioning them.

Default command:

```text
/OK
```

Alias:

```text
gimme your dp!
```

Examples:

```text
Reply to someone's message → /OK
```

or

```text
@person /OK
```

The profile picture is forwarded to the owner's private chat together with the target's WhatsApp number and the current time.

> If WhatsApp does not allow the bot to access that person's profile picture, the bot reports that it could not fetch it.

---

### 🧹 5. Temporary Cache Cleanup

The `/clear` command removes temporary cached media and clears the in-memory message/status stores.

Default command:

```text
/clear
```

It removes temporary files from:

```text
tmp_media/
```

### 🔐 Session protection

`/clear` **does not delete the WhatsApp session**.

Your authenticated `session/` directory and credentials remain untouched, so using `/clear` does **not** require you to pair the bot again.

---

### 📃 6. Menu

Use:

```text
/menu
```

The bot sends the command menu to the owner's chat, including the configured menu banner and command descriptions.

The menu reads command names from `lib/cmd.js`, so changing a command there also changes the command shown in the menu.

---

### 🔐 7. Owner Information

Use:

```text
/owner
```

Alias:

```text
bot
```

This displays the bot's owner/creator information and Muaz's contact information.

---

### 🍭 8. Command Reactions

Successful commands are confirmed with a WhatsApp reaction instead of deleting the command message.

Default reaction:

```text
🍭
```

Change it from `settings.js`:

```js
commandReaction: '🍭'
```

You can replace it with another emoji, for example:

```js
commandReaction: '🔥'
```

```js
commandReaction: '❤️'
```

```js
commandReaction: '👍'
```

If `commandReaction` is empty, the bot will not add a reaction.

---

## 🧾 Complete Command List

| Command | Aliases | How to use | Function |
|---|---|---|---|
| `/menu` | None | Send normally | Shows the bot menu in the owner's chat |
| `/OK` | `gimme your dp!` | Reply to a person's message or mention them | Fetches their profile picture |
| `/hmm` | `❤️‍🩹` | Reply to a message from the person | Retrieves their latest cached status/story |
| `/wow` | `✨️`, `what?` | Reply directly to a view-once photo/video | Forwards the captured view-once media |
| `/clear` | None | Send normally | Clears temporary media and cached message/status data |
| `/owner` | `bot` | Send normally | Shows owner/creator information |

### Command behavior

Commands are detected **case-insensitively**. For example, `/MENU` and `/menu` are treated as the same command.

Command messages are **not deleted** from the chat. After successful execution, the bot reacts to the original command message using `settings.commandReaction`.

The actual command names and aliases are stored in:

```text
lib/cmd.js
```

---

## 🛠️ Command Customization

You can change command names without editing the main handler.

Open:

```text
lib/cmd.js
```

Example:

```js
module.exports = {
  menu: '/menu',
  profilePicture: ['/OK', 'gimme your dp!'],
  story: ['/hmm', '❤️‍🩹'],
  viewOnce: ['/wow', '✨️', 'what?'],
  clear: '/clear',
  owner: ['/owner', 'bot']
};
```

For example, to change `/OK` to `/dp`:

```js
profilePicture: ['/dp', 'gimme your dp!'],
```

The first value is used as the main command shown in the menu. Additional values are aliases.

---

## ⚙️ Configuration

Main configuration is located in:

```text
settings.js
```

Current configuration options:

| Setting | Description |
|---|---|
| `botName` | Name displayed by the bot |
| `ownerNumber` | Owner WhatsApp number, country code + number, digits only |
| `footer` | Footer appended to bot-generated owner messages |
| `commandReaction` | Reaction used after successful commands |
| `antideleteEnabled` | Enables/disables deleted-message recovery |
| `viewOnceForwardEnabled` | Controls view-once functionality setting |
| `autoStatusCapture` | Enables/disables automatic status caching |
| `maxStoredMessages` | Maximum number of incoming messages cached in memory |
| `mediaMaxAgeMs` | Maximum cache age before automatic cleanup |

Example:

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

Use the international number without `+`, spaces or dashes:

```js
ownerNumber: '9665XXXXXXXX'
```

The bot uses this number as the fallback owner destination. After connection, it can also resolve the logged-in WhatsApp account from the active socket session.

---

## 🚀 Installation

### Requirements

- **Node.js v18 or newer**
- A WhatsApp account you control
- Internet connection
- A server/VPS or local computer capable of running Node.js

### 1. Install dependencies

```bash
npm install
```

### 2. Start the bot

```bash
npm start
```

For a lower-memory environment:

```bash
npm run start:optimized
```

---

## 🔗 First-Time WhatsApp Pairing

On the first run, the bot prepares a WhatsApp socket and requests a pairing code.

The console will show the pairing code and instructions.

On your phone:

**WhatsApp → Settings → Linked Devices → Link a Device → Link with phone number instead**

Enter the displayed pairing code.

### After successful pairing

The authenticated credentials are stored in:

```text
session/
```

The next time the bot starts, it attempts to restore the existing session instead of asking you to pair again.

### ⚠️ Do not repeatedly request pairing codes

If WhatsApp rejects or rate-limits a new-device handshake, repeatedly requesting new codes can make the situation worse.

If pairing is unreliable on a VPS/datacenter IP, pairing once from a normal residential/local connection and then moving the authenticated `session/` directory to the server can be more reliable.

---

## 🗂️ Project Structure

```text
Special Script Bot/
│
├── index.js              # WhatsApp connection, pairing and reconnect logic
├── handlers.js           # Message, status, command and recovery handlers
├── settings.js           # Bot configuration
├── package.json          # Dependencies and npm scripts
├── README.md             # Documentation
│
├── lib/
│   ├── cmd.js            # Command names and aliases
│   └── store.js          # Temporary files and in-memory cache
│
├── session/              # Created after authentication; KEEP PRIVATE
└── tmp_media/            # Temporary cached media
```

---

## 🧠 How the Bot Works

### Incoming messages

1. WhatsApp sends an incoming message event to the bot.
2. The bot checks whether the message is a delete/revoke event.
3. If it is a normal message, supported content is temporarily cached.
4. Commands sent by the owner are checked against `lib/cmd.js`.
5. Successful commands send the result to the owner's private chat.
6. The original command remains in the chat and receives the configured reaction.

### Deleted messages

```text
Incoming message
       ↓
Temporary cache
       ↓
Message deleted for everyone
       ↓
Delete event detected
       ↓
Cached copy found
       ↓
Recovered message → Owner DM
```

### View-once media

```text
View-once photo/video
       ↓
Detected and available to handler
       ↓
Reply with /wow
       ↓
Media downloaded
       ↓
Media → Owner DM
```

### Status/story

```text
Contact posts status
       ↓
Status event received
       ↓
Photo/video/text cached
       ↓
Reply to contact's message + /hmm
       ↓
Latest cached status → Owner DM
```

---

## 🧹 Automatic Cache Cleanup

Temporary data is not intended to remain forever.

The store performs an automatic cleanup sweep every hour and removes cached messages/statuses older than:

```js
mediaMaxAgeMs
```

With the default value:

```text
24 hours
```

The cache is also limited by:

```js
maxStoredMessages: 500
```

When the message cache reaches the limit, the oldest cached message is removed first.

---

## 🔒 Privacy & Security

The bot is designed around an owner-only workflow:

- Captured/recovered content is sent to the configured owner destination.
- Commands are not broadcast to groups.
- Command messages are not automatically deleted.
- `/clear` does not remove WhatsApp authentication credentials.
- Temporary media is automatically cleaned after its retention period.

### Protect your session

The `session/` directory contains authentication credentials and should be treated like a password.

**Never:**

- Upload `session/` to a public GitHub repository.
- Share `creds.json` publicly.
- Send your session files to strangers.
- Run the same session directory simultaneously on multiple servers.

If the session is intentionally compromised or logged out, remove the `session/` directory and pair the bot again.

Recommended `.gitignore` entries:

```gitignore
session/
tmp_media/
node_modules/
```

---

## 🩹 Troubleshooting

### ❌ Pairing code is not working

Try these steps:

1. Make sure the WhatsApp number in `settings.js` is correct.
2. Use international format without `+`, spaces or dashes.
3. Enter the pairing code only once.
4. Do not request multiple codes rapidly.
5. If running on a VPS, try pairing from a local/residential connection first.
6. If WhatsApp has invalidated the session, remove `session/` and pair again.

### ❌ Bot keeps reconnecting

Check the console for the WhatsApp disconnect status. Temporary network or WhatsApp handshake failures may trigger automatic reconnects.

Avoid starting multiple copies of the bot with the same `session/` directory.

### ❌ `/wow` does not forward anything

Make sure you are **replying directly to the view-once photo/video** when sending `/wow`.

The command is not designed to work as a standalone message without a quoted view-once message.

### ❌ `/OK` says a reply or mention is required

Reply to the target person's message or mention the person in the command message.

### ❌ `/hmm` says no recent story was found

The contact must have a recently captured status, and `autoStatusCapture` must be enabled.

```js
autoStatusCapture: true
```

The bot keeps the latest captured status for each contact only.

### ❌ `/clear` made me pair again

Under the current implementation, `/clear` does **not** remove the `session/` directory. If pairing is requested after `/clear`, investigate the WhatsApp session/connection separately rather than deleting the session automatically.

---

## 📦 Dependencies

This project currently uses:

- `@whiskeysockets/baileys` — WhatsApp Web protocol/client library
- `@hapi/boom` — Error/status handling
- `pino` — Logging

Install them with:

```bash
npm install
```

---

## ⚖️ License

**ISC License — personal/private use.**

This project is provided for personal automation. You are responsible for how you use it and for complying with applicable laws and WhatsApp's terms and policies.

---

<div align="center">

## ❤️ Credits

### Special Script Bot

**Designed, configured and maintained by Muaz**

**© 2026 Muaz — All Rights Reserved.**

GitHub: `deepweb-system/Script-Bot`

Telegram: `@ahsanhabibmuaz`

> ⓘ Special System by **Muaz**.

</div>
