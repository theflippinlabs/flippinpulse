'use client';

import { useState } from 'react';
import { pickDefaultShareChannel, type DiscordChannel } from '@/lib/channelTypes';

type Mode = 'giveaway' | 'drop';
type Scope = 'active_week' | 'top_50' | 'all';

export default function ReserveClient({ channels, memberCount }: { channels: DiscordChannel[]; memberCount: number }) {
  const [mode, setMode] = useState<Mode>('giveaway');
  const [channelId, setChannelId] = useState(pickDefaultShareChannel(channels));

  // Giveaway form
  const [gPrize, setGPrize] = useState('');
  const [gPrizePulse, setGPrizePulse] = useState(100);
  const [gWinners, setGWinners] = useState(1);
  const [gMinutes, setGMinutes] = useState(60);

  // Drop form
  const [dAmount, setDAmount] = useState(50);
  const [dWinners, setDWinners] = useState(5);
  const [dScope, setDScope] = useState<Scope>('active_week');

  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const send = async (command: string, payload: Record<string, unknown>) => {
    setStatus('sending');
    setError(null);
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command, payload }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setStatus('sent');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  };

  const submitGiveaway = () => {
    if (!channelId) { setError('Pick a channel.'); return; }
    if (gPrizePulse <= 0) { setError('Prize must be > 0 PULSE.'); return; }
    if (gWinners < 1) { setError('At least 1 winner.'); return; }
    if (gMinutes < 1) { setError('Duration must be ≥ 1 minute.'); return; }
    send('create_giveaway', {
      channel_id: channelId,
      prize_label: gPrize.trim() || `${gPrizePulse} PULSE`,
      prize_pulse: Math.floor(gPrizePulse),
      winners_count: Math.floor(gWinners),
      duration_minutes: Math.floor(gMinutes),
    });
  };

  const submitDrop = () => {
    if (!channelId) { setError('Pick a channel.'); return; }
    if (dAmount <= 0) { setError('Amount must be > 0 PULSE.'); return; }
    if (dWinners < 1) { setError('At least 1 winner.'); return; }
    send('bulk_drop', {
      channel_id: channelId,
      amount: Math.floor(dAmount),
      winners_count: Math.floor(dWinners),
      scope: dScope,
    });
  };

  const totalCost = mode === 'giveaway' ? gPrizePulse * gWinners : dAmount * dWinners;

  return (
    <div className="bg-pulse-card border border-pulse-border rounded-2xl p-5">
      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2 mb-5 bg-pulse-bg/50 p-1 rounded-xl">
        <button
          onClick={() => setMode('giveaway')}
          className={`py-2.5 rounded-lg text-sm font-semibold transition-all ${
            mode === 'giveaway' ? 'bg-pulse-gold text-black shadow-brand' : 'text-pulse-mute'
          }`}
        >
          🎉 Giveaway
        </button>
        <button
          onClick={() => setMode('drop')}
          className={`py-2.5 rounded-lg text-sm font-semibold transition-all ${
            mode === 'drop' ? 'bg-pulse-gold text-black shadow-brand' : 'text-pulse-mute'
          }`}
        >
          💸 Random Drop
        </button>
      </div>

      {/* Channel picker (shared) */}
      <label className="block mb-4">
        <span className="text-xs uppercase text-pulse-mute">Channel</span>
        <select
          value={channelId}
          onChange={e => setChannelId(e.target.value)}
          className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2.5 text-sm"
        >
          {channels.map(c => (
            <option key={c.channel_id} value={c.channel_id}># {c.name}</option>
          ))}
        </select>
      </label>

      {mode === 'giveaway' ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs uppercase text-pulse-mute">Prize label (optional)</span>
            <input
              type="text"
              placeholder={`${gPrizePulse} PULSE`}
              value={gPrize}
              onChange={e => setGPrize(e.target.value)}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2.5 text-sm"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-xs uppercase text-pulse-mute">PULSE / winner</span>
              <input
                type="number"
                min={1}
                value={gPrizePulse}
                onChange={e => setGPrizePulse(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase text-pulse-mute">Winners</span>
              <input
                type="number"
                min={1}
                max={20}
                value={gWinners}
                onChange={e => setGWinners(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase text-pulse-mute">Minutes</span>
              <input
                type="number"
                min={1}
                max={43200}
                value={gMinutes}
                onChange={e => setGMinutes(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-2.5 text-sm"
              />
            </label>
          </div>

          <div className="flex gap-2 flex-wrap">
            {[15, 60, 60 * 6, 60 * 24].map(m => (
              <button
                key={m}
                onClick={() => setGMinutes(m)}
                className={`px-3 py-1 rounded-lg text-xs ${gMinutes === m ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}
              >
                {m < 60 ? `${m}m` : m < 60 * 24 ? `${m / 60}h` : `${m / (60 * 24)}d`}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <span className="text-xs uppercase text-pulse-mute">Eligible members</span>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(['active_week', 'top_50', 'all'] as Scope[]).map(s => (
                <button
                  key={s}
                  onClick={() => setDScope(s)}
                  className={`py-2 rounded-lg text-xs font-semibold ${dScope === s ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}
                >
                  {s === 'active_week' ? 'Active week' : s === 'top_50' ? 'Top 50' : `All ${memberCount}`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs uppercase text-pulse-mute">PULSE / winner</span>
              <input
                type="number"
                min={1}
                value={dAmount}
                onChange={e => setDAmount(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase text-pulse-mute">Winners</span>
              <input
                type="number"
                min={1}
                max={50}
                value={dWinners}
                onChange={e => setDWinners(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-2.5 text-sm"
              />
            </label>
          </div>

          <div className="flex gap-2 flex-wrap">
            {[10, 25, 50, 100, 250].map(v => (
              <button
                key={v}
                onClick={() => setDAmount(v)}
                className={`px-3 py-1 rounded-lg text-xs ${dAmount === v ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Total */}
      <div className="mt-4 flex items-center justify-between bg-pulse-bg/50 border border-pulse-border/60 rounded-lg px-3 py-2">
        <span className="text-xs text-pulse-mute uppercase">Total from reserve</span>
        <span className="font-bold text-pulse-gold">{totalCost.toLocaleString('en-US')} PULSE</span>
      </div>

      <button
        onClick={mode === 'giveaway' ? submitGiveaway : submitDrop}
        disabled={status === 'sending'}
        className="w-full mt-4 bg-pulse-gold text-black font-bold text-base py-3 rounded-xl disabled:opacity-50 shadow-brand"
      >
        {status === 'sending' ? 'Queuing…' : status === 'sent' ? '✅ Queued — bot will run it in ≤15s' : mode === 'giveaway' ? '🎉 Launch giveaway' : '💸 Send drop now'}
      </button>

      {error && <div className="mt-3 p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
    </div>
  );
}
