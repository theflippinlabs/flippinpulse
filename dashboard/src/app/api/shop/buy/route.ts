import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { purchase } from '@/lib/shop';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const itemId = typeof body.item_id === 'string' ? body.item_id : '';
  if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 });

  const result = await purchase(session.id, itemId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
