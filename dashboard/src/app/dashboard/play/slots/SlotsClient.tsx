'use client';

import { useEffect, useRef, useState } from 'react';
import type { DiscordChannel } from '@/lib/channels';

// Symbols shown in the machine, in visual order. Repeated in the reel strip
// below to make the vertical scroll seamless when it wraps.
const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];
const STRIP = [...SYMBOLS, ...SYMBOLS, ...SYMBOLS, ...SYMBOLS];
const CELL_H = 96; // px — matches Tailwind h-24

interface Result {
  reels: string[];
  bet: number;
  payout: number;
  net: number;
  newBalance: number;
}

// One reel: a tall vertical strip of symbols we scroll with CSS transforms.
// While spinning, the strip translates up quickly and wraps; when stopped
// we compute an offset that lands the final symbol dead center with a
// spring-y ease that overshoots slightly then settles.
function Reel({ spinning, symbol, delay, jackpot }: { spinning: boolean; symbol: string; delay: number; jackpot: boolean }) {
  const [offset, setOffset] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    if (spinning) {
      startRef.current = performance.now();
      const loop = (t: number) => {
        const dt = t - startRef.current;
        // Fast scroll: cycle full strip every 250ms.
        setOffset(-((dt / 250) * SYMBOLS.length * CELL_H) % (SYMBOLS.length * CELL_H));
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }
    // Stop: schedule the landing offset after `delay`.
    const idx = SYMBOLS.indexOf(symbol);
    if (idx < 0) return;
    const timer = setTimeout(() => {
      // Land on the second copy of the symbol so we always scroll a bit.
      const targetOffset = -(idx + SYMBOLS.length) * CELL_H;
      setOffset(targetOffset);
    }, delay);
    return () => clearTimeout(timer);
  }, [spinning, symbol, delay]);

  return (
    <div
      className={`relative w-20 h-24 md:w-24 md:h-24 bg-black rounded-2xl border-2 overflow-hidden shadow-brand ${jackpot ? 'jackpot border-pulse-gold' : 'border-pulse-gold/50'}`}
      style={{ perspective: '600px' }}
    >
      {/* Reel glass gradient (top/bottom fade). */}
      <div className="pointer-events-none absolute inset-0 z-10"
           style={{
             background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 75%, rgba(0,0,0,0.85) 100%)',
           }}
      />
      {/* Center line highlight when locked. */}
      {!spinning && (
        <div className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 h-1 rounded-full z-10"
             style={{ boxShadow: '0 0 20px rgba(245,182,46,0.8)', background: 'rgba(245,182,46,0.6)' }}
        />
      )}
      <div
        className="absolute inset-x-0 flex flex-col items-center will-change-transform"
        style={{
          transform: `translateY(${offset}px)`,
          transition: spinning ? 'none' : 'transform 0.9s cubic-bezier(0.16, 1.1, 0.3, 1)',
        }}
      >
        {STRIP.map((s, i) => (
          <div key={i} className="h-24 flex items-center justify-center text-5xl md:text-6xl select-none"
               style={{ transform: 'rotateX(4deg)' }}>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SlotsClient({ initialBalance, channels }: { initialBalance: number; channels: DiscordChannel[] }) {
  const [balance, setBalance] = useState(initialBalance);
  const [bet, setBet] = useState(25);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState<string[]>(['7️⃣', '💎', '⭐']);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(true);
  const [channelId, setChannelId] = useState<string>('');
  const [stats, setStats] = useState({ plays: 0, wins: 0, biggest: 0 });
  const [lever, setLever] = useState(false);

  useEffect(() => setChannelId(channels[0]?.channel_id ?? ''), [channels]);

  const spin = async () => {
    if (spinning) return;
    if (balance < bet) { setError('Not enough PULSE.'); return; }
    setSpinning(true);
    setError(null);
    setResult(null);
    setLever(true);
    setTimeout(() => setLever(false), 400);

    try {
      const res = await fetch('/api/play/slots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bet, share, channel_id: share ? channelId : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Let the reels spin at speed for a beat, then lock them.
      await new Promise(r => setTimeout(r, 1400));
      setReels(data.reels);
      // Wait for the third reel to fully settle before showing the verdict.
      await new Promise(r => setTimeout(r, 1400));

      setResult(data);
      setBalance(data.newBalance);
      const netGain = data.payout - data.bet;
      setStats(s => ({
        plays: s.plays + 1,
        wins: s.wins + (netGain > 0 ? 1 : 0),
        biggest: Math.max(s.biggest, netGain),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setSpinning(false);
    }
  };

  const net = result ? result.payout - result.bet : 0;
  const won = net > 0;
  const push = result && result.payout > 0 && net === 0;
  const multi = result && result.bet > 0 ? (result.payout / result.bet) : 0;
  const jackpot = !!(result && reels[0] === reels[1] && reels[1] === reels[2] && !spinning);

  return (
    <>
      <div className="flex items-center justify-between bg-pulse-card border border-pulse-border rounded-xl p-3 mb-4">
        <div>
          <div className="text-xs text-pulse-mute uppercase tracking-wide">Your PULSE</div>
          <div className="text-2xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-right text-xs text-pulse-mute">
          <div>Plays: <span className="text-pulse-text font-semibold">{stats.plays}</span></div>
          <div>Wins: <span className="text-emerald-400 font-semibold">{stats.wins}</span></div>
          <div>Biggest: <span className="text-pulse-gold font-semibold">{stats.biggest.toLocaleString('en-US')}</span></div>
        </div>
      </div>

      {/* Cabinet: gradient bezel + lever on the right. */}
      <div className="relative bg-gradient-to-b from-[#3a2a10] via-[#1a1206] to-[#0a0805] border-2 border-pulse-gold/60 rounded-3xl p-4 md:p-6 mb-4 shadow-2xl">
        {/* Top marquee */}
        <div className="text-center mb-3">
          <div className={`inline-block px-4 py-1 rounded-full bg-black/60 border border-pulse-gold/50 text-xs tracking-widest font-bold ${jackpot ? 'multi-pulse text-pulse-gold' : 'text-pulse-gold/80'}`}>
            {jackpot ? '★ JACKPOT ★' : 'FLIPPIN SLOTS'}
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 md:gap-6">
          <div className="flex gap-2 md:gap-3">
            {reels.map((s, i) => (
              <Reel key={i} spinning={spinning} symbol={s} delay={i * 400} jackpot={jackpot} />
            ))}
          </div>

          {/* Lever */}
          <button
            onClick={spin}
            disabled={spinning || balance < bet}
            aria-label="Pull lever"
            className="hidden md:flex flex-col items-center gap-1 group disabled:opacity-40"
          >
            <div className="w-3 h-16 rounded-full bg-gradient-to-b from-neutral-500 to-neutral-700 shadow-inner" />
            <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-700 border-2 border-red-900 shadow-lg transition-transform ${lever ? 'translate-y-6' : 'group-hover:translate-y-1'}`} />
          </button>
        </div>

        {result && !spinning && (
          <div className="text-center mt-4">
            {won ? (
              <div>
                <div className={`text-3xl font-black ${jackpot ? 'text-pulse-gold multi-pulse' : 'text-pulse-gold'}`}>+{net.toLocaleString('en-US')} PULSE</div>
                <div className="text-sm text-pulse-mute">{multi.toFixed(1)}× · {result.payout.toLocaleString('en-US')} back</div>
              </div>
            ) : push ? (
              <div className="text-lg text-pulse-mute">↩️ Push — bet refunded</div>
            ) : (
              <div className="text-lg text-red-300">– {result.bet.toLocaleString('en-US')} PULSE</div>
            )}
          </div>
        )}
      </div>

      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 space-y-4">
        <div>
          <label className="text-xs uppercase text-pulse-mute">Bet (1-500 PULSE)</label>
          <div className="flex gap-2 mt-1">
            <input
              type="number"
              min={1}
              max={500}
              value={bet}
              onChange={e => setBet(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className="flex-1 bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={() => setBet(Math.min(500, Math.floor(balance)))} className="px-3 py-2 rounded-lg bg-pulse-border/50 text-xs">Max</button>
          </div>
          <div className="flex gap-2 mt-2">
            {[10, 25, 50, 100].map(v => (
              <button key={v} onClick={() => setBet(v)} className={`flex-1 py-1.5 rounded-lg text-xs ${bet === v ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} className="accent-pulse-gold" />
          Share big wins to Discord (5×+)
        </label>

        {share && (
          <div>
            <label className="text-xs uppercase text-pulse-mute">Announce channel</label>
            <select
              value={channelId}
              onChange={e => setChannelId(e.target.value)}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
            >
              {channels.map(c => <option key={c.channel_id} value={c.channel_id}># {c.name}</option>)}
            </select>
          </div>
        )}

        <button
          onClick={spin}
          disabled={spinning || balance < bet}
          className="w-full bg-pulse-gold text-black font-bold text-lg py-4 rounded-xl disabled:opacity-50 shadow-brand"
        >
          {spinning ? 'Spinning…' : `🎰 SPIN — ${bet} PULSE`}
        </button>

        {error && <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
      </div>

      <div className="mt-4 bg-pulse-card border border-pulse-border rounded-xl p-3 text-xs text-pulse-mute">
        <div className="font-semibold text-pulse-text mb-1">Payouts (per bet)</div>
        <div>3× 7️⃣ = <b className="text-pulse-gold">50×</b> · 3× 💎 = <b className="text-pulse-gold">20×</b> · 3× ⭐ = <b className="text-pulse-gold">10×</b> · 3× other = 5× · any 2 match = 1.5×</div>
      </div>
    </>
  );
}
