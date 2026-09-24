import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';

// Random URL-safe token stored in an HTTP-only cookie and echoed as the
// OAuth `state` parameter. The callback verifies the two match — that stops
// the "attacker starts OAuth, hands the code to a victim" session-fixation
// class of attack.
const STATE_COOKIE = 'novarys_oauth_state';
const STATE_TTL_S = 10 * 60;

export async function GET() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirect = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirect) {
    return NextResponse.json({ error: 'Discord OAuth not configured.' }, { status: 500 });
  }
  const state = randomBytes(32).toString('base64url');
  cookies().set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: STATE_TTL_S,
  });
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify');
  url.searchParams.set('state', state);
  return NextResponse.redirect(url.toString());
}
