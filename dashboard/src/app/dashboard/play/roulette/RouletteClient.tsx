'use client';

import { useEffect, useState } from 'react';
import { pickDefaultShareChannel, type DiscordChannel } from '@/lib/channelTypes';

// European wheel order — visual only; must match the server for the ball to
// land on the right pocket.
const WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const color = (n: number): 'red' | 'black' | 'green' =>
  n === 0 ? 'green' : RED.has(n) ? 'red' : 'black';

type BetKind =
  | { type: 'color'; value: 'red' | 'black' }
  | { type: 'parity'; value: 'even' | 'odd' }
  | { type: 'range'; value: 'low' | 'high' }
  | { type: 'dozen'; value: 1 | 2 | 3 }
  | { type: 'column'; value: 1 | 2 | 3 }
  | { type: 'straight'; value: number };

interface Wager { kind: BetKind; amount: number }

interface BetResult { kind: BetKind; amount: number; hit: boolean; payout: number }
interface Result {
  spin: number;
  color: 'red' | 'black' | 'green';
  totalStake: number;
  totalPayout: number;
  net: number;
  results: BetResult[];
  newBalance: number;
}

const CHIPS = [5, 10, 25, 50, 100];
const CHIP_STYLES: Record<number, string> = {
  5:   'from-red-500 to-red-700 border-red-900',
  10:  'from-blue-500 to-blue-700 border-blue-900',
  25:  'from-emerald-500 to-emerald-700 border-emerald-900',
  50:  'from-orange-500 to-orange-700 border-orange-900',
  100: 'from-pulse-gold to-[#B8860B] border-[#5a4008]',
};

// Standard European table row order (top to bottom): 3s, 2s, 1s.
// Columns run 1..12 across, giving each row the classic 12-cell strip.
const TABLE_ROWS: number[][] = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

function keyOf(k: BetKind): string {
  return `${k.type}:${(k as { value: unknown }).value}`;
}

function eqKind(a: BetKind, b: BetKind): boolean {
  return a.type === b.type && (a as { value: unknown }).value === (b as { value: unknown }).value;
}

function betLabel(k: BetKind): string {
  if (k.type === 'color') return k.value === 'red' ? '🔴 Rouge' : '⚫ Noir';
  if (k.type === 'parity') return k.value === 'even' ? 'Pair' : 'Impair';
  if (k.type === 'range') return k.value === 'low' ? '1–18' : '19–36';
  if (k.type === 'dozen') return `Douz. ${k.value}`;
  if (k.type === 'column') return `Col. ${k.value}`;
  return `#${k.value}`;
}

// Render a mini chip (visual stack indicator on the felt).
function Chip({ amount }: { amount: number }) {
  const style = CHIP_STYLES[amount] ?? CHIP_STYLES[100];
  return (
    <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full bg-gradient-to-b ${style} border-2 text-[9px] md:text-[10px] font-black text-white flex items-center justify-center shadow-lg`}
         style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.4)' }}>
      {amount >= 1000 ? `${amount / 1000}k` : amount}
    </div>
  );
}

export default function RouletteClient({
  initialBalance,
  channels,
}: {
  initialBalance: number;
  channels: DiscordChannel[];
}) {
  const [balance, setBalance] = useState(initialBalance);
  const [chip, setChip] = useState(25);
  const [wagers, setWagers] = useState<Wager[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(true);
  const [channelId, setChannelId] = useState('');
  const [wheelRotation, setWheelRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);

  useEffect(() => setChannelId(pickDefaultShareChannel(channels)), [channels]);

  const total = wagers.reduce((s, w) => s + w.amount, 0);

  // Placing a chip: stack it on an existing wager if the kind matches,
  // otherwise push a new row. Tap-again toggle would be surprising once
  // you've stacked chips, so it always adds.
  const place = (kind: BetKind) => {
    if (spinning) return;
    setResult(null);
    setError(null);
    if (total + chip > 500) { setError('Max 500 PULSE per spin total.'); return; }
    setWagers(prev => {
      const idx = prev.findIndex(w => eqKind(w.kind, kind));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { kind, amount: next[idx].amount + chip };
        return next;
      }
      return [...prev, { kind, amount: chip }];
    });
  };

  const clearAll = () => {
    if (spinning) return;
    setWagers([]);
    setResult(null);
    setError(null);
  };

  const removeAt = (i: number) => {
    if (spinning) return;
    setWagers(prev => prev.filter((_, idx) => idx !== i));
  };

  const spin = async () => {
    if (spinning) return;
    if (!wagers.length) { setError('Place at least one bet.'); return; }
    if (balance < total) { setError('Not enough PULSE.'); return; }
    setSpinning(true);
    setError(null);

    try {
      const res = await fetch('/api/play/roulette', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wagers, share, channel_id: share ? channelId : undefined }),
      });
      const data: Result & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const idx = WHEEL.indexOf(data.spin);
      const perPocket = 360 / WHEEL.length;
      // Long, dramatic spin — wheel does ~12 full turns, ball does ~24 in
      // the opposite direction, both landing precisely on the winning pocket.
      const targetWheel = 360 * 12 + (WHEEL.length - idx) * perPocket;
      const targetBall = -(360 * 24) - Math.random() * 60;
      setWheelRotation(targetWheel);
      setBallRotation(targetBall);

      await new Promise(r => setTimeout(r, 7200));

      setResult(data);
      setBalance(data.newBalance);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setSpinning(false);
    }
  };

  // Aggregate chips per betting square so the felt shows them.
  const chipsAt = (kind: BetKind): number => {
    const w = wagers.find(w => eqKind(w.kind, kind));
    return w?.amount ?? 0;
  };

  // Highlight cells that won on the last spin so the result is legible on
  // the felt itself.
  const hit = (kind: BetKind): boolean => {
    if (!result || spinning) return false;
    return result.results.some(r => eqKind(r.kind, kind) && r.hit);
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between bg-pulse-card border border-pulse-border rounded-xl p-3 mb-4">
        <div>
          <div className="text-xs text-pulse-mute uppercase tracking-wide">Your PULSE</div>
          <div className="text-2xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-pulse-mute uppercase">Total mise</div>
          <div className={`text-2xl font-bold ${total > 0 ? 'text-pulse-gold' : 'text-pulse-mute'}`}>{total}</div>
        </div>
      </div>

      {/* Wheel — larger, richer bezel, long deceleration */}
      <div className="bg-gradient-to-br from-[#3a1f10] via-[#1a0f06] to-[#0a0605] border-2 border-pulse-gold/60 rounded-3xl p-4 mb-4 shadow-2xl">
        <div className="relative mx-auto" style={{ width: 280, height: 280 }}>
          {/* Outer gold bezel with subtle inner shadow */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle at 30% 25%, #F5B62E 0%, #B8860B 40%, #5a4008 100%)',
              boxShadow: 'inset 0 6px 14px rgba(255,255,255,0.25), inset 0 -8px 20px rgba(0,0,0,0.6), 0 12px 30px rgba(0,0,0,0.6)',
            }}
          />
          {/* Pointer at the top of the bezel */}
          <div className="absolute left-1/2 -top-2 -translate-x-1/2 z-20"
               style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }}>
            <div style={{ width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '18px solid #F5B62E' }} />
          </div>

          {/* Inner disk — the wheel itself, inset from the bezel */}
          <div className="absolute rounded-full overflow-hidden will-change-transform"
               style={{
                 top: 14, left: 14, right: 14, bottom: 14,
                 transform: `rotate(${wheelRotation}deg)`,
                 // Long cubic-bezier: fast start, gentle taper, tiny settle at the end.
                 transition: spinning ? 'transform 7s cubic-bezier(0.17, 0.72, 0.22, 1)' : 'none',
                 background:
                   'conic-gradient(from -4.86deg, ' +
                   WHEEL.map((n, i) => {
                     const c = color(n);
                     const bg = c === 'green' ? '#0f7d3d' : c === 'red' ? '#c62828' : '#111';
                     return `${bg} ${i * 360 / WHEEL.length}deg ${(i + 1) * 360 / WHEEL.length}deg`;
                   }).join(', ') + ')',
                 boxShadow: 'inset 0 0 30px rgba(0,0,0,0.9)',
               }}
          >
            {WHEEL.map((n, i) => {
              const angle = i * 360 / WHEEL.length;
              return (
                <div key={n}
                     className="absolute left-1/2 top-1/2 text-white text-[10px] font-bold pointer-events-none"
                     style={{
                       transform: `rotate(${angle}deg) translateY(-116px) rotate(${-angle}deg)`,
                       transformOrigin: '0 0',
                       textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                     }}>{n}</div>
              );
            })}
            {/* Radial dividers between pockets for that authentic look */}
            {WHEEL.map((_, i) => {
              const angle = i * 360 / WHEEL.length;
              return (
                <div key={`div-${i}`}
                     className="absolute left-1/2 top-1/2 bg-black/50 pointer-events-none"
                     style={{
                       width: 1, height: 120,
                       transform: `rotate(${angle}deg) translateY(-100%)`,
                       transformOrigin: '0 100%',
                     }} />
              );
            })}
          </div>

          {/* Ball track — rotates in the opposite direction, longer transition */}
          <div className="absolute inset-0 will-change-transform"
               style={{
                 transform: `rotate(${ballRotation}deg)`,
                 // Ball starts fast, decelerates hard as it drops into a pocket.
                 transition: spinning ? 'transform 7s cubic-bezier(0.12, 0.75, 0.25, 1)' : 'none',
               }}>
            <div className="absolute left-1/2 -translate-x-1/2 rounded-full"
                 style={{
                   top: 22,
                   width: 14, height: 14,
                   background: 'radial-gradient(circle at 30% 25%, #fff 0%, #e5e7eb 50%, #9ca3af 100%)',
                   boxShadow: '0 0 10px rgba(255,255,255,0.9), 0 3px 6px rgba(0,0,0,0.6), inset 0 -1px 2px rgba(0,0,0,0.3)',
                 }} />
          </div>

          {/* Center hub */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center"
               style={{
                 width: 88, height: 88,
                 background: 'radial-gradient(circle at 30% 25%, #F5B62E 0%, #B8860B 40%, #5a4008 100%)',
                 border: '4px solid #3a2a10',
                 boxShadow: 'inset 0 -4px 10px rgba(0,0,0,0.5), inset 0 4px 8px rgba(255,255,255,0.4), 0 4px 12px rgba(0,0,0,0.6)',
               }}
          >
            {result && !spinning ? (
              <div className="text-center">
                <div className={`text-3xl font-black ${result.color === 'red' ? 'text-red-200' : result.color === 'green' ? 'text-emerald-200' : 'text-white'}`}>{result.spin}</div>
                <div className="text-[9px] uppercase text-black/70 font-bold">{result.color}</div>
              </div>
            ) : (
              <div className="text-4xl" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}>⚡</div>
            )}
          </div>
        </div>

        {result && !spinning && (
          <div className="mt-3 text-center">
            {result.net > 0 ? (
              <div>
                <div className="text-2xl font-bold text-pulse-gold multi-pulse">🎉 +{result.net.toLocaleString('en-US')} PULSE net</div>
                <div className="text-xs text-pulse-mute">{result.totalPayout} back on {result.totalStake} staked</div>
              </div>
            ) : result.net === 0 ? (
              <div className="text-lg text-pulse-mute">↩️ Break even</div>
            ) : (
              <div className="text-lg text-red-300">– {(-result.net).toLocaleString('en-US')} PULSE</div>
            )}
          </div>
        )}
      </div>

      {/* Betting table (felt) */}
      <div
        className="rounded-2xl p-2 md:p-3 mb-4 border-2 border-pulse-gold/40 shadow-2xl"
        style={{
          background: 'radial-gradient(ellipse at center, #0d4a2b 0%, #082e1a 60%, #041508 100%)',
        }}
      >
        {/* Row: 0 + numbers grid + column bets */}
        <div className="flex gap-1">
          {/* 0 spans 3 rows */}
          <button
            disabled={spinning}
            onClick={() => place({ type: 'straight', value: 0 })}
            className={`relative bg-emerald-700 border border-emerald-900 text-white font-bold rounded flex flex-col items-center justify-center transition-transform active:scale-95 ${hit({ type: 'straight', value: 0 }) ? 'ring-4 ring-pulse-gold' : ''}`}
            style={{ width: 36, minHeight: 3 * 40 + 8 }}
          >
            <span className="text-lg">0</span>
            {chipsAt({ type: 'straight', value: 0 }) > 0 && (
              <div className="absolute -bottom-1 -right-1"><Chip amount={chipsAt({ type: 'straight', value: 0 })} /></div>
            )}
          </button>

          {/* Numbers grid — 3 rows × 12 columns */}
          <div className="flex-1 space-y-1">
            {TABLE_ROWS.map((row, ri) => (
              <div key={ri} className="grid grid-cols-12 gap-1">
                {row.map(n => {
                  const c = color(n);
                  const bg = c === 'red' ? 'bg-red-700 border-red-900' : 'bg-neutral-900 border-black';
                  const chips = chipsAt({ type: 'straight', value: n });
                  const winner = hit({ type: 'straight', value: n });
                  return (
                    <button
                      key={n}
                      disabled={spinning}
                      onClick={() => place({ type: 'straight', value: n })}
                      className={`relative aspect-[3/4] ${bg} border text-white text-xs md:text-sm font-bold rounded transition-transform active:scale-95 ${winner ? 'ring-2 ring-pulse-gold shadow-brand' : ''}`}
                      style={{ minHeight: 40 }}
                    >
                      {n}
                      {chips > 0 && (
                        <div className="absolute -bottom-1 -right-1"><Chip amount={chips} /></div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Column bets (2:1) on the right */}
          <div className="space-y-1">
            {[3, 2, 1].map(col => {
              const kind: BetKind = { type: 'column', value: col as 1 | 2 | 3 };
              const winner = hit(kind);
              return (
                <button
                  key={col}
                  disabled={spinning}
                  onClick={() => place(kind)}
                  className={`relative bg-emerald-900/60 border border-pulse-gold/30 text-white text-[10px] font-bold rounded flex items-center justify-center transition-transform active:scale-95 ${winner ? 'ring-2 ring-pulse-gold' : ''}`}
                  style={{ width: 36, height: 40 }}
                >
                  2:1
                  {chipsAt(kind) > 0 && (
                    <div className="absolute -bottom-1 -right-1"><Chip amount={chipsAt(kind)} /></div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dozens */}
        <div className="mt-1 ml-[40px] mr-[40px] grid grid-cols-3 gap-1">
          {[1, 2, 3].map(d => {
            const kind: BetKind = { type: 'dozen', value: d as 1 | 2 | 3 };
            const winner = hit(kind);
            return (
              <button
                key={d}
                disabled={spinning}
                onClick={() => place(kind)}
                className={`relative bg-emerald-900/50 border border-pulse-gold/30 text-white text-[10px] font-bold py-2 rounded transition-transform active:scale-95 ${winner ? 'ring-2 ring-pulse-gold' : ''}`}
              >
                {d === 1 ? '1–12' : d === 2 ? '13–24' : '25–36'}
                <div className="text-[8px] font-normal text-emerald-200/80">Douzaine · 2:1</div>
                {chipsAt(kind) > 0 && (
                  <div className="absolute -top-1 -right-1"><Chip amount={chipsAt(kind)} /></div>
                )}
              </button>
            );
          })}
        </div>

        {/* Outside bets */}
        <div className="mt-1 ml-[40px] mr-[40px] grid grid-cols-6 gap-1">
          {([
            { kind: { type: 'range', value: 'low' } as BetKind,   label: '1–18' },
            { kind: { type: 'parity', value: 'even' } as BetKind, label: 'PAIR' },
            { kind: { type: 'color', value: 'red' } as BetKind,   label: 'ROUGE', tone: 'red' },
            { kind: { type: 'color', value: 'black' } as BetKind, label: 'NOIR',  tone: 'black' },
            { kind: { type: 'parity', value: 'odd' } as BetKind,  label: 'IMPAIR' },
            { kind: { type: 'range', value: 'high' } as BetKind,  label: '19–36' },
          ] as { kind: BetKind; label: string; tone?: 'red' | 'black' }[]).map(({ kind, label, tone }) => {
            const winner = hit(kind);
            const bg = tone === 'red' ? 'bg-red-700 border-red-900'
                    : tone === 'black' ? 'bg-neutral-900 border-black'
                    : 'bg-emerald-900/60 border-pulse-gold/30';
            return (
              <button
                key={label}
                disabled={spinning}
                onClick={() => place(kind)}
                className={`relative ${bg} text-white text-[10px] font-bold py-2 rounded transition-transform active:scale-95 ${winner ? 'ring-2 ring-pulse-gold' : ''}`}
              >
                {label}
                {chipsAt(kind) > 0 && (
                  <div className="absolute -top-1 -right-1"><Chip amount={chipsAt(kind)} /></div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chip picker */}
      <div className="bg-pulse-card border border-pulse-border rounded-xl p-3 mb-3">
        <div className="text-xs uppercase text-pulse-mute mb-2">Jeton</div>
        <div className="flex gap-2 justify-between">
          {CHIPS.map(c => {
            const style = CHIP_STYLES[c];
            const active = chip === c;
            return (
              <button
                key={c}
                onClick={() => setChip(c)}
                className={`relative w-12 h-12 rounded-full bg-gradient-to-b ${style} border-4 flex items-center justify-center font-black text-white text-sm transition-transform ${active ? 'scale-110 ring-4 ring-pulse-gold ring-offset-2 ring-offset-pulse-card' : ''}`}
                style={{ boxShadow: '0 3px 8px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.3)' }}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active wagers list */}
      {wagers.length > 0 && (
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase text-pulse-mute">Mises actives</div>
            <button onClick={clearAll} className="text-xs text-red-400 hover:text-red-300">Tout effacer</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {wagers.map((w, i) => (
              <button
                key={keyOf(w.kind) + '-' + i}
                onClick={() => removeAt(i)}
                className="flex items-center gap-2 bg-pulse-bg border border-pulse-border rounded-lg px-2 py-1 text-xs hover:border-red-500/40"
              >
                <span>{betLabel(w.kind)}</span>
                <span className="text-pulse-gold font-bold">{w.amount}</span>
                <span className="text-pulse-mute">✕</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Share + spin */}
      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} className="accent-pulse-gold" />
          Share big wins to Discord (500+ net)
        </label>

        {share && (
          <div>
            <label className="text-xs uppercase text-pulse-mute">Announce channel</label>
            <select value={channelId} onChange={e => setChannelId(e.target.value)} className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm">
              {channels.map(c => <option key={c.channel_id} value={c.channel_id}># {c.name}</option>)}
            </select>
          </div>
        )}

        <button
          onClick={spin}
          disabled={spinning || !wagers.length || balance < total}
          className="w-full bg-pulse-gold text-black font-bold text-lg py-4 rounded-xl disabled:opacity-50 shadow-brand"
        >
          {spinning ? 'Spinning…' : wagers.length ? `🎡 SPIN — ${total} PULSE` : '🎡 Pose au moins un jeton'}
        </button>

        {error && <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
      </div>
    </>
  );
}
