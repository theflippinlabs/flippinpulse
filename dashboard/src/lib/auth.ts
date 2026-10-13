import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'novarys_session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionGuild {
  id: string;
  name: string;
  icon: string | null;
}

export interface SessionPayload {
  id: string;
  username: string;
  avatar: string | null;
  iat: number;
  // Guilds where the user has MANAGE_GUILD (or is owner). Populated at
  // OAuth callback from /users/@me/guilds, filtered to admin guilds only
  // to keep the cookie under the 4 KB limit. Members (non-admin) aren't
  // stored here — they land on /app and don't need guild awareness yet.
  adminGuilds?: SessionGuild[];
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET missing or too short (need ≥ 16 chars).');
  return s;
}

function sign(input: string): string {
  return createHmac('sha256', secret()).update(input).digest('base64url');
}

export function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string): SessionPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (Date.now() - raw.iat > MAX_AGE * 1000) return null;
    return raw;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = encodeSession(payload);
  cookies().set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie(): void {
  cookies().set({ name: COOKIE_NAME, value: '', maxAge: 0, path: '/' });
}

export function getSession(): SessionPayload | null {
  const c = cookies().get(COOKIE_NAME)?.value;
  if (!c) return null;
  return decodeSession(c);
}

export function isAdmin(userId: string): boolean {
  const ids = (process.env.DASHBOARD_ADMIN_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return ids.includes(userId);
}

// Returns true when the current session can administrate the given guild.
// A session can administrate a guild when the guild appears in its
// adminGuilds list — which only ever contains guilds where the user is
// the owner or holds MANAGE_GUILD. The legacy env-based isAdmin() is kept
// as a fallback so the original single-tenant hard-coded Lord ids still
// pass; new Lords get in strictly through the per-guild gate.
export function canManageGuild(session: SessionPayload | null, guildId: string | null | undefined): boolean {
  if (!session || !guildId) return false;
  if (isAdmin(session.id)) return true;
  return (session.adminGuilds ?? []).some(g => g.id === guildId);
}

// All guilds the current session can administrate. For the guild switcher.
export function sessionAdminGuilds(session: SessionPayload | null): SessionGuild[] {
  return session?.adminGuilds ?? [];
}

// Any signed-in Discord user is a member. Used by the /app member area and
// its supporting API routes so a regular Discord user can play, buy, join
// tournaments and ask Novus. Separate from isAdmin, which gates the Lord
// command deck.
export function isMember(session: SessionPayload | null): session is SessionPayload {
  return session !== null;
}
