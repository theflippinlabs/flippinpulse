'use client';

import { useEffect, useState } from 'react';
import type { DiscordChannel } from '@/lib/channels';

interface Result { seed: number; roll: number; choice: 'higher' | 'lower'; won: boolean; multiplier: number; bet: number; payout: number; newBalance: number }

export default function HigherLowerClient({ initialBalance, channels }: { initialBalance: number; channels: DiscordChannel[] }) {
  const [balance, setBalance] = useState(initialBalance);
  const [bet, setBet] = useState(25);
  const [seed, setSeed] = useState<number>(Math.floor(Math.random() * 98) + 2);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(true);
  const [channelId, setChannelId] = useState('');

  useEffect(() => setChannelId(channels[0]?.channel_id ?? ''), [channels]);

  const play = async (choice: 'higher' | 'lower') => {
    if (busy) return;
    if (balance < bet) { setError('Not enough PULSE.'); return; }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/play/higherlower', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bet, seed, choice, share, channel_id: share ? channelId : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await new Promise(r => setTimeout(r, 600));
      setResult(data);
      setBalance(data.newBalance);
      // Fresh seed for next round.
      setSeed(Math.floor(Math.random() * 98) + 2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  };

  const higherMulti = Math.max(1.1, Math.round((1 / ((100 - seed) / 99)) * 0.95 * 100) / 100);
  const lowerMulti = Math.max(1.1, Math.round((1 / ((seed - 1) / 99)) * 0.95 * 100) / 100);

  return (
    <>
      <div className="flex items-center justify-between bg-pulse-card border border-pulse-border rounded-xl p-3 mb-4">
        <div>
          <div className="text-xs text-pulse-mute uppercase tracking-wide">Your PULSE</div>
          <div className="text-2xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-xs text-pulse-mute">Payout scales with the odds</div>
      </div>

      <div className="bg-gradient-to-br from-pulse-gold/20 to-pulse-gold/5 border border-pulse-gold/30 rounded-2xl p-6 mb-4 text-center">
        <div className="text-xs uppercase text-pulse-mute mb-2">Number to beat</div>
        <div className="text-7xl md:text-8xl font-bold text-pulse-gold">{seed}</div>
        <div className="text-xs text-pulse-mute mt-1">out of 100</div>
        {result && (
          <div className="mt-4 border-t border-pulse-border/60 pt-3">
            <div className="text-xs text-pulse-mute">The roll was</div>
            <div className="text-5xl font-bold my-1">{result.roll}</div>
            {result.won ? (
              <>
                <div className="text-lg font-bold text-pulse-gold">🎉 +{(result.payout - result.bet).toLocaleString('en-US')} PULSE net</div>
                <div className="text-xs text-pulse-mute">{result.multiplier}× ({result.payout.toLocaleString('en-US')} back)</div>
              </>
            ) : (
              <div className="text-lg text-red-300">– {result.bet.toLocaleString('en-US')} PULSE</div>
            )}
          </div>
        )}
      </div>

      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 space-y-4">
        <div>
          <label className="text-xs uppercase text-pulse-mute">Bet</label>
          <input type="number" min={1} max={500} value={bet} onChange={e => setBet(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
            className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2 mt-2">
            {[10, 25, 50, 100].map(v => (
              <button key={v} onClick={() => setBet(v)} className={`flex-1 py-1.5 rounded-lg text-xs ${bet === v ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}>{v}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => play('lower')} disabled={busy || balance < bet}
            className="py-4 rounded-xl bg-red-500/90 text-white font-bold disabled:opacity-50">
            🔽 LOWER<br/><span className="text-xs opacity-90">{lowerMulti}×</span>
          </button>
          <button onClick={() => play('higher')} disabled={busy || balance < bet}
            className="py-4 rounded-xl bg-emerald-500 text-black font-bold disabled:opacity-50">
            🔼 HIGHER<br/><span className="text-xs opacity-90">{higherMulti}×</span>
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} className="accent-pulse-gold" />
          Share 3×+ wins to Discord
        </label>

        {share && (
          <div>
            <label className="text-xs uppercase text-pulse-mute">Channel</label>
            <select value={channelId} onChange={e => setChannelId(e.target.value)} className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm">
              {channels.map(c => <option key={c.channel_id} value={c.channel_id}># {c.name}</option>)}
            </select>
          </div>
        )}

        {error && <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
      </div>
    </>
  );
}
