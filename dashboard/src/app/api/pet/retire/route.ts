import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { retirePet } from '@/lib/pets';
import { requirePlan } from '@/lib/planGate';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const gate = await requirePlan('pets');
  if (!gate.ok) return gate.response;
  const res = await retirePet(session.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ refund: res.refund });
}
