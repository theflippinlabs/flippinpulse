import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { settleBet } from '@/lib/play';
import { supabase } from '@/lib/supabase';

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

interface WagerRow { kind: BetKind; amount: number }

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

function multiplier(kind: BetKind): number {
  if (kind.type === 'straight') return 36; // 35:1 → 36× return
  if (kind.type === 'dozen' || kind.type === 'column') return 3; // 2:1
  return 2; // even-money
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

// Compact human label for the announce embed.
function label(kind: BetKind): string {
  if (kind.type === 'color') return kind.value === 'red' ? 'Rouge' : 'Noir';
  if (kind.type === 'parity') return kind.value === 'even' ? 'Pair' : 'Impair';
  if (kind.type === 'range') return kind.value === 'low' ? '1-18' : '19-36';
  if (kind.type === 'dozen') return `Douzaine ${kind.value}`;
  if (kind.type === 'column') return `Colonne ${kind.value}`;
  return `#${kind.value}`;
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));

  // Accept either a legacy single-wager payload or the new multi-bet array.
  const rawWagers = Array.isArray(body.wagers) ? body.wagers
    : body.wager ? [{ kind: body.wager, amount: body.bet ?? 25 }]
    : [];

  const wagers: WagerRow[] = [];
  for (const w of rawWagers) {
    const k = parseBet((w as Record<string, unknown>).kind);
    const amt = Math.floor(Number((w as Record<string, unknown>).amount ?? 0));
    if (!k || !Number.isFinite(amt) || amt <= 0) continue;
    wagers.push({ kind: k, amount: amt });
  }
  if (!wagers.length) return NextResponse.json({ error: 'Place at least one bet.' }, { status: 400 });

  const totalStake = wagers.reduce((s, w) => s + w.amount, 0);
  if (totalStake > 500) return NextResponse.json({ error: 'Total stake capped at 500 PULSE.' }, { status: 400 });

  const spin = Math.floor(Math.random() * 37);
  const results = wagers.map(w => {
    const hit = isWin(spin, w.kind);
    const payout = hit ? w.amount * multiplier(w.kind) : 0;
    return { kind: w.kind, amount: w.amount, hit, payout };
  });
  const totalPayout = results.reduce((s, r) => s + r.payout, 0);

  const settled = await settleBet(session.id, 'roulette', totalStake, totalPayout);
  if (!settled.ok) return NextResponse.json({ error: settled.error, balance: settled.balance }, { status: 400 });

  const net = totalPayout - totalStake;
  if (body.share && body.channel_id && net >= 500) {
    const winners = results.filter(r => r.hit).map(r => `${label(r.kind)} (+${r.payout})`).join(', ');
    await supabase.from('dashboard_commands').insert({
      command: 'announce',
      payload_json: {
        channel_id: body.channel_id,
        title: '🎡 Roulette big win!',
        message: `<@${session.id}> hit **${spin} ${color(spin)}** and won **+${net} PULSE** net · ${winners}`,
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
    totalStake,
    totalPayout,
    net,
    results,
    newBalance: settled.newBalance,
  });
}
