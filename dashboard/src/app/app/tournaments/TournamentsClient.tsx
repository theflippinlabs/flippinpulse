'use client';

import { useState } from 'react';
import { useT, interpolate, useLocale } from '@/lib/i18n-client';
import { translations } from '@/lib/translations';

interface Tour {
  id: string; title: string; buy_in: number; pot_pulse: number; max_players: number;
  status: 'open' | 'running' | 'completed' | 'cancelled'; game_type: string | null;
  created_at: string; players_count: number; joined: boolean;
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default function TournamentsClient({ tournaments }: { tournaments: Tour[] }) {
  const t = useT();
  const locale = useLocale();
  const [state, setState] = useState<Tour[]>(tournaments);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = (s: Tour['status']): string => {
    const dict = translations[locale].tournaments as unknown as Record<string, string>;
    return dict[`status_${s}`] ?? s;
  };

  const join = async (tour: Tour) => {
    if (busy) return;
    if (tour.buy_in > 0) {
      const msg = interpolate(t('tournaments.confirm_join'), { title: tour.title, buy_in: fmt(tour.buy_in) });
      if (!confirm(msg)) return;
    }
    setBusy(tour.id);
    setError(null);
    try {
      const res = await fetch('/api/tournaments/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tournament_id: tour.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setState(prev => prev.map(x => x.id === tour.id
        ? { ...x, joined: true, players_count: x.players_count + 1, pot_pulse: data.newPot ?? x.pot_pulse }
        : x
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(null);
    }
  };

  if (!state.length) {
    return (
      <div className="bg-pulse-card border border-pulse-border rounded-xl p-6 text-center">
        <div className="text-4xl mb-2">🏟️</div>
        <div className="font-semibold">{t('tournaments.empty_title')}</div>
        <div className="text-sm text-pulse-mute mt-1">{t('tournaments.empty_hint')}</div>
      </div>
    );
  }

  return (
    <>
      {error && <div className="mb-3 p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
      <div className="space-y-2.5">
        {state.map(tour => {
          const isFull = tour.players_count >= tour.max_players;
          const canJoin = tour.status === 'open' && !tour.joined && !isFull;
          return (
            <div key={tour.id} className="bg-pulse-card border border-pulse-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{tour.title}</div>
                  <div className="text-xs text-pulse-mute mt-0.5 flex items-center gap-2">
                    <span>{statusLabel(tour.status)}</span>
                    {tour.game_type && <><span>·</span><span>{tour.game_type}</span></>}
                    <span>·</span>
                    <span>{new Date(tour.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-pulse-gold">{fmt(tour.pot_pulse)}</div>
                  <div className="text-[9px] uppercase text-pulse-mute">{t('tournaments.pot')}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1">
                  <div className="text-[10px] uppercase text-pulse-mute">{t('tournaments.players')}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-pulse-border/40 rounded-full overflow-hidden">
                      <div className="h-full bg-pulse-gold" style={{ width: `${Math.min(100, (tour.players_count / tour.max_players) * 100)}%` }} />
                    </div>
                    <div className="text-xs font-mono text-pulse-text">{tour.players_count} / {tour.max_players}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase text-pulse-mute">{t('tournaments.buy_in')}</div>
                  <div className="text-sm font-mono">{tour.buy_in > 0 ? fmt(tour.buy_in) : t('common.free')}</div>
                </div>
              </div>
              <button
                onClick={() => join(tour)}
                disabled={!canJoin || busy === tour.id}
                className={`w-full py-2 rounded-lg font-bold text-sm ${
                  tour.joined ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : canJoin ? 'bg-pulse-gold text-black shadow-brand'
                  : 'bg-pulse-border/40 text-pulse-mute'
                }`}
              >
                {busy === tour.id ? t('tournaments.joining')
                  : tour.joined ? t('tournaments.joined')
                  : isFull ? t('tournaments.full')
                  : tour.status !== 'open' ? t('tournaments.closed')
                  : `⚔️ ${t('tournaments.join_prompt')} — ${tour.buy_in > 0 ? `${fmt(tour.buy_in)} PULSE` : t('common.free')}`}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
