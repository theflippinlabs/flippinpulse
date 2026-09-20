import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tournamentId = typeof body.tournament_id === 'string' ? body.tournament_id : '';
  if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 });

  const { data: tournament } = await supabase
    .from('tournaments').select('*').eq('id', tournamentId).maybeSingle();
  if (!tournament) return NextResponse.json({ error: 'Tournoi introuvable.' }, { status: 404 });
  const t = tournament as {
    id: string; status: string; buy_in: number; max_players: number;
    pot_pulse: number; title: string;
  };
  if (t.status !== 'open') return NextResponse.json({ error: 'Ce tournoi est fermé.' }, { status: 400 });

  const { data: existing } = await supabase
    .from('tournament_players').select('id').eq('tournament_id', t.id).eq('discord_id', session.id).maybeSingle();
  if (existing) return NextResponse.json({ error: 'Tu as déjà rejoint ce tournoi.' }, { status: 400 });

  const { count: playersCount } = await supabase
    .from('tournament_players').select('*', { count: 'exact', head: true }).eq('tournament_id', t.id);
  if ((playersCount ?? 0) >= t.max_players) {
    return NextResponse.json({ error: 'Tournoi complet.' }, { status: 400 });
  }

  // Debit buy-in from balance if any.
  if (t.buy_in > 0) {
    const { data: user } = await supabase
      .from('discord_users').select('balance_pulse, lifetime_spent_pulse').eq('discord_id', session.id).maybeSingle();
    if (!user) return NextResponse.json({ error: 'Envoie un message sur le Discord d\'abord.' }, { status: 400 });
    const bal = (user as { balance_pulse?: number }).balance_pulse ?? 0;
    if (bal < t.buy_in) return NextResponse.json({ error: 'Pas assez de PULSE pour le buy-in.' }, { status: 400 });

    const newBal = bal - t.buy_in;
    const lifetimeSpent = ((user as { lifetime_spent_pulse?: number }).lifetime_spent_pulse ?? 0) + t.buy_in;
    await supabase.from('discord_users').update({
      balance_pulse: newBal, lifetime_spent_pulse: lifetimeSpent,
    }).eq('discord_id', session.id);
    await supabase.from('pulse_transactions').insert({
      discord_id: session.id, type: 'SPEND_SHOP', amount: -t.buy_in,
      reason: `Tournament buy-in: ${t.title}`, ref_id: t.id, balance_after: newBal,
    });
  }

  await supabase.from('tournament_players').insert({
    tournament_id: t.id, discord_id: session.id, joined_at: new Date().toISOString(),
  });

  const newPot = (t.pot_pulse ?? 0) + t.buy_in;
  await supabase.from('tournaments').update({ pot_pulse: newPot }).eq('id', t.id);

  return NextResponse.json({ ok: true, newPot });
}
