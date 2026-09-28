import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { openPack } from '@/lib/tcg';
import { requirePlan } from '@/lib/planGate';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const gate = await requirePlan('trading_cards');
  if (!gate.ok) return gate.response;
  const res = await openPack(session.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ pulled: res.pulled, newBalance: res.newBalance });
}
