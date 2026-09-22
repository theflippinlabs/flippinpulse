import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const opponentId = String(body.opponentId ?? '');
  const cardCode = String(body.cardCode ?? '');
  const wager = Math.max(0, Math.min(10_000, Math.floor(Number(body.wager ?? 0))));
  const channelId = String(body.channelId ?? '');
  if (!/^\d{15,20}$/.test(opponentId)) return NextResponse.json({ error: 'bad_opponent' }, { status: 400 });
  if (opponentId === session.id) return NextResponse.json({ error: 'self_challenge' }, { status: 400 });
  if (!cardCode.trim()) return NextResponse.json({ error: 'bad_card' }, { status: 400 });
  if (!channelId) return NextResponse.json({ error: 'no_channel' }, { status: 400 });
  const { error } = await supabase.from('dashboard_commands').insert({
    command: 'card_challenge',
    payload_json: { challenger_id: session.id, opponent_id: opponentId, card_code: cardCode.trim(), wager, channel_id: channelId },
    status: 'pending',
    created_by: session.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
