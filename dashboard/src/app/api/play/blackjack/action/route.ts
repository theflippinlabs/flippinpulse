import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { settleBet } from '@/lib/play';
import { drawCard, handTotal, dealerShouldHit } from '@/lib/blackjack';
import { signGameToken, verifyGameToken } from '@/lib/gameToken';

interface Payload {
  discord_id: string;
  bet: number;
  player: string[];
  dealer: string[];
  created_at: number;
}

const MAX_HAND_AGE_MS = 10 * 60_000; // 10 minutes; enough for slow players

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const token = body.token;
  if (typeof token !== 'string' || (action !== 'hit' && action !== 'stand' && action !== 'double')) {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const state = verifyGameToken<Payload>(token);
  if (!state) return NextResponse.json({ error: 'Invalid or expired hand.' }, { status: 400 });
  if (state.discord_id !== session.id) return NextResponse.json({ error: 'Wrong session.' }, { status: 403 });
  if (Date.now() - state.created_at > MAX_HAND_AGE_MS) {
    return NextResponse.json({ error: 'Hand expired. Deal a new one.' }, { status: 400 });
  }

  const player = [...state.player];
  const dealer = [...state.dealer];
  let bet = state.bet;

  // --- HIT ---
  if (action === 'hit') {
    player.push(drawCard());
    const pt = handTotal(player).total;
    if (pt > 21) {
      // Bust — no payout, hand ends.
      return NextResponse.json({
        done: true,
        outcome: 'bust',
        bet, payout: 0,
        player, dealer,
        playerTotal: pt,
        dealerTotal: handTotal(dealer).total,
        newBalance: await currentBalance(session.id),
      });
    }
    if (pt === 21) {
      // Auto-stand on 21 for a snappier UX; fall through to dealer play.
      return finishHand(session.id, bet, player, dealer);
    }
    // Still playable — re-sign the state.
    const nextToken = signGameToken<Payload>({
      discord_id: session.id, bet, player, dealer, created_at: state.created_at,
    });
    return NextResponse.json({
      done: false, token: nextToken,
      player, dealerUpCard: dealer[0], playerTotal: pt,
    });
  }

  // --- DOUBLE ---
  if (action === 'double') {
    const extra = await settleBet(session.id, 'blackjack', bet, 0);
    if (!extra.ok) {
      return NextResponse.json({ error: extra.error, balance: extra.balance }, { status: 400 });
    }
    bet *= 2;
    player.push(drawCard());
    const pt = handTotal(player).total;
    if (pt > 21) {
      return NextResponse.json({
        done: true,
        outcome: 'bust',
        bet, payout: 0,
        player, dealer,
        playerTotal: pt,
        dealerTotal: handTotal(dealer).total,
        newBalance: extra.newBalance,
      });
    }
    return finishHand(session.id, bet, player, dealer);
  }

  // --- STAND ---
  return finishHand(session.id, bet, player, dealer);
}

async function finishHand(discordId: string, bet: number, player: string[], dealer: string[]) {
  const playerTotal = handTotal(player).total;
  // Dealer plays out.
  while (dealerShouldHit(dealer)) dealer.push(drawCard());
  const dealerTotal = handTotal(dealer).total;

  let outcome: 'win' | 'lose' | 'push';
  let payout = 0;
  if (dealerTotal > 21 || playerTotal > dealerTotal) {
    outcome = 'win';
    payout = bet * 2;
  } else if (playerTotal === dealerTotal) {
    outcome = 'push';
    payout = bet;
  } else {
    outcome = 'lose';
  }

  const settle = await settleBet(discordId, 'blackjack', 0, payout);
  const newBalance = settle.ok ? settle.newBalance : await currentBalance(discordId);
  return NextResponse.json({
    done: true, outcome, bet, payout,
    player, dealer, playerTotal, dealerTotal, newBalance,
  });
}

async function currentBalance(discordId: string): Promise<number> {
  const { supabase } = await import('@/lib/supabase');
  const { data } = await supabase
    .from('discord_users').select('balance_pulse').eq('discord_id', discordId).maybeSingle();
  return (data as { balance_pulse?: number } | null)?.balance_pulse ?? 0;
}
