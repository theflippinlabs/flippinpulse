'use client';

import { useEffect, useState } from 'react';
import type { DiscordChannel } from '@/lib/channels';

interface Result { outcome: 'heads' | 'tails'; choice: 'heads' | 'tails'; won: boolean; bet: number; payout: number; newBalance: number }

export default function CoinflipClient({ initialBalance, channels }: { initialBalance: number; channels: DiscordChannel[] }) {
  const [balance, setBalance] = useState(initialBalance);
  const [bet, setBet] = useState(50);
  const [choice, setChoice] = useState<'heads' | 'tails'>('heads');
  const [flipping, setFlipping] = useState(false);
  const [face, setFace] = useState<'heads' | 'tails'>('heads');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(true);
  const [channelId, setChannelId] = useState('');

  useEffect(() => setChannelId(channels[0]?.channel_id ?? ''), [channels]);

  const flip = async () => {
    if (flipping) return;
    if (balance < bet) { setError('Not enough PULSE.'); return; }
    setFlipping(true);
    setError(null);
    setResult(null);

    const anim = setInterval(() => setFace(prev => prev === 'heads' ? 'tails' : 'heads'), 100);
    try {
      const res = await fetch('/api/play/coinflip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bet, choice, share, channel_id: share ? channelId : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await new Promise(r => setTimeout(r, 1200));
      clearInterval(anim);
      setFace(data.outcome);
      setResult(data);
      setBalance(data.newBalance);
    } catch (err) {
      clearInterval(anim);
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setFlipping(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between bg-pulse-card border border-pulse-border rounded-xl p-3 mb-4">
        <div>
          <div className="text-xs text-pulse-mute uppercase tracking-wide">Your PULSE</div>
          <div className="text-2xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-xs text-pulse-mute">Win pays <span className="text-pulse-gold font-semibold">2×</span></div>
      </div>

      <div className="bg-gradient-to-br from-pulse-gold/20 to-pulse-gold/5 border border-pulse-gold/30 rounded-2xl p-6 mb-4 flex flex-col items-center">
        <div className={`w-32 h-32 rounded-full bg-black border-2 border-pulse-gold flex items-center justify-center text-6xl shadow-brand ${flipping ? 'animate-spin' : ''}`}>
          {face === 'heads' ? '👑' : '⚡'}
        </div>
        <div className="mt-3 text-sm text-pulse-mute">
          {face === 'heads' ? 'HEADS' : 'TAILS'}
        </div>
        {result && (
          <div className="mt-4 text-center">
            {result.won ? (
              <>
                <div className="text-2xl font-bold text-pulse-gold">🎉 +{(result.payout - result.bet).toLocaleString('en-US')} PULSE net</div>
                <div className="text-xs text-pulse-mute">({result.payout.toLocaleString('en-US')} back on a {result.bet.toLocaleString('en-US')} bet)</div>
              </>
            ) : (
              <div className="text-lg text-red-300">– {result.bet.toLocaleString('en-US')} PULSE</div>
            )}
          </div>
        )}
      </div>

      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 space-y-4">
        <div>
          <label className="text-xs uppercase text-pulse-mute">Your call</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button onClick={() => setChoice('heads')} className={`py-3 rounded-lg font-semibold ${choice === 'heads' ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}>👑 Heads</button>
            <button onClick={() => setChoice('tails')} className={`py-3 rounded-lg font-semibold ${choice === 'tails' ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}>⚡ Tails</button>
          </div>
        </div>

        <div>
          <label className="text-xs uppercase text-pulse-mute">Bet (1-500 PULSE)</label>
          <input type="number" min={1} max={500} value={bet} onChange={e => setBet(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
            className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2 mt-2">
            {[10, 25, 50, 100].map(v => (
              <button key={v} onClick={() => setBet(v)} className={`flex-1 py-1.5 rounded-lg text-xs ${bet === v ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}>{v}</button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} className="accent-pulse-gold" />
          Share big wins to Discord (100+)
        </label>

        {share && (
          <div>
            <label className="text-xs uppercase text-pulse-mute">Channel</label>
            <select value={channelId} onChange={e => setChannelId(e.target.value)} className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm">
              {channels.map(c => <option key={c.channel_id} value={c.channel_id}># {c.name}</option>)}
            </select>
          </div>
        )}

        <button onClick={flip} disabled={flipping || balance < bet}
          className="w-full bg-pulse-gold text-black font-bold text-lg py-4 rounded-xl disabled:opacity-50">
          {flipping ? 'Flipping…' : `🪙 FLIP — ${bet} PULSE`}
        </button>

        {error && <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
      </div>
    </>
  );
}
