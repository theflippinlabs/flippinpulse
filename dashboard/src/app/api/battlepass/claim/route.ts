import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { claimPending } from '@/lib/battlePass';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const res = await claimPending(session.id);
  if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ claimed: res.claimed });
}
