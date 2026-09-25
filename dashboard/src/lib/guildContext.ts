// Single source of truth for "which Discord guild is this request about?".
// The dashboard doesn't yet let a member switch between multiple guilds
// (there is only one deployment today), so we fall back to the DEFAULT_GUILD_ID
// env var. As soon as multi-tenant onboarding lands, the switcher will write
// the current guild into the session cookie and this helper will read it
// from there.

export const DEFAULT_GUILD_ID_ENV = 'DEFAULT_GUILD_ID';

export function currentGuildId(): string {
  const g = process.env[DEFAULT_GUILD_ID_ENV] ?? process.env.GUILD_ID ?? '';
  if (!g) throw new Error(`${DEFAULT_GUILD_ID_ENV} not set — every server-side call needs a guild scope.`);
  return g;
}

// Same helper but non-throwing — feature-gates that need to degrade
// gracefully call this instead.
export function tryCurrentGuildId(): string | null {
  return process.env[DEFAULT_GUILD_ID_ENV] ?? process.env.GUILD_ID ?? null;
}
