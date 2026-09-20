import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { settleBet } from '@/lib/play';
import { drawCard, handTotal, isBlackjack } from '@/lib/blackjack';
import { signGameToken } from '@/lib/gameToken';

interface Payload {
  discord_id: string;
  bet: number;
  player: string[];
  dealer: string[];
  created_at: number;
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const bet = Math.max(1, Math.min(500, Math.floor(Number(body.bet ?? 25))));

  // Deduct the stake up-front. Payout comes on stand/bust via /action.
  const settled = await settleBet(session.id, 'blackjack', bet, 0);
  if (!settled.ok) return NextResponse.json({ error: settled.error, balance: settled.balance }, { status: 400 });

  const player = [drawCard(), drawCard()];
  const dealer = [drawCard(), drawCard()];

  // Both have blackjack → push. Player alone has BJ → 3:2 payout, hand ends
  // immediately. We handle that here to save a round-trip.
  const playerBJ = isBlackjack(player);
  const dealerBJ = isBlackjack(dealer);
  if (playerBJ || dealerBJ) {
    let payout = 0;
    if (playerBJ && dealerBJ) payout = bet;              // push, refund
    else if (playerBJ) payout = Math.floor(bet * 2.5);   // 3:2
    // dealer-only BJ → payout stays 0
    if (payout > 0) {
      const finalize = await settleBet(session.id, 'blackjack', 0, payout);
      if (finalize.ok) {
        return NextResponse.json({
          done: true,
          bet, payout,
          player, dealer,
          playerTotal: handTotal(player).total,
          dealerTotal: handTotal(dealer).total,
          outcome: playerBJ && dealerBJ ? 'push' : 'blackjack',
          newBalance: finalize.newBalance,
        });
      }
    }
    return NextResponse.json({
      done: true,
      bet, payout,
      player, dealer,
      playerTotal: handTotal(player).total,
      dealerTotal: handTotal(dealer).total,
      outcome: playerBJ && dealerBJ ? 'push' : (playerBJ ? 'blackjack' : 'dealer_blackjack'),
      newBalance: settled.newBalance,
    });
  }

  const payload: Payload = {
    discord_id: session.id,
    bet,
    player,
    dealer,
    created_at: Date.now(),
  };
  const token = signGameToken(payload);

  return NextResponse.json({
    done: false,
    token,
    bet,
    player,
    // Hide the dealer's hole card — reveal only the up-card so anti-cheat
    // stays honest even if someone opens devtools.
    dealerUpCard: dealer[0],
    playerTotal: handTotal(player).total,
    newBalance: settled.newBalance,
    canDouble: bet * 2 <= settled.newBalance + bet, // enough for double
  });
}
