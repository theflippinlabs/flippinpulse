import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { game_key?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const key = body.game_key;
  const enabled = body.enabled;
  if (!key || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'game_key and enabled required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('games_config')
    .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('game_key', key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
