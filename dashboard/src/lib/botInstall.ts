// Discord permission bitmask the bot needs on install. Keep as narrow as
// possible so a Lord doesn't balk at the install screen.
//   VIEW_CHANNEL           = 0x400
//   SEND_MESSAGES          = 0x800
//   MANAGE_MESSAGES        = 0x2000       (delete scam links, pin events)
//   EMBED_LINKS            = 0x4000
//   ATTACH_FILES           = 0x8000
//   READ_MESSAGE_HISTORY   = 0x10000
//   ADD_REACTIONS          = 0x40
//   USE_EXTERNAL_EMOJIS    = 0x40000
//   MANAGE_ROLES           = 0x10000000   (grant battle-pass / cosmetic roles)
//   MANAGE_NICKNAMES       = 0x8000000    (title cosmetics)
//   KICK_MEMBERS           = 0x2          (automod)
//   BAN_MEMBERS            = 0x4          (automod)
//   MODERATE_MEMBERS       = 0x10000000000 (timeout for automod + /jail)
//   MANAGE_CHANNELS        = 0x10         (/setup can create the jail channel)
const PERMS =
  0x400n | 0x800n | 0x2000n | 0x4000n | 0x8000n | 0x10000n | 0x40n | 0x40000n |
  0x10000000n | 0x8000000n | 0x2n | 0x4n | 0x10000000000n | 0x10n;

export function botInstallUrl(opts: { preselectGuildId?: string } = {}): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return null;
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', 'bot applications.commands');
  url.searchParams.set('permissions', PERMS.toString());
  if (opts.preselectGuildId) {
    url.searchParams.set('guild_id', opts.preselectGuildId);
    url.searchParams.set('disable_guild_select', 'false');
  }
  return url.toString();
}
