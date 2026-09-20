import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { pickWeighted, settleBet, getBalance } from '@/lib/play';
import { supabase } from '@/lib/supabase';
import { slotsAnnounce, pickLocale } from '@/lib/gameAnnounce';

const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];
const WEIGHTS = [30, 25, 20, 15, 6, 3, 1];
const PAYOUTS = {
  three_seven: 50,
  three_diamond: 20,
  three_star: 10,
  three_other: 5,
  two_match: 1.5,
};

function computePayout(reels: string[], bet: number): number {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    if (a === '7️⃣') return bet * PAYOUTS.three_seven;
    if (a === '💎') return bet * PAYOUTS.three_diamond;
    if (a === '⭐') return bet * PAYOUTS.three_star;
    return bet * PAYOUTS.three_other;
  }
  if (a === b || b === c || a === c) return Math.floor(bet * PAYOUTS.two_match);
  return 0;
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const bet = Math.max(1, Math.min(500, Math.floor(Number(body.bet ?? 10))));

  const reels = [
    pickWeighted(SYMBOLS, WEIGHTS),
    pickWeighted(SYMBOLS, WEIGHTS),
    pickWeighted(SYMBOLS, WEIGHTS),
  ];
  const payout = computePayout(reels, bet);
  const settled = await settleBet(session.id, 'slots', bet, payout);
  if (!settled.ok) return NextResponse.json({ error: settled.error, balance: settled.balance }, { status: 400 });

  // Optional: share to Discord — client controls via body.share.
  // Only announce real wins (net gain of at least 5× the bet).
  const net = payout - bet;
  if (body.share && body.channel_id && net >= bet * 5) {
    const multiplier = payout / bet;
    const { title, message } = slotsAnnounce(pickLocale(body), {
      userId: session.id, multi: multiplier, net, reels,
    });
    await supabase.from('dashboard_commands').insert({
      command: 'announce',
      payload_json: { channel_id: body.channel_id, title, message, embed: true, ping: null },
      status: 'pending',
      created_by: session.id,
    });
  }

  return NextResponse.json({
    reels,
    bet,
    payout,
    net: payout - bet,
    newBalance: settled.newBalance,
  });
}

export async function GET() {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const balance = await getBalance(session.id);
  return NextResponse.json({ balance });
}
