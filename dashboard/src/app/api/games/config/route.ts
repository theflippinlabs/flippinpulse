import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: { game_key?: string; patch?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const key = body.game_key;
  const patch = body.patch ?? {};
  if (!key || typeof patch !== 'object') {
    return NextResponse.json({ error: 'game_key and patch required' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('games_config')
    .select('config_json')
    .eq('game_key', key)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'game not found' }, { status: 404 });

  const current = (existing.config_json as Record<string, unknown>) ?? {};
  const merged = { ...current, ...patch };

  const { error } = await supabase
    .from('games_config')
    .update({ config_json: merged, updated_at: new Date().toISOString() })
    .eq('game_key', key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, config: merged });
}
