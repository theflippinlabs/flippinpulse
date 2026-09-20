import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';
import TournamentsClient from './TournamentsClient';

export const dynamic = 'force-dynamic';

async function load(discordId: string) {
  const [tRes, myRes] = await Promise.all([
    supabase
      .from('tournaments')
      .select('id, title, buy_in, pot_pulse, max_players, status, game_type, created_at')
      .in('status', ['open', 'running', 'completed'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('tournament_players')
      .select('tournament_id')
      .eq('discord_id', discordId),
  ]);
  return {
    tournaments: (tRes.data ?? []) as {
      id: string; title: string; buy_in: number; pot_pulse: number; max_players: number;
      status: 'open' | 'running' | 'completed' | 'cancelled'; game_type: string | null; created_at: string;
    }[],
    joined: new Set(((myRes.data ?? []) as { tournament_id: string }[]).map(r => r.tournament_id)),
  };
}

export default async function TournamentsPage() {
  const session = getSession();
  if (!session) redirect('/');
  const { tournaments, joined } = await load(session.id);

  const ids = tournaments.map(x => x.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data } = await supabase.from('tournament_players').select('tournament_id').in('tournament_id', ids);
    for (const r of (data ?? []) as { tournament_id: string }[]) {
      counts.set(r.tournament_id, (counts.get(r.tournament_id) ?? 0) + 1);
    }
  }

  const enriched = tournaments.map(x => ({
    ...x,
    players_count: counts.get(x.id) ?? 0,
    joined: joined.has(x.id),
  }));

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>{t('common.back')}</span>
      </Link>
      <h1 className="text-2xl font-bold mb-1">🏟️ {t('tournaments.title')}</h1>
      <p className="text-pulse-mute text-sm mb-4">{t('tournaments.subtitle')}</p>
      <TournamentsClient tournaments={enriched} />
    </>
  );
}
