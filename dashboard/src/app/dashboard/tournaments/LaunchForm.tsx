'use client';

import { useState } from 'react';
import ChannelPicker from '../ChannelPicker';
import type { DiscordChannel } from '@/lib/channels';

const GAME_TYPES: { key: string; emoji: string; label: string; hint: string }[] = [
  { key: 'dice_duel', emoji: '🎲', label: 'Dice duel',       hint: 'Highest d100 roll wins each match' },
  { key: 'coin_flip', emoji: '🪙', label: 'Coin flip',       hint: '50/50 heads or tails, best of 1' },
  { key: 'higherlower', emoji: '🔼', label: 'Higher / Lower', hint: 'Two rolls, guess if next is higher' },
  { key: 'trivia', emoji: '🧠', label: 'Trivia',            hint: 'Fastest correct answer wins' },
];

export default function LaunchForm({ channels }: { channels: DiscordChannel[] }) {
  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState('');
  const [gameType, setGameType] = useState('dice_duel');
  const [title, setTitle] = useState('');
  const [buyIn, setBuyIn] = useState('100');
  const [maxPlayers, setMaxPlayers] = useState('16');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!channelId) { setError('Pick a channel.'); return; }
    const b = Number(buyIn);
    const p = Number(maxPlayers);
    if (!Number.isFinite(b) || b < 0) { setError('Buy-in must be ≥ 0.'); return; }
    if (!Number.isFinite(p) || p < 2 || p > 64) { setError('Players must be between 2 and 64.'); return; }

    setStatus('sending');
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          command: 'create_tournament',
          payload: {
            channel_id: channelId,
            title: title.trim() || '⚔️ Novarys Arena',
            buy_in: Math.floor(b),
            max_players: Math.floor(p),
            game_type: gameType,
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setStatus('sent');
      setTimeout(() => {
        setStatus('idle');
        setOpen(false);
        window.location.reload();
      }, 1500);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to queue.');
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-pulse-gold text-black font-semibold py-3 rounded-lg mb-4"
      >
        ⚔️ Launch a tournament
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="bg-pulse-card border border-pulse-border rounded-xl p-4 mb-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Launch a tournament</div>
        <button type="button" onClick={() => setOpen(false)} className="text-pulse-mute text-xl leading-none">✕</button>
      </div>

      <ChannelPicker
        channels={channels}
        value={channelId}
        onChange={setChannelId}
        label="Room (Discord channel)"
        placeholder="Pick where the lobby is posted"
      />

      <div>
        <label className="text-xs uppercase text-pulse-mute">Game</label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {GAME_TYPES.map(g => {
            const active = gameType === g.key;
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setGameType(g.key)}
                className={`text-left rounded-lg border px-3 py-2 ${
                  active
                    ? 'bg-pulse-gold/10 border-pulse-gold text-pulse-gold'
                    : 'bg-pulse-bg border-pulse-border text-pulse-text/80'
                }`}
              >
                <div className="text-sm font-semibold flex items-center gap-2">
                  <span>{g.emoji}</span>
                  <span>{g.label}</span>
                </div>
                <div className="text-[11px] text-pulse-mute mt-0.5">{g.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs uppercase text-pulse-mute">Title (optional)</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="⚔️ Novarys Arena"
          className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs uppercase text-pulse-mute">Buy-in (PULSE)</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={buyIn}
            onChange={e => setBuyIn(e.target.value)}
            className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs uppercase text-pulse-mute">Max players</label>
          <input
            type="number"
            inputMode="numeric"
            min={2}
            max={64}
            value={maxPlayers}
            onChange={e => setMaxPlayers(e.target.value)}
            className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full bg-pulse-gold text-black font-semibold py-3 rounded-lg disabled:opacity-50"
      >
        {status === 'sending' ? 'Launching…' : status === 'sent' ? '✅ Launched!' : 'Confirm launch'}
      </button>

      {error && <div className="text-xs text-red-400">{error}</div>}
    </form>
  );
}
