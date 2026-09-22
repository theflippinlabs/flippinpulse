import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { actionOnPet } from '@/lib/pets';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (!['feed', 'play', 'train'].includes(action)) return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  const res = await actionOnPet(session.id, action);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ pet: res.pet, leveledUp: res.leveledUp, cost: res.cost });
}
