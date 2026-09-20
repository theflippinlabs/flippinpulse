import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { settleBet } from '@/lib/play';
import { signGameToken } from '@/lib/gameToken';

// Same curves as the bot's Chicken Race:
// multiplier(t_seconds) = 1 + t^1.18 / 6
function multiplierAt(elapsedMs: number): number {
  const t = elapsedMs / 1000;
  return Math.max(1, 1 + Math.pow(t, 1.18) / 6);
}

function elapsedToReach(target: number): number {
  const raw = (target - 1) * 6;
  return Math.pow(Math.max(0, raw), 1 / 1.18) * 1000;
}

function rollCrashPoint(): number {
  const r = Math.random();
  if (r < 0.02) return 1.0;
  const u = Math.random();
  const mult = Math.max(1.05, 1 / (1 - u * 0.98));
  return Math.min(mult, 50);
}

export interface ChickenPayload {
  discord_id: string;
  bet: number;
  started_at_ms: number;
  crash_at_ms: number;
  crash_mult: number;
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const bet = Math.max(1, Math.min(500, Math.floor(Number(body.bet ?? 25))));

  const settled = await settleBet(session.id, 'chicken_race_solo', bet, 0);
  if (!settled.ok) return NextResponse.json({ error: settled.error, balance: settled.balance }, { status: 400 });

  const crash_mult = rollCrashPoint();
  const crash_at_ms = elapsedToReach(crash_mult);
  const started_at_ms = Date.now();

  const token = signGameToken<ChickenPayload>({
    discord_id: session.id,
    bet,
    started_at_ms,
    crash_at_ms,
    crash_mult,
  });

  return NextResponse.json({
    token,
    bet,
    started_at_ms,
    crash_at_ms,       // client uses this to know when to animate the chicken flying
    crash_mult,        // and what multiplier to display when it flies
    newBalance: settled.newBalance,
    curve: { formula: '1 + (t^1.18)/6' },
    starter_multiplier: multiplierAt(0),
  });
}
