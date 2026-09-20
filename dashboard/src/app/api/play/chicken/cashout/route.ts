import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { settleBet } from '@/lib/play';
import { verifyGameToken } from '@/lib/gameToken';
import { supabase } from '@/lib/supabase';

function multiplierAt(elapsedMs: number): number {
  const t = elapsedMs / 1000;
  return Math.max(1, 1 + Math.pow(t, 1.18) / 6);
}

interface Payload {
  discord_id: string;
  bet: number;
  started_at_ms: number;
  crash_at_ms: number;
  crash_mult: number;
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token : '';
  const payload = verifyGameToken<Payload>(token);
  if (!payload) return NextResponse.json({ error: 'bad token' }, { status: 400 });
  if (payload.discord_id !== session.id) return NextResponse.json({ error: 'session mismatch' }, { status: 401 });

  const elapsed = Date.now() - payload.started_at_ms;
  if (elapsed >= payload.crash_at_ms) {
    // Too late — chicken already flew, no payout, bet stays debited.
    return NextResponse.json({
      crashed: true,
      crash_mult: payload.crash_mult,
      bet: payload.bet,
      payout: 0,
    });
  }

  const cashed_mult = multiplierAt(elapsed);
  const payout = Math.floor(payload.bet * cashed_mult);
  const settled = await settleBet(session.id, 'chicken_race_solo', 0, payout);
  if (!settled.ok) return NextResponse.json({ error: settled.error }, { status: 500 });

  if (body.share && body.channel_id && cashed_mult >= 3) {
    await supabase.from('dashboard_commands').insert({
      command: 'announce',
      payload_json: {
        channel_id: body.channel_id,
        title: '🐔 Chicken cash out!',
        message: `<@${session.id}> jumped off the chicken at **${cashed_mult.toFixed(2)}x** for **${payout} PULSE** — the chicken flew at ${payload.crash_mult.toFixed(2)}x 💨`,
        embed: true,
        ping: null,
      },
      status: 'pending',
      created_by: session.id,
    });
  }

  return NextResponse.json({
    crashed: false,
    cashed_mult,
    crash_mult: payload.crash_mult,
    bet: payload.bet,
    payout,
    newBalance: settled.newBalance,
  });
}
