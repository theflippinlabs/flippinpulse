import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { settleBet } from '@/lib/play';
import { supabase } from '@/lib/supabase';

// European roulette wheel order, starting from 0 clockwise. Used purely for
// visual: the ball spinning animation lines up on the correct pocket.
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function color(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  return RED.has(n) ? 'red' : 'black';
}

type BetKind =
  | { type: 'color'; value: 'red' | 'black' }
  | { type: 'parity'; value: 'even' | 'odd' }
  | { type: 'range'; value: 'low' | 'high' }
  | { type: 'dozen'; value: 1 | 2 | 3 }
  | { type: 'column'; value: 1 | 2 | 3 }
  | { type: 'straight'; value: number };

function parseBet(b: unknown): BetKind | null {
  if (!b || typeof b !== 'object') return null;
  const anyB = b as Record<string, unknown>;
  const t = anyB.type;
  const v = anyB.value;
  if (t === 'color' && (v === 'red' || v === 'black')) return { type: 'color', value: v };
  if (t === 'parity' && (v === 'even' || v === 'odd')) return { type: 'parity', value: v };
  if (t === 'range' && (v === 'low' || v === 'high')) return { type: 'range', value: v };
  if (t === 'dozen' && (v === 1 || v === 2 || v === 3)) return { type: 'dozen', value: v };
  if (t === 'column' && (v === 1 || v === 2 || v === 3)) return { type: 'column', value: v };
  if (t === 'straight' && typeof v === 'number' && v >= 0 && v <= 36 && Number.isInteger(v)) {
    return { type: 'straight', value: v };
  }
  return null;
}

// Multiplier for a win, in "total returned per unit staked" (so 2 means you
// get bet back plus the same amount, net +bet).
function multiplier(kind: BetKind): number {
  if (kind.type === 'straight') return 36; // 35:1 → 36× return
  if (kind.type === 'dozen' || kind.type === 'column') return 3; // 2:1 → 3× return
  return 2; // even-money bets: 1:1 → 2× return
}

function isWin(n: number, kind: BetKind): boolean {
  if (n === 0) return kind.type === 'straight' && kind.value === 0;
  if (kind.type === 'color') return color(n) === kind.value;
  if (kind.type === 'parity') return kind.value === 'even' ? n % 2 === 0 : n % 2 === 1;
  if (kind.type === 'range') return kind.value === 'low' ? n <= 18 : n >= 19;
  if (kind.type === 'dozen') {
    if (kind.value === 1) return n <= 12;
    if (kind.value === 2) return n >= 13 && n <= 24;
    return n >= 25;
  }
  if (kind.type === 'column') return n % 3 === (kind.value === 3 ? 0 : kind.value);
  return n === kind.value;
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const bet = Math.max(1, Math.min(500, Math.floor(Number(body.bet ?? 25))));
  const kind = parseBet(body.wager);
  if (!kind) return NextResponse.json({ error: 'Invalid bet.' }, { status: 400 });

  const spin = Math.floor(Math.random() * 37); // 0..36 inclusive
  const won = isWin(spin, kind);
  const payout = won ? bet * multiplier(kind) : 0;

  const settled = await settleBet(session.id, 'roulette', bet, payout);
  if (!settled.ok) return NextResponse.json({ error: settled.error, balance: settled.balance }, { status: 400 });

  const net = payout - bet;
  if (body.share && body.channel_id && net >= 500) {
    await supabase.from('dashboard_commands').insert({
      command: 'announce',
      payload_json: {
        channel_id: body.channel_id,
        title: '🎡 Roulette big win!',
        message: `<@${session.id}> hit **${spin} ${color(spin)}** and won **+${net} PULSE** on ${kind.type}! 💸`,
        embed: true,
        ping: null,
      },
      status: 'pending',
      created_by: session.id,
    });
  }

  return NextResponse.json({
    spin,
    color: color(spin),
    won,
    bet,
    payout,
    multiplier: multiplier(kind),
    newBalance: settled.newBalance,
  });
}
