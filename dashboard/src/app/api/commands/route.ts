import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const ALLOWED = new Set([
  'announce', 'grant_pulse', 'revoke_pulse', 'release_jail',
  'create_tournament', 'novus_post_now', 'launch_mission', 'end_all_missions',
  'force_lottery_draw',
  'create_giveaway', 'bulk_drop',
]);

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { command?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const command = body.command;
  const payload = body.payload ?? {};
  if (!command || !ALLOWED.has(command)) {
    return NextResponse.json({ error: 'unknown command' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('dashboard_commands')
    .insert({
      command,
      payload_json: payload,
      status: 'pending',
      created_by: session.id,
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id, queued: true });
}

export async function GET(req: NextRequest) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { data } = await supabase
    .from('dashboard_commands')
    .select('id, command, status, error, processed_at')
    .eq('id', id)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(data);
}
