import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { fuse } from '@/lib/tcg';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.cardIds) ? body.cardIds.map((x: unknown) => Math.floor(Number(x))).filter((x: number) => Number.isFinite(x) && x > 0) : [];
  if (ids.length !== 3) return NextResponse.json({ error: 'need_3_cards' }, { status: 400 });
  const res = await fuse(session.id, ids);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ consumed: res.consumed, result: res.result });
}
