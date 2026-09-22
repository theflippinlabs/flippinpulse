import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { sellCards } from '@/lib/tcg';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const cardId = Math.floor(Number(body.cardId ?? 0));
  const quantity = Math.floor(Number(body.quantity ?? 1));
  if (!cardId) return NextResponse.json({ error: 'bad_card_id' }, { status: 400 });
  const res = await sellCards(session.id, cardId, quantity);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ sold: res.sold, pulseEarned: res.pulseEarned, newBalance: res.newBalance });
}
