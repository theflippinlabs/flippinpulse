import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { buyPremium } from '@/lib/battlePass';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const res = await buyPremium(session.id);
  if (res.alreadyOwned) return NextResponse.json({ error: 'already_owned' }, { status: 400 });
  if (!res.ok) return NextResponse.json({ error: res.error ?? 'purchase_failed' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
