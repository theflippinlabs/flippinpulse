import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { settleBet } from '@/lib/play';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session || !isAdmin(session.id)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const bet = Math.max(1, Math.min(500, Math.floor(Number(body.bet ?? 25))));
  const choice = body.choice === 'tails' ? 'tails' : 'heads';

  const outcome: 'heads' | 'tails' = Math.random() < 0.5 ? 'heads' : 'tails';
  const won = outcome === choice;
  const payout = won ? bet * 2 : 0;

  const settled = await settleBet(session.id, 'coinflip', bet, payout);
  if (!settled.ok) return NextResponse.json({ error: settled.error, balance: settled.balance }, { status: 400 });

  if (body.share && body.channel_id && won && bet >= 100) {
    await supabase.from('dashboard_commands').insert({
      command: 'announce',
      payload_json: {
        channel_id: body.channel_id,
        title: '🪙 Coin flip win!',
        message: `<@${session.id}> flipped **${outcome === 'heads' ? '🪙 heads' : '🪙 tails'}** and doubled up to **${payout} PULSE**! 💸`,
        embed: true,
        ping: null,
      },
      status: 'pending',
      created_by: session.id,
    });
  }

  return NextResponse.json({ outcome, choice, won, bet, payout, newBalance: settled.newBalance });
}
