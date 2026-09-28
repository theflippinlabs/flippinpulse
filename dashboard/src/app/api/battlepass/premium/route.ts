import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { buyPremium } from '@/lib/battlePass';
import { requirePlan } from '@/lib/planGate';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const gate = await requirePlan('battle_pass');
  if (!gate.ok) return gate.response;
  const res = await buyPremium(session.id);
  if (res.alreadyOwned) return NextResponse.json({ error: 'already_owned' }, { status: 400 });
  if (!res.ok) return NextResponse.json({ error: res.error ?? 'purchase_failed' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
