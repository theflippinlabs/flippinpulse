'use client';

import { useEffect, useState } from 'react';
import { pickDefaultShareChannel, type DiscordChannel } from '@/lib/channelTypes';
import { useLocale } from '@/lib/i18n-client';

interface Result { seed: number; roll: number; choice: 'higher' | 'lower'; won: boolean; multiplier: number; bet: number; payout: number; newBalance: number }

// One playing-card face. Uses radial highlights for a subtle 3D pop and
// puts the number in the four canonical corners plus a large center.
function CardFace({ value, color, backface = false }: { value: number; color: string; backface?: boolean }) {
  return (
    <div
      className="absolute inset-0 rounded-2xl flex items-center justify-center"
      style={{
        background: 'linear-gradient(180deg, #fdfcf5 0%, #f0eee0 100%)',
        border: '3px solid #d4a12c',
        boxShadow: 'inset 0 4px 12px rgba(255,255,255,0.5), inset 0 -6px 14px rgba(0,0,0,0.15), 0 15px 35px rgba(0,0,0,0.5)',
        backfaceVisibility: 'hidden',
        transform: backface ? 'rotateY(180deg)' : undefined,
        color,
      }}
    >
      <span className="absolute top-2 left-3 text-lg font-black">{value}</span>
      <span className="absolute top-2 right-3 text-lg font-black">{value}</span>
      <span className="absolute bottom-2 right-3 text-lg font-black rotate-180">{value}</span>
      <span className="absolute bottom-2 left-3 text-lg font-black rotate-180">{value}</span>
      <span className="text-6xl md:text-7xl font-black" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.15))' }}>{value}</span>
    </div>
  );
}

// The card back — shown before the flip. Diagonal PULSE monogram pattern.
function CardBack() {
  return (
    <div
      className="absolute inset-0 rounded-2xl flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #1a0f04 0%, #3a2410 50%, #1a0f04 100%)',
        border: '3px solid #F5B62E',
        boxShadow: 'inset 0 4px 12px rgba(245,182,46,0.2), inset 0 -6px 14px rgba(0,0,0,0.5), 0 15px 35px rgba(0,0,0,0.5)',
        backfaceVisibility: 'hidden',
      }}
    >
      <div
        className="absolute inset-2 rounded-xl opacity-40"
        style={{
          background: 'repeating-linear-gradient(45deg, transparent 0 8px, rgba(245,182,46,0.3) 8px 10px)',
        }}
      />
      <div className="text-5xl font-black text-pulse-gold" style={{ filter: 'drop-shadow(0 0 15px rgba(245,182,46,0.6))' }}>?</div>
    </div>
  );
}

export default function HigherLowerClient({ initialBalance, channels }: { initialBalance: number; channels: DiscordChannel[] }) {
  const locale = useLocale();
  const [balance, setBalance] = useState(initialBalance);
  const [bet, setBet] = useState(25);
  const [seed, setSeed] = useState<number>(Math.floor(Math.random() * 98) + 2);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(true);
  const [channelId, setChannelId] = useState('');
  const [flipping, setFlipping] = useState(false);

  useEffect(() => setChannelId(pickDefaultShareChannel(channels)), [channels]);

  const play = async (choice: 'higher' | 'lower') => {
    if (busy) return;
    if (balance < bet) { setError('Not enough PULSE.'); return; }
    setBusy(true);
    setError(null);
    setResult(null);
    setFlipping(false);
    try {
      const res = await fetch('/api/play/higherlower', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bet, seed, choice, share, channel_id: share ? channelId : undefined, locale }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      // Tiny suspense beat, then let the seed card flip to reveal the roll.
      await new Promise(r => setTimeout(r, 250));
      setFlipping(true);
      await new Promise(r => setTimeout(r, 950));
      setResult(data);
      setBalance(data.newBalance);
      // Fresh seed for next round after a moment of the result showing.
      setTimeout(() => {
        setSeed(Math.floor(Math.random() * 98) + 2);
        setFlipping(false);
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
      setFlipping(false);
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

      <div className="bg-gradient-to-br from-pulse-gold/15 to-pulse-gold/5 border border-pulse-gold/30 rounded-2xl p-6 mb-4">
        <div className="text-xs uppercase text-pulse-mute mb-2 text-center">Beat this card</div>

        {/* Two cards side by side: seed on the left, reveal on the right. */}
        <div className="flex items-center justify-center gap-4 md:gap-6" style={{ perspective: '1400px' }}>
          {/* Seed card — static, always face-up. */}
          <div className="relative w-28 h-40 md:w-32 md:h-44">
            <CardFace value={seed} color="#B8860B" />
          </div>

          <div className="text-3xl text-pulse-gold/80">vs</div>

          {/* Roll card — starts as back, flips to reveal roll after play. */}
          <div className="relative w-28 h-40 md:w-32 md:h-44">
            <div
              className={`absolute inset-0 ${flipping ? 'card-flipping' : ''}`}
              style={{
                transformStyle: 'preserve-3d',
                transform: !flipping && !result ? 'rotateY(0deg)' : undefined,
              }}
            >
              <CardBack />
              {result && (
                <CardFace value={result.roll} color={result.won ? '#0f6f2c' : '#8B0F0F'} backface />
              )}
            </div>
          </div>
        </div>

        {result && !flipping && (
          <div className="mt-5 border-t border-pulse-border/60 pt-3 text-center">
            {result.won ? (
              <>
                <div className="text-lg font-bold text-pulse-gold multi-pulse">🎉 +{(result.payout - result.bet).toLocaleString('en-US')} PULSE net</div>
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
            className="py-4 rounded-xl bg-gradient-to-b from-red-500 to-red-700 text-white font-bold disabled:opacity-50 shadow-lg border border-red-400/40">
            🔽 LOWER<br/><span className="text-xs opacity-90">{lowerMulti}×</span>
          </button>
          <button onClick={() => play('higher')} disabled={busy || balance < bet}
            className="py-4 rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 text-black font-bold disabled:opacity-50 shadow-lg border border-emerald-300/40">
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
