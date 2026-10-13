import { cookies } from 'next/headers';
import { getSession } from './auth';

// Single source of truth for "which Discord guild is this request about?".
// Resolution order (highest priority first):
//   1. The `novarys_guild` cookie set by the guild switcher — the Lord's
//      explicit choice, carried through every page load.
//   2. The session's first admin guild — so a Lord who just logged in and
//      hasn't picked yet still lands on something they own, not someone
//      else's server.
//   3. The DEFAULT_GUILD_ID env var — kept so the original single-tenant
//      deployment keeps working for the Lord who owns the Novarys workspace.

export const GUILD_COOKIE = 'novarys_guild';
export const DEFAULT_GUILD_ID_ENV = 'DEFAULT_GUILD_ID';

function fromSession(): string | null {
  const s = getSession();
  const first = s?.adminGuilds?.[0]?.id;
  return first ?? null;
}

function fromEnv(): string | null {
  return process.env[DEFAULT_GUILD_ID_ENV] ?? process.env.GUILD_ID ?? null;
}

function fromCookie(): string | null {
  const raw = cookies().get(GUILD_COOKIE)?.value;
  if (!raw) return null;
  // Discord IDs are decimal snowflakes between 15 and 20 digits — reject
  // anything else to avoid a bad cookie leaking into Supabase queries.
  if (!/^\d{15,20}$/.test(raw)) return null;
  return raw;
}

export function currentGuildId(): string {
  const g = fromCookie() ?? fromSession() ?? fromEnv();
  if (!g) throw new Error('No current guild — the Lord has no admin guild and no DEFAULT_GUILD_ID is set.');
  return g;
}

// Non-throwing variant for feature gates that should degrade gracefully
// instead of 500ing when a user without any guild hits the endpoint.
export function tryCurrentGuildId(): string | null {
  return fromCookie() ?? fromSession() ?? fromEnv();
}
