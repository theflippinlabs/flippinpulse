import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface Tour {
  id: string;
  title: string;
  status: string;
  buy_in: number;
  pot_pulse: number;
  max_players: number;
  winner_id: string | null;
  created_at: string;
  ended_at: string | null;
}

async function loadTournaments(): Promise<Tour[]> {
  const { data } = await supabase
    .from('tournaments')
    .select('id, title, status, buy_in, pot_pulse, max_players, winner_id, created_at, ended_at')
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []) as Tour[];
}

async function playerCounts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const { data } = await supabase
    .from('tournament_players')
    .select('tournament_id')
    .in('tournament_id', ids);
  const m = new Map<string, number>();
  for (const row of (data ?? []) as { tournament_id: string }[]) {
    m.set(row.tournament_id, (m.get(row.tournament_id) ?? 0) + 1);
  }
  return m;
}

const statusStyle: Record<string, string> = {
  open: 'bg-emerald-900/50 text-emerald-300 border-emerald-800',
  running: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  done: 'bg-pulse-border/40 text-pulse-mute border-pulse-border',
  cancelled: 'bg-red-900/40 text-red-300 border-red-800',
};

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function TournamentsPage() {
  const tournaments = await loadTournaments();
  const counts = await playerCounts(tournaments.map(t => t.id));
  return (
    <>
      <h1 className="text-2xl font-bold mb-2">Tournaments</h1>
      <p className="text-pulse-mute mb-6 text-sm">Latest {tournaments.length} tournaments in the arena.</p>
      <div className="bg-pulse-card border border-pulse-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-pulse-border/40 text-pulse-mute uppercase text-xs">
            <tr>
              <th className="text-left px-4 py-2">Title</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Buy-in</th>
              <th className="text-right px-4 py-2">Pot</th>
              <th className="text-right px-4 py-2">Players</th>
              <th className="text-left px-4 py-2">Winner</th>
              <th className="text-right px-4 py-2">Started</th>
            </tr>
          </thead>
          <tbody>
            {tournaments.map(t => (
              <tr key={t.id} className="border-t border-pulse-border/50">
                <td className="px-4 py-2 font-semibold">{t.title}</td>
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded border text-xs capitalize ${statusStyle[t.status] ?? ''}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono">{fmt(t.buy_in)}</td>
                <td className="px-4 py-2 text-right font-mono text-pulse-brand">{fmt(t.pot_pulse)}</td>
                <td className="px-4 py-2 text-right">{counts.get(t.id) ?? 0} / {t.max_players}</td>
                <td className="px-4 py-2 font-mono text-xs">{t.winner_id ?? '—'}</td>
                <td className="px-4 py-2 text-right text-pulse-mute text-xs">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {tournaments.length === 0 && (
              <tr><td colSpan={7} className="text-center py-6 text-pulse-mute">No tournaments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
