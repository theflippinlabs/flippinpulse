'use client';

import { useState } from 'react';

interface Tour {
  id: string; title: string; buy_in: number; pot_pulse: number; max_players: number;
  status: 'open' | 'running' | 'completed' | 'cancelled'; game_type: string | null;
  created_at: string; players_count: number; joined: boolean;
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default function TournamentsClient({ tournaments }: { tournaments: Tour[] }) {
  const [state, setState] = useState<Tour[]>(tournaments);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const join = async (t: Tour) => {
    if (busy) return;
    if (t.buy_in > 0 && !confirm(`Rejoindre "${t.title}" pour ${fmt(t.buy_in)} PULSE ?`)) return;
    setBusy(t.id);
    setError(null);
    try {
      const res = await fetch('/api/tournaments/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tournament_id: t.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setState(prev => prev.map(x => x.id === t.id
        ? { ...x, joined: true, players_count: x.players_count + 1, pot_pulse: data.newPot ?? x.pot_pulse }
        : x
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec.');
    } finally {
      setBusy(null);
    }
  };

  if (!state.length) {
    return (
      <div className="bg-pulse-card border border-pulse-border rounded-xl p-6 text-center">
        <div className="text-4xl mb-2">🏟️</div>
        <div className="font-semibold">Aucun tournoi actif</div>
        <div className="text-sm text-pulse-mute mt-1">Reviens plus tard, un Lord peut en lancer à tout moment.</div>
      </div>
    );
  }

  return (
    <>
      {error && <div className="mb-3 p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
      <div className="space-y-2.5">
        {state.map(t => {
          const isFull = t.players_count >= t.max_players;
          const canJoin = t.status === 'open' && !t.joined && !isFull;
          return (
            <div key={t.id} className="bg-pulse-card border border-pulse-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{t.title}</div>
                  <div className="text-xs text-pulse-mute mt-0.5 flex items-center gap-2">
                    <span className="capitalize">{t.status}</span>
                    {t.game_type && <><span>·</span><span>{t.game_type}</span></>}
                    <span>·</span>
                    <span>{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-pulse-gold">{fmt(t.pot_pulse)}</div>
                  <div className="text-[9px] uppercase text-pulse-mute">Cagnotte</div>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1">
                  <div className="text-[10px] uppercase text-pulse-mute">Joueurs</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-pulse-border/40 rounded-full overflow-hidden">
                      <div className="h-full bg-pulse-gold" style={{ width: `${Math.min(100, (t.players_count / t.max_players) * 100)}%` }} />
                    </div>
                    <div className="text-xs font-mono text-pulse-text">{t.players_count} / {t.max_players}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-pulse-mute">Buy-in</div>
                  <div className="text-sm font-mono">{t.buy_in > 0 ? fmt(t.buy_in) : 'Gratuit'}</div>
                </div>
              </div>
              <button
                onClick={() => join(t)}
                disabled={!canJoin || busy === t.id}
                className={`w-full py-2 rounded-lg font-bold text-sm ${
                  t.joined ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : canJoin ? 'bg-pulse-gold text-black shadow-brand'
                  : 'bg-pulse-border/40 text-pulse-mute'
                }`}
              >
                {busy === t.id ? 'Inscription…'
                  : t.joined ? '✅ Inscrit'
                  : isFull ? 'Complet'
                  : t.status !== 'open' ? 'Fermé'
                  : `⚔️ Rejoindre — ${t.buy_in > 0 ? `${fmt(t.buy_in)} PULSE` : 'gratuit'}`}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
