import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// Only keys we allow the dashboard to write to.
const ALLOWED_KEYS = new Set([
  'pulsar_config',
  'auto_quiz',
  'lottery_config',
  'welcome_config',
  'rank_up_config',
  'mod_config',
]);

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: { key?: string; patch?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }
  const key = body.key;
  const patch = body.patch ?? {};
  if (!key || !ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: 'key not allowed' }, { status: 400 });
  }

  // Merge with current value.
  const { data: existing } = await supabase.from('settings').select('value_json').eq('key', key).maybeSingle();
  const current = (existing?.value_json as Record<string, unknown>) ?? {};
  const merged = { ...current, ...patch };

  const { error } = await supabase.from('settings').upsert({ key, value_json: merged }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, value: merged });
}
