'use client';

import { useEffect, useState } from 'react';
import type { DiscordChannel } from '@/lib/channels';

interface Result { outcome: 'heads' | 'tails'; choice: 'heads' | 'tails'; won: boolean; bet: number; payout: number; newBalance: number }

export default function CoinflipClient({ initialBalance, channels }: { initialBalance: number; channels: DiscordChannel[] }) {
  const [balance, setBalance] = useState(initialBalance);
  const [bet, setBet] = useState(50);
  const [choice, setChoice] = useState<'heads' | 'tails'>('heads');
  const [flipping, setFlipping] = useState(false);
  const [outcome, setOutcome] = useState<'heads' | 'tails' | null>(null);
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
    setOutcome(null);

    try {
      const res = await fetch('/api/play/coinflip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bet, choice, share, channel_id: share ? channelId : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // Lock the animated face to the server's outcome, then wait for the
      // flip keyframe to complete before revealing the win/loss card.
      setOutcome(data.outcome);
      await new Promise(r => setTimeout(r, 1700));
      setResult(data);
      setBalance(data.newBalance);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setFlipping(false);
    }
  };

  const won = result?.won;

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
        {/* 3D stage — perspective on the wrapper, preserve-3d on the coin. */}
        <div style={{ perspective: '1000px' }} className="w-40 h-40 flex items-center justify-center">
          <div
            className={outcome === 'heads' ? 'coin-flipping-heads' : outcome === 'tails' ? 'coin-flipping-tails' : ''}
            style={{
              width: '160px',
              height: '160px',
              position: 'relative',
              transformStyle: 'preserve-3d',
              transform: outcome === null ? 'rotateY(0deg)' : undefined,
            }}
          >
            {/* Heads face (front) */}
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center text-6xl"
              style={{
                background: 'radial-gradient(circle at 30% 25%, #FFE082 0%, #F5B62E 40%, #B8860B 100%)',
                border: '4px solid #8B6914',
                boxShadow: 'inset 0 -6px 12px rgba(0,0,0,0.35), inset 0 4px 8px rgba(255,255,255,0.4), 0 12px 30px rgba(245,182,46,0.5)',
                backfaceVisibility: 'hidden',
              }}
            >
              <span style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>👑</span>
            </div>
            {/* Tails face (back) — rotated 180 on Y */}
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center text-6xl"
              style={{
                background: 'radial-gradient(circle at 30% 25%, #FFE082 0%, #F5B62E 40%, #B8860B 100%)',
                border: '4px solid #8B6914',
                boxShadow: 'inset 0 -6px 12px rgba(0,0,0,0.35), inset 0 4px 8px rgba(255,255,255,0.4), 0 12px 30px rgba(245,182,46,0.5)',
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
              }}
            >
              <span style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>⚡</span>
            </div>
            {/* Edge ring — a thin cylinder look with a subtle stripe pattern. */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: 'repeating-linear-gradient(90deg, rgba(139,105,20,0.9) 0 2px, rgba(184,134,11,0.9) 2px 4px)',
                transform: 'translateZ(-2px)',
                opacity: 0.15,
              }}
            />
          </div>
        </div>

        <div className="mt-3 text-sm text-pulse-mute uppercase tracking-widest">
          {flipping && outcome === null ? 'Flipping…' : outcome === 'heads' ? '👑 Heads' : outcome === 'tails' ? '⚡ Tails' : 'Ready'}
        </div>

        {result && !flipping && (
          <div className="mt-4 text-center">
            {won ? (
              <>
                <div className="text-2xl font-bold text-pulse-gold multi-pulse">🎉 +{(result.payout - result.bet).toLocaleString('en-US')} PULSE net</div>
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
            <button onClick={() => setChoice('heads')} className={`py-3 rounded-lg font-semibold border transition-all ${choice === 'heads' ? 'bg-pulse-gold text-black border-pulse-gold shadow-brand' : 'bg-pulse-border/40 text-pulse-mute border-transparent'}`}>👑 Heads</button>
            <button onClick={() => setChoice('tails')} className={`py-3 rounded-lg font-semibold border transition-all ${choice === 'tails' ? 'bg-pulse-gold text-black border-pulse-gold shadow-brand' : 'bg-pulse-border/40 text-pulse-mute border-transparent'}`}>⚡ Tails</button>
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
          className="w-full bg-pulse-gold text-black font-bold text-lg py-4 rounded-xl disabled:opacity-50 shadow-brand">
          {flipping ? 'Flipping…' : `🪙 FLIP — ${bet} PULSE`}
        </button>

        {error && <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
      </div>
    </>
  );
}
