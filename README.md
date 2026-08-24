# Special Script Bot

Private-use WhatsApp automation bot built with Node.js + Baileys.

## Commands

Command names are configured in `lib/cmd.js`.

- `/menu` — menu with bot image
- `/OK` — profile picture (reply/mention)
- `/hmm` — fetch captured story (reply/mention)
- `/wow` — manually forward a view-once photo/video by replying to it
- `/clear` — clear temporary files/cache while preserving the WhatsApp session
- `/owner` — owner information with owner's photo

Successful commands react to the command message using `commandReaction` from `settings.js`. Command text is never deleted.


## Configuration

- `settings.js` — bot name, owner number, reaction emoji and feature toggles
- `lib/cmd.js` — command text
- `lib/store.js` — temporary/session cleanup and local cache

### Important

`/clear` only removes temp files.
