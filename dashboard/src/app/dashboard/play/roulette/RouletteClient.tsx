'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { pickDefaultShareChannel, type DiscordChannel } from '@/lib/channelTypes';

// European wheel — must match the server's WHEEL_ORDER.
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

interface Result {
  spin: number;
  color: 'red' | 'black' | 'green';
  won: boolean;
  bet: number;
  payout: number;
  multiplier: number;
  newBalance: number;
}

function betLabel(k: BetKind): string {
  if (k.type === 'color') return k.value === 'red' ? 'Rouge' : 'Noir';
  if (k.type === 'parity') return k.value === 'even' ? 'Pair' : 'Impair';
  if (k.type === 'range') return k.value === 'low' ? '1–18' : '19–36';
  if (k.type === 'dozen') return `Douzaine ${k.value}`;
  if (k.type === 'column') return `Colonne ${k.value}`;
  return `#${k.value}`;
}

function payoutMulti(k: BetKind): number {
  if (k.type === 'straight') return 36;
  if (k.type === 'dozen' || k.type === 'column') return 3;
  return 2;
}

export default function RouletteClient({
  initialBalance,
  channels,
}: {
  initialBalance: number;
  channels: DiscordChannel[];
}) {
  const [balance, setBalance] = useState(initialBalance);
  const [bet, setBet] = useState(25);
  const [wager, setWager] = useState<BetKind>({ type: 'color', value: 'red' });
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(true);
  const [channelId, setChannelId] = useState('');
  const [wheelRotation, setWheelRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);
  const activeRef = useRef(false);

  useEffect(() => setChannelId(pickDefaultShareChannel(channels)), [channels]);

  const play = async () => {
    if (spinning) return;
    if (balance < bet) { setError('Not enough PULSE.'); return; }
    setSpinning(true);
    activeRef.current = true;
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/play/roulette', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bet, wager, share, channel_id: share ? channelId : undefined }),
      });
      const data: Result & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Position the wheel so `spin` ends up at the top pointer. Each pocket
      // is 360/37 degrees. Add 6 extra full rotations for drama.
      const idx = WHEEL.indexOf(data.spin);
      const perPocket = 360 / WHEEL.length;
      const targetWheel = 360 * 6 + (WHEEL.length - idx) * perPocket;
      const targetBall = -(360 * 10) - Math.random() * 45;
      setWheelRotation(targetWheel);
      setBallRotation(targetBall);

      await new Promise(r => setTimeout(r, 3500));
      if (!activeRef.current) return;

      setResult(data);
      setBalance(data.newBalance);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setSpinning(false);
      activeRef.current = false;
    }
  };

  // Preview the number/color grid inside the wheel's viewport.
  const currentMulti = payoutMulti(wager);

  return (
    <>
      <div className="flex items-center justify-between bg-pulse-card border border-pulse-border rounded-xl p-3 mb-4">
        <div>
          <div className="text-xs text-pulse-mute uppercase tracking-wide">Your PULSE</div>
          <div className="text-2xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-right text-xs text-pulse-mute">
          <div>Bet: <b className="text-pulse-text">{betLabel(wager)}</b></div>
          <div>Pays <span className="text-pulse-gold font-semibold">{currentMulti}×</span></div>
        </div>
      </div>

      {/* Wheel */}
      <div className="bg-gradient-to-br from-[#3a1f10] via-[#1a0f06] to-[#0a0605] border-2 border-pulse-gold/50 rounded-3xl p-4 md:p-6 mb-4 shadow-2xl">
        <div className="relative mx-auto" style={{ width: 260, height: 260 }}>
          {/* Pointer */}
          <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-20"
               style={{ width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '14px solid #F5B62E' }} />
          {/* Wheel */}
          <div
            className="absolute inset-0 rounded-full will-change-transform"
            style={{
              transform: `rotate(${wheelRotation}deg)`,
              transition: spinning ? 'transform 3.4s cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none',
              background:
                'conic-gradient(from -4.86deg, ' +
                WHEEL.map((n, i) => {
                  const c = color(n);
                  const bg = c === 'green' ? '#0f7d3d' : c === 'red' ? '#c62828' : '#111';
                  return `${bg} ${i * 360 / WHEEL.length}deg ${(i + 1) * 360 / WHEEL.length}deg`;
                }).join(', ') + ')',
              boxShadow: 'inset 0 0 30px rgba(0,0,0,0.7), 0 0 20px rgba(245,182,46,0.3)',
            }}
          >
            {/* Numbers laid out along the rim */}
            {WHEEL.map((n, i) => {
              const angle = i * 360 / WHEEL.length;
              return (
                <div
                  key={n}
                  className="absolute left-1/2 top-1/2 text-white text-[10px] font-bold pointer-events-none"
                  style={{
                    transform: `rotate(${angle}deg) translateY(-108px) rotate(${-angle}deg)`,
                    transformOrigin: '0 0',
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                  }}
                >{n}</div>
              );
            })}
          </div>
          {/* Ball track */}
          <div
            className="absolute inset-0 will-change-transform"
            style={{
              transform: `rotate(${ballRotation}deg)`,
              transition: spinning ? 'transform 3.4s cubic-bezier(0.15, 0.65, 0.35, 1)' : 'none',
            }}
          >
            <div
              className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow-lg"
              style={{ top: 8, boxShadow: '0 0 8px rgba(255,255,255,0.8), 0 2px 4px rgba(0,0,0,0.5)' }}
            />
          </div>
          {/* Center hub */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-gradient-to-br from-pulse-gold via-[#B8860B] to-[#5a4008] border-4 border-[#3a2a10] flex items-center justify-center shadow-inner">
            {result && !spinning ? (
              <div className="text-center">
                <div className={`text-3xl font-black ${result.color === 'red' ? 'text-red-200' : result.color === 'green' ? 'text-emerald-200' : 'text-white'}`}>{result.spin}</div>
                <div className="text-[9px] uppercase text-black/70">{result.color}</div>
              </div>
            ) : (
              <div className="text-4xl">⚡</div>
            )}
          </div>
        </div>

        {result && !spinning && (
          <div className="mt-4 text-center">
            {result.won ? (
              <div>
                <div className="text-2xl font-bold text-pulse-gold multi-pulse">🎉 +{(result.payout - result.bet).toLocaleString('en-US')} PULSE net</div>
                <div className="text-xs text-pulse-mute">{result.multiplier}× · {result.payout.toLocaleString('en-US')} back</div>
              </div>
            ) : (
              <div className="text-lg text-red-300">– {result.bet.toLocaleString('en-US')} PULSE</div>
            )}
          </div>
        )}
      </div>

      {/* Bet picker */}
      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 space-y-4">
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

        {/* Simple bet grid: colors / parity / range / dozens / columns.
            Straight numbers live in a "single number" popover to keep the
            main screen tight. */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <BetBtn active={eq(wager, { type: 'color', value: 'red' })}    label="🔴 Rouge (2×)"   onClick={() => setWager({ type: 'color', value: 'red' })} tone="red" />
            <BetBtn active={eq(wager, { type: 'color', value: 'black' })}  label="⚫ Noir (2×)"    onClick={() => setWager({ type: 'color', value: 'black' })} tone="black" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <BetBtn active={eq(wager, { type: 'parity', value: 'even' })}  label="Pair (2×)"      onClick={() => setWager({ type: 'parity', value: 'even' })} />
            <BetBtn active={eq(wager, { type: 'parity', value: 'odd' })}   label="Impair (2×)"    onClick={() => setWager({ type: 'parity', value: 'odd' })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <BetBtn active={eq(wager, { type: 'range', value: 'low' })}    label="1–18 (2×)"      onClick={() => setWager({ type: 'range', value: 'low' })} />
            <BetBtn active={eq(wager, { type: 'range', value: 'high' })}   label="19–36 (2×)"     onClick={() => setWager({ type: 'range', value: 'high' })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map(d => (
              <BetBtn key={d} active={eq(wager, { type: 'dozen', value: d as 1|2|3 })} label={`Douz. ${d} (3×)`} onClick={() => setWager({ type: 'dozen', value: d as 1|2|3 })} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map(c => (
              <BetBtn key={c} active={eq(wager, { type: 'column', value: c as 1|2|3 })} label={`Col. ${c} (3×)`} onClick={() => setWager({ type: 'column', value: c as 1|2|3 })} />
            ))}
          </div>
        </div>

        {/* Single-number picker */}
        <details className="group">
          <summary className="list-none cursor-pointer flex items-center justify-between text-sm text-pulse-mute hover:text-pulse-gold">
            <span>🎯 Bet on a single number (36×)</span>
            <span className="group-open:rotate-180 transition-transform">›</span>
          </summary>
          <div className="mt-3 grid grid-cols-7 gap-1">
            {Array.from({ length: 37 }, (_, i) => i).map(n => {
              const c = color(n);
              const bg = c === 'green' ? 'bg-emerald-700' : c === 'red' ? 'bg-red-700' : 'bg-black';
              const active = wager.type === 'straight' && wager.value === n;
              return (
                <button
                  key={n}
                  onClick={() => setWager({ type: 'straight', value: n })}
                  className={`${bg} text-white text-xs font-bold rounded aspect-square ${active ? 'ring-2 ring-pulse-gold shadow-brand' : 'opacity-90'}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </details>

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

        <button onClick={play} disabled={spinning || balance < bet}
          className="w-full bg-pulse-gold text-black font-bold text-lg py-4 rounded-xl disabled:opacity-50 shadow-brand">
          {spinning ? 'Spinning…' : `🎡 SPIN — ${bet} PULSE on ${betLabel(wager)}`}
        </button>

        {error && <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
      </div>
    </>
  );
}

function BetBtn({ active, label, onClick, tone }: { active: boolean; label: string; onClick: () => void; tone?: 'red' | 'black' }) {
  const base = 'py-2.5 rounded-lg text-xs font-semibold border transition-all';
  const activeCls = 'bg-pulse-gold text-black border-pulse-gold shadow-brand';
  const toneCls = tone === 'red' ? 'bg-red-800/40 text-red-100 border-red-700/40'
                : tone === 'black' ? 'bg-black/60 text-white border-pulse-border'
                : 'bg-pulse-border/40 text-pulse-mute border-transparent';
  return (
    <button onClick={onClick} className={`${base} ${active ? activeCls : toneCls}`}>{label}</button>
  );
}

function eq(a: BetKind, b: BetKind): boolean {
  return a.type === b.type && (a as { value: unknown }).value === (b as { value: unknown }).value;
}
