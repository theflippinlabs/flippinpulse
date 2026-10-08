import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { requirePlan } from '@/lib/planGate';
import { unlockSlot } from '@/lib/tcgSlots';
import type { EquipmentSlot } from '@/lib/tcgShared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const gate = await requirePlan('trading_cards');
  if (!gate.ok) return gate.response;
  const body = await req.json().catch(() => ({}));
  const slot = String(body.slot ?? '') as EquipmentSlot;
  const res = await unlockSlot(session.id, slot);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true, cost: res.cost, unlocked: res.unlocked });
}
