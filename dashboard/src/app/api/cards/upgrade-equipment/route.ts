import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { upgradeEquipment } from '@/lib/tcg';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const cardId = Math.floor(Number(body.cardId));
  const level = Math.floor(Number(body.level));
  if (!Number.isFinite(cardId) || cardId <= 0) return NextResponse.json({ error: 'bad_card' }, { status: 400 });
  if (!Number.isFinite(level) || level < 1) return NextResponse.json({ error: 'bad_level' }, { status: 400 });

  const res = await upgradeEquipment(session.id, cardId, level);
  if (!res.ok) return NextResponse.json({ error: res.error ?? 'upgrade_failed' }, { status: 400 });
  return NextResponse.json({ ok: true, toLevel: res.toLevel });
}
