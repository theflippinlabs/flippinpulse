import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, canManageGuild } from '@/lib/auth';
import { GUILD_COOKIE } from '@/lib/guildContext';

export const dynamic = 'force-dynamic';

/**
 * Sets the active guild cookie so every subsequent request scopes to that
 * guild. Refuses if the signed-in session can't manage the target guild —
 * no cross-tenant access via a crafted cookie.
 */
export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const guildId = String(body.guildId ?? '');
  if (!/^\d{15,20}$/.test(guildId)) return NextResponse.json({ error: 'bad_guild' }, { status: 400 });
  if (!canManageGuild(session, guildId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  cookies().set({
    name: GUILD_COOKIE,
    value: guildId,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return NextResponse.json({ ok: true, guildId });
}
