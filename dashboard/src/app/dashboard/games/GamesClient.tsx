'use client';

import Link from 'next/link';
import { useState } from 'react';

export interface Game {
  game_key: string;
  is_enabled: boolean;
  config_json: Record<string, unknown>;
}

const LABELS: Record<string, { name: string; emoji: string }> = {
  crash:         { name: 'Crash',              emoji: '💥' },
  slots:         { name: 'Slots',              emoji: '🎰' },
  blackjack:     { name: 'Blackjack',          emoji: '🃏' },
  roulette:      { name: 'Roulette',           emoji: '🎡' },
  wheel:         { name: 'Wheel',              emoji: '🎯' },
  higherlower:   { name: 'Higher or Lower',    emoji: '🔼' },
  rps:           { name: 'Rock-Paper-Scissors',emoji: '✊' },
  duel:          { name: 'Duel',               emoji: '⚔️' },
  quiz:          { name: 'Quiz',               emoji: '🧠' },
  treasure_drop: { name: 'Treasure drop',      emoji: '💰' },
  typing_race:   { name: 'Typing race',        emoji: '⌨️' },
  battle_royale: { name: 'Battle Royale',      emoji: '🏆' },
  dice_royale:   { name: 'Dice Royale',        emoji: '🎲' },
  chicken_race:  { name: 'Chicken Race',       emoji: '🐔' },
};

export default function GamesClient({ initial }: { initial: Game[] }) {
  const [games, setGames] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (e: React.MouseEvent, g: Game) => {
    e.preventDefault();
    e.stopPropagation();
    setBusy(g.game_key);
    setError(null);
    const nextEnabled = !g.is_enabled;
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game_key: g.game_key, enabled: nextEnabled }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setGames(prev => prev.map(x => x.game_key === g.game_key ? { ...x, is_enabled: nextEnabled } : x));
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
      <div className="space-y-2">
        {games.map(g => {
          const meta = LABELS[g.game_key] ?? { name: g.game_key, emoji: '🎲' };
          const j = g.config_json ?? {};
          const min = (j.min_bet as number | undefined) ?? 0;
          const max = (j.max_bet as number | undefined) ?? 0;
          const fee = (j.fee_percent as number | undefined) ?? 0;
          return (
            <Link
              key={g.game_key}
              href={`/dashboard/games/${g.game_key}`}
              className="block bg-pulse-card border border-pulse-border rounded-xl p-3 hover:border-pulse-gold/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl">{meta.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    <span>{meta.name}</span>
                    <span className="text-pulse-mute text-xs">›</span>
                  </div>
                  <div className="text-xs text-pulse-mute">
                    Min {min} · Max {max} · House {fee}%
                  </div>
                </div>
                <button
                  onClick={e => toggle(e, g)}
                  disabled={busy === g.game_key}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                    g.is_enabled ? 'bg-pulse-gold' : 'bg-pulse-border'
                  } ${busy === g.game_key ? 'opacity-60' : ''}`}
                  aria-label={g.is_enabled ? 'Disable' : 'Enable'}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                      g.is_enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
