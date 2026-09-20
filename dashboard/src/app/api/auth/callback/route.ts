import { NextRequest, NextResponse } from 'next/server';
import { isAdmin, setSessionCookie } from '@/lib/auth';

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

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/?error=missing_code', req.url));

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
  await setSessionCookie({
    id: user.id,
    username: user.global_name ?? user.username,
    avatar: user.avatar,
    iat: Date.now(),
  });
  // Lords land on the command deck; regular members land on their app.
  return NextResponse.redirect(new URL(isAdmin(user.id) ? '/dashboard' : '/app', req.url));
}
