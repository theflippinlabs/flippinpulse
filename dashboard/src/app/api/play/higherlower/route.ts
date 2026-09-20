import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { settleBet } from '@/lib/play';
import { supabase } from '@/lib/supabase';
import { higherLowerAnnounce, pickLocale } from '@/lib/gameAnnounce';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const bet = Math.max(1, Math.min(500, Math.floor(Number(body.bet ?? 25))));
  const seed = Math.max(1, Math.min(99, Math.floor(Number(body.seed ?? 50))));
  const choice: 'higher' | 'lower' = body.choice === 'lower' ? 'lower' : 'higher';

  // Roll a second d100 that is NOT equal to seed (re-roll on tie).
  let roll: number;
  do { roll = Math.floor(Math.random() * 100) + 1; } while (roll === seed);

  const won = choice === 'higher' ? roll > seed : roll < seed;
  // Payout scales with confidence: seed near center = 2x, near edges = higher/lower risk.
  // Base 2x, adjusted by the odds of the pick.
  const winProb = choice === 'higher' ? (100 - seed) / 99 : (seed - 1) / 99;
  const multi = won ? Math.max(1.1, Math.round((1 / winProb) * 0.95 * 100) / 100) : 0;
  const payout = won ? Math.floor(bet * multi) : 0;

  const settled = await settleBet(session.id, 'higherlower', bet, payout);
  if (!settled.ok) return NextResponse.json({ error: settled.error, balance: settled.balance }, { status: 400 });

  if (body.share && body.channel_id && won && multi >= 3) {
    const { title, message } = higherLowerAnnounce(pickLocale(body), {
      userId: session.id, seed, roll, choice, multi, net: payout - bet,
    });
    await supabase.from('dashboard_commands').insert({
      command: 'announce',
      payload_json: { channel_id: body.channel_id, title, message, embed: true, ping: null },
      status: 'pending',
      created_by: session.id,
    });
  }

  return NextResponse.json({ seed, roll, choice, won, multiplier: multi, bet, payout, newBalance: settled.newBalance });
}
