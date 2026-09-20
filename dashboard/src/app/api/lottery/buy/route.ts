import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tickets = Math.max(1, Math.min(50, Math.floor(Number(body.tickets ?? 1))));

  const { data: round } = await supabase
    .from('lottery_rounds').select('id, ticket_price, pot_pulse, total_tickets, status').eq('status', 'active').maybeSingle();
  if (!round) return NextResponse.json({ error: 'Aucune loterie en cours.' }, { status: 400 });
  const r = round as { id: string; ticket_price: number; pot_pulse: number; total_tickets: number; status: string };

  const cost = r.ticket_price * tickets;

  const { data: user } = await supabase
    .from('discord_users').select('balance_pulse, lifetime_spent_pulse').eq('discord_id', session.id).maybeSingle();
  if (!user) return NextResponse.json({ error: 'Envoie un message sur le Discord d\'abord.' }, { status: 400 });
  const bal = (user as { balance_pulse?: number }).balance_pulse ?? 0;
  if (bal < cost) return NextResponse.json({ error: `Il te manque ${cost - bal} PULSE.` }, { status: 400 });

  const newBal = bal - cost;
  const lifetimeSpent = ((user as { lifetime_spent_pulse?: number }).lifetime_spent_pulse ?? 0) + cost;
  await supabase.from('discord_users').update({
    balance_pulse: newBal, lifetime_spent_pulse: lifetimeSpent,
  }).eq('discord_id', session.id);
  await supabase.from('pulse_transactions').insert({
    discord_id: session.id, type: 'SPEND_SHOP', amount: -cost,
    reason: `Lottery tickets × ${tickets}`, ref_id: r.id, balance_after: newBal,
  });

  // Upsert my tickets row for this round.
  const { data: existing } = await supabase
    .from('lottery_tickets').select('id, tickets').eq('round_id', r.id).eq('discord_id', session.id).maybeSingle();
  if (existing) {
    await supabase.from('lottery_tickets').update({
      tickets: ((existing as { tickets?: number }).tickets ?? 0) + tickets,
    }).eq('id', (existing as { id: string }).id);
  } else {
    await supabase.from('lottery_tickets').insert({
      round_id: r.id, discord_id: session.id, tickets,
    });
  }

  const newPot = r.pot_pulse + cost;
  const newTotal = r.total_tickets + tickets;
  await supabase.from('lottery_rounds').update({
    pot_pulse: newPot, total_tickets: newTotal,
  }).eq('id', r.id);

  return NextResponse.json({ ok: true, newBalance: newBal, newPot, newTotal, myTickets: (existing as { tickets?: number } | null)?.tickets ?? 0 + tickets });
}
