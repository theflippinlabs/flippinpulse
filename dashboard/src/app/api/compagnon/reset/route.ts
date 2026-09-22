import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { clearHistory } from '@/lib/aiCompanion';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await clearHistory(session.id);
  return NextResponse.json({ ok: true });
}
