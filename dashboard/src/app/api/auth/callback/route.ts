import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { isAdmin, setSessionCookie, type SessionGuild } from '@/lib/auth';

const STATE_COOKIE = 'novarys_oauth_state';
// Discord permission bit — leave in hex for readability. 0x20 = MANAGE_GUILD.
const PERM_MANAGE_GUILD = 0x20n;
// Cap the stored admin-guild list; most users have <10 admin guilds, 25
// keeps the session cookie well under 4 KB even for the heaviest cases.
const MAX_ADMIN_GUILDS = 25;

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string;
  avatar: string | null;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string; // decimal string of a permissions bitfield
}

function isAdminGuild(g: DiscordGuild): boolean {
  if (g.owner) return true;
  try {
    return (BigInt(g.permissions) & PERM_MANAGE_GUILD) === PERM_MANAGE_GUILD;
  } catch {
    return false;
  }
}

function clearStateCookie(): void {
  cookies().set({ name: STATE_COOKIE, value: '', maxAge: 0, path: '/' });
}

function verifyState(param: string | null): boolean {
  const stored = cookies().get(STATE_COOKIE)?.value;
  if (!stored || !param) return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(param);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!code) {
    clearStateCookie();
    return NextResponse.redirect(new URL('/?error=missing_code', req.url));
  }
  if (!verifyState(state)) {
    // State mismatch → potential CSRF / session fixation. Refuse.
    clearStateCookie();
    return NextResponse.redirect(new URL('/?error=state_mismatch', req.url));
  }
  clearStateCookie();

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirect = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirect) {
    return NextResponse.redirect(new URL('/?error=oauth_not_configured', req.url));
  }

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect,
    }),
  });
  if (!tokenRes.ok) return NextResponse.redirect(new URL('/?error=token_exchange', req.url));

  const tokens = (await tokenRes.json()) as DiscordTokenResponse;

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) return NextResponse.redirect(new URL('/?error=userinfo', req.url));

  const user = (await userRes.json()) as DiscordUser;

  // Pull the user's admin guilds — the ones they can actually install Novarys
  // on and buy a plan for. Failure here is non-fatal: the user still signs
  // in, their session just has no admin guilds and they land on /app.
  let adminGuilds: SessionGuild[] = [];
  try {
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (guildsRes.ok) {
      const list = (await guildsRes.json()) as DiscordGuild[];
      adminGuilds = list
        .filter(isAdminGuild)
        .slice(0, MAX_ADMIN_GUILDS)
        .map(g => ({ id: g.id, name: g.name.slice(0, 60), icon: g.icon }));
    }
  } catch {
    // Ignore — the user can still browse /app without an admin-guild list.
  }

  await setSessionCookie({
    id: user.id,
    username: user.global_name ?? user.username,
    avatar: user.avatar,
    iat: Date.now(),
    adminGuilds,
  });

  // Routing priority: legacy env Lord → /dashboard. New Lord with at least
  // one admin guild → /dashboard (so they can install the bot there). Pure
  // member with nothing to manage → /app.
  const hasAdmin = isAdmin(user.id) || adminGuilds.length > 0;
  return NextResponse.redirect(new URL(hasAdmin ? '/dashboard' : '/app', req.url));
}
