import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { clearHistory } from '@/lib/aiCompanion';
import { requirePlan } from '@/lib/planGate';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const gate = await requirePlan('ai_companion');
  if (!gate.ok) return gate.response;
  await clearHistory(session.id);
  return NextResponse.json({ ok: true });
}
