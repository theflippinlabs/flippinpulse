import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'novarys_session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload {
  id: string;
  username: string;
  avatar: string | null;
  iat: number;
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

// Any signed-in Discord user is a member. Used by the /app member area and
// its supporting API routes so a regular Discord user can play, buy, join
// tournaments and ask Novus. Separate from isAdmin, which gates the Lord
// command deck.
export function isMember(session: SessionPayload | null): session is SessionPayload {
  return session !== null;
}
