'use client';

import { useState } from 'react';

export interface Mission {
  id: string;
  kind: string;
  title: string;
  reward: number;
  goal: number | null;
  metric: string | null;
  winners_count: number;
  expires_at: string | null;
}

type Kind = 'flash' | 'riddle' | 'daily' | 'weekly';

const KIND_META: Record<Kind, { emoji: string; label: string; hint: string }> = {
  flash:  { emoji: '⚡', label: 'Flash challenge', hint: 'First 3 to claim win 50 PULSE (30 min)' },
  riddle: { emoji: '🧩', label: 'Riddle',          hint: 'First to solve wins 100 PULSE (AI-generated)' },
  daily:  { emoji: '📅', label: 'Daily objective', hint: '20 messages · 60 PULSE reward' },
  weekly: { emoji: '🗓️', label: 'Weekly objective',hint: '5 games played · 250 PULSE reward' },
};

export default function MissionsClient({ initial }: { initial: Mission[] }) {
  const [active, setActive] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const launch = async (kind: Kind) => {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'launch', kind }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(null);
    }
  };

  const endAll = async () => {
    if (!confirm('End every active mission?')) return;
    setBusy('end');
    setError(null);
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'end_all' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setActive([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-6">
        {(Object.entries(KIND_META) as [Kind, typeof KIND_META[Kind]][]).map(([k, m]) => (
          <button
            key={k}
            onClick={() => launch(k)}
            disabled={busy === k}
            className="group aspect-square bg-pulse-card border border-pulse-border rounded-2xl p-3 flex flex-col items-center justify-center text-center hover:border-pulse-gold/40 active:scale-[0.97] transition-all disabled:opacity-60"
          >
            <div className="text-4xl leading-none mb-1">{m.emoji}</div>
            <div className="font-bold text-sm">{m.label}</div>
            <div className="text-[11px] text-pulse-mute mt-1 line-clamp-2">{m.hint}</div>
            <div className="mt-2 text-xs text-pulse-gold">{busy === k ? 'Launching…' : 'Launch ›'}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm uppercase tracking-wide text-pulse-mute">Active missions ({active.length})</h2>
        {active.length > 0 && (
          <button onClick={endAll} disabled={busy === 'end'} className="text-xs px-3 py-1.5 rounded bg-red-900/50 text-red-200 border border-red-800">
            {busy === 'end' ? 'Ending…' : 'End all'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {active.map(m => (
          <div key={m.id} className="bg-pulse-card border border-pulse-border rounded-xl p-3 flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-semibold truncate">{m.title}</div>
              <div className="text-xs text-pulse-mute">
                {m.kind} · {m.reward} PULSE{m.goal ? ` · goal ${m.goal}` : ''} · {m.winners_count} winner{m.winners_count === 1 ? '' : 's'}
              </div>
            </div>
            <div className="text-xs text-pulse-mute shrink-0 ml-3">
              {m.expires_at ? new Date(m.expires_at).toLocaleTimeString() : ''}
            </div>
          </div>
        ))}
        {active.length === 0 && (
          <div className="text-pulse-mute text-sm text-center py-6">No mission running. Launch one above.</div>
        )}
      </div>
    </>
  );
}
