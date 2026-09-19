import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirect = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirect) {
    return NextResponse.json({ error: 'Discord OAuth not configured.' }, { status: 500 });
  }
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify');
  return NextResponse.redirect(url.toString());
}
