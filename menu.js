const settings = require('./settings');
const commands = require('./lib/cmd');

const label = v => Array.isArray(v) ? v[0] : v;

function getMenuText() {
  return `═════      *${settings.commandReaction || '🍭'} ${settings.botName}*     ════
_A private WhatsApp mini bot made for self security and safety purposes; with totally anonymous commands that trigger useful information._
════════════════════

•── Available Commands ──•

╔═══════ ≪ 💜 ≫ ═══════╗
║ 📃 ➤ *${label(commands.menu)}*     (show menu)
║ 🆘 ➤ *${label(commands.help)}*     (command help)
║ 🖼 ➤ *${label(commands.profilePicture)}*  <reply / @tag>
║ 📥 ➤ *${label(commands.story)}*     <reply to story>
║ 📸 ➤ *${label(commands.viewOnce)}*  <reply to v.once>
║ 🗑 ➤ *${label(commands.clear)}*     (clear tmp files)
║ 🔐 ➤ *${label(commands.owner)}*     (owner info)
║ 🛡️ ➤ *${label(commands.antiDelete)}* <on/off>
║ ✏️ ➤ *${label(commands.antiEdit)}*   <on/off>
║ 🎵 ➤ *${label(commands.song)}*       <song name>
║ 🔄 ➤ *${label(commands.resetAntiDelete)}* (DM reset)
║ 🔄 ➤ *${label(commands.resetAntiEdit)}*   (DM reset)
╚════════════════════╝

Created by ©Ahsan Habib Muaz`;
}

function getHelpText() {
  return `•── Command Details ──•

• ${label(commands.menu)} = Show commands menu.

• ${label(commands.help)} = Explain bot commands and features.

• ${label(commands.profilePicture)} = Fetch another person's DP by replying to their message or mentioning them.

• ${label(commands.story)} = Capture a story by replying to that person's story message.

• ${label(commands.viewOnce)} = Capture a view-once photo/video by replying to it.

• ${label(commands.clear)} = Clear temporary cached files without touching WhatsApp session credentials.

• ${label(commands.owner)} = Show owner information and contact.

• ${label(commands.antiDelete)} <on/off> = Turn deleted-message recovery on/off for this group or person.

• ${label(commands.resetAntiDelete)} = Reset all Anti-Delete group/person settings (DM only).

• ${label(commands.antiEdit)} <on/off> = Turn edited-message recovery on/off for this group or person.

• ${label(commands.resetAntiEdit)} = Reset all Anti-Edit group/person settings (DM only).

• ${label(commands.song)} <song name> = Download and send audio only from YouTube.`;
}
module.exports = { getMenuText, getHelpText };
