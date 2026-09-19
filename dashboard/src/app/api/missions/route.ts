import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const ALLOWED_KINDS = new Set(['flash', 'riddle', 'daily', 'weekly']);

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { action?: string; kind?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  if (body.action === 'launch') {
    if (!body.kind || !ALLOWED_KINDS.has(body.kind)) {
      return NextResponse.json({ error: 'bad kind' }, { status: 400 });
    }
    const { error } = await supabase.from('dashboard_commands').insert({
      command: 'launch_mission',
      payload_json: { kind: body.kind },
      status: 'pending',
      created_by: session.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, queued: true });
  }

  if (body.action === 'end_all') {
    const { error } = await supabase.from('dashboard_commands').insert({
      command: 'end_all_missions',
      payload_json: {},
      status: 'pending',
      created_by: session.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, queued: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
