'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiscordChannel } from '@/lib/channels';

function multiplierAt(elapsedMs: number): number {
  const t = elapsedMs / 1000;
  return Math.max(1, 1 + Math.pow(t, 1.18) / 6);
}

interface Session {
  token: string;
  bet: number;
  started_at_ms: number;
  crash_at_ms: number;
  crash_mult: number;
}

interface Outcome {
  crashed: boolean;
  cashed_mult?: number;
  crash_mult: number;
  bet: number;
  payout: number;
  newBalance?: number;
}

type Phase = 'idle' | 'running' | 'crashing' | 'ended';

// Small helper — build the SVG points for the live curve.
function multiplierPoints(startMs: number, nowMs: number, width: number, height: number, maxMult: number): string {
  const samples = 60;
  const durationMs = nowMs - startMs;
  const points: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * durationMs;
    const m = multiplierAt(t);
    const x = (i / samples) * width;
    const y = height - Math.min(height, ((m - 1) / (maxMult - 1)) * height);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(' ');
}

// Danger tint — green → yellow → orange → red as multiplier grows.
function dangerTint(mult: number): string {
  if (mult < 1.5) return 'from-emerald-500/30 to-emerald-500/5 border-emerald-500/30';
  if (mult < 2.5) return 'from-lime-500/30 to-lime-500/5 border-lime-500/40';
  if (mult < 4)   return 'from-yellow-500/30 to-yellow-500/5 border-yellow-500/40';
  if (mult < 8)   return 'from-orange-500/30 to-orange-500/5 border-orange-500/50';
  return 'from-red-500/40 to-red-500/10 border-red-500/60';
}

interface Coin { id: number; dx: number; delay: number }

export default function ChickenClient({ initialBalance, channels }: { initialBalance: number; channels: DiscordChannel[] }) {
  const [balance, setBalance] = useState(initialBalance);
  const [bet, setBet] = useState(50);
  const [phase, setPhase] = useState<Phase>('idle');
  const [session, setSession] = useState<Session | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [nowMs, setNowMs] = useState(Date.now());
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(true);
  const [channelId, setChannelId] = useState('');
  const [stats, setStats] = useState({ plays: 0, wins: 0, biggest: 0 });
  const [coins, setCoins] = useState<Coin[]>([]);
  const cashingRef = useRef(false);
  const coinIdRef = useRef(0);

  useEffect(() => setChannelId(channels[0]?.channel_id ?? ''), [channels]);

  useEffect(() => {
    if (phase !== 'running' || !session) return;
    const start = session.started_at_ms;
    const handle = setInterval(() => {
      const now = Date.now();
      const elapsed = now - start;
      setNowMs(now);
      setMultiplier(multiplierAt(elapsed));
      if (elapsed >= session.crash_at_ms && !cashingRef.current) {
        cashingRef.current = true;
        setPhase('crashing');
        // Wait for the flee animation to play, then resolve on the server.
        setTimeout(() => { void doCashout(); }, 1500);
      }
    }, 60);
    return () => clearInterval(handle);
  }, [phase, session]);

  const spawnCoins = (count: number) => {
    const batch: Coin[] = [];
    for (let i = 0; i < count; i++) {
      coinIdRef.current += 1;
      batch.push({
        id: coinIdRef.current,
        dx: (Math.random() - 0.5) * 300,
        delay: Math.random() * 0.4,
      });
    }
    setCoins(c => [...c, ...batch]);
    setTimeout(() => setCoins(c => c.filter(x => !batch.find(b => b.id === x.id))), 2200);
  };

  const start = async () => {
    if (phase === 'running' || phase === 'crashing') return;
    if (balance < bet) { setError('Not enough PULSE.'); return; }
    setError(null);
    setOutcome(null);
    try {
      const res = await fetch('/api/play/chicken/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSession({
        token: data.token,
        bet: data.bet,
        started_at_ms: data.started_at_ms,
        crash_at_ms: data.crash_at_ms,
        crash_mult: data.crash_mult,
      });
      setBalance(data.newBalance);
      setMultiplier(1);
      setNowMs(Date.now());
      setPhase('running');
      cashingRef.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  };

  const doCashout = async () => {
    if (!session) return;
    if (!cashingRef.current) cashingRef.current = true;
    try {
      const res = await fetch('/api/play/chicken/cashout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: session.token,
          share,
          channel_id: share ? channelId : undefined,
        }),
      });
      const data = (await res.json()) as Outcome;
      if (!res.ok) throw new Error((data as unknown as { error?: string }).error ?? `HTTP ${res.status}`);
      if (!data.crashed) spawnCoins(18);
      setOutcome(data);
      setPhase('ended');
      if (typeof data.newBalance === 'number') setBalance(data.newBalance);
      const net = data.crashed ? -data.bet : (data.payout - data.bet);
      setStats(s => ({
        plays: s.plays + 1,
        wins: s.wins + (net > 0 ? 1 : 0),
        biggest: Math.max(s.biggest, net > 0 ? net : 0),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
      setPhase('idle');
      cashingRef.current = false;
    }
  };

  const cashOut = async () => {
    if (phase !== 'running') return;
    if (cashingRef.current) return;
    cashingRef.current = true;
    spawnCoins(12);
    await doCashout();
  };

  const playAgain = () => {
    setPhase('idle');
    setSession(null);
    setOutcome(null);
    setMultiplier(1);
    cashingRef.current = false;
  };

  const displayMult = phase === 'running' ? multiplier : phase === 'crashing' ? session?.crash_mult ?? multiplier : phase === 'ended' ? (outcome?.crashed ? outcome.crash_mult : outcome?.cashed_mult ?? 1) : 1;

  // Live curve — visible while running or crashing.
  const svgPoints = useMemo(() => {
    if (!session) return '';
    const now = phase === 'running' ? nowMs : session.started_at_ms + Math.min(nowMs - session.started_at_ms, session.crash_at_ms);
    const maxMult = Math.max(2, (session.crash_mult) * 1.05, displayMult * 1.05);
    return multiplierPoints(session.started_at_ms, now, 300, 100, maxMult);
  }, [session, nowMs, phase, displayMult]);

  const tint = phase === 'crashing' || (phase === 'ended' && outcome?.crashed)
    ? 'from-red-500/40 to-red-500/10 border-red-500/60'
    : phase === 'ended' && !outcome?.crashed
      ? 'from-emerald-500/30 to-emerald-500/5 border-emerald-500/40'
      : dangerTint(displayMult);

  const highTension = phase === 'running' && multiplier >= 4;
  const arenaShaking = phase === 'crashing';

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

      {/* Arena */}
      <div
        className={`relative bg-gradient-to-br ${tint} border rounded-2xl overflow-hidden mb-4 transition-colors duration-300 ${arenaShaking ? 'crash-shake' : ''}`}
        style={{ height: '58vh', minHeight: '380px' }}
      >
        {/* Top: multiplier */}
        <div className="absolute inset-x-0 top-4 text-center z-10">
          <div className="text-[10px] tracking-widest uppercase text-pulse-mute">
            {phase === 'idle' && 'Ready'}
            {phase === 'running' && 'LIVE'}
            {phase === 'crashing' && '💨 The chicken flew!'}
            {phase === 'ended' && (outcome?.crashed ? 'Wiped' : '💸 Cashed out')}
          </div>
          <div
            className={`text-6xl md:text-7xl font-black text-pulse-gold ${highTension ? 'multi-pulse' : ''} ${phase === 'crashing' || (phase === 'ended' && outcome?.crashed) ? 'text-red-400' : ''}`}
          >
            {displayMult.toFixed(2)}<span className="text-3xl">x</span>
          </div>
        </div>

        {/* Live curve chart */}
        {session && phase !== 'idle' && (
          <svg
            className="absolute inset-x-0 top-32 mx-auto opacity-70"
            width="90%"
            height="100"
            viewBox="0 0 300 100"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F5B62E" stopOpacity="0.7"/>
                <stop offset="100%" stopColor="#F5B62E" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {svgPoints && (
              <>
                <polyline
                  points={`${svgPoints} 300,100 0,100`}
                  fill="url(#lineGrad)"
                  stroke="none"
                />
                <polyline
                  points={svgPoints}
                  fill="none"
                  stroke={phase === 'crashing' || (phase === 'ended' && outcome?.crashed) ? '#EF4444' : '#F5B62E'}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </>
            )}
          </svg>
        )}

        {/* Chicken sprite — walks in idle, runs while live, flies away on crash */}
        <div className="absolute bottom-16 left-4 md:left-8 pointer-events-none">
          <div
            className={
              phase === 'idle' ? 'chicken-walking text-5xl' :
              phase === 'running' ? 'chicken-running text-5xl' :
              phase === 'crashing' || (phase === 'ended' && outcome?.crashed) ? 'chicken-fleeing text-5xl' :
              'text-5xl'
            }
          >
            🐔
          </div>
        </div>

        {/* Ground / dust — animated when running */}
        <div className="absolute inset-x-0 bottom-8 h-2 opacity-40">
          <div
            className={`h-full ${phase === 'running' ? 'ground-scrolling' : ''}`}
            style={{
              background: 'repeating-linear-gradient(90deg, transparent 0px, transparent 20px, #F5B62E44 20px, #F5B62E44 24px)',
              backgroundSize: '200px 100%',
            }}
          />
        </div>

        {/* Coin rain on cash out */}
        {coins.map(c => (
          <div
            key={c.id}
            className="absolute top-40 left-1/2 -translate-x-1/2 text-2xl pointer-events-none coin-drop"
            style={{ ['--dx' as string]: `${c.dx}px`, animationDelay: `${c.delay}s` }}
          >
            🪙
          </div>
        ))}

        {/* Outcome banner */}
        {phase === 'ended' && outcome && (
          <div className="absolute inset-x-0 bottom-4 text-center px-4">
            {outcome.crashed ? (
              <div className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3">
                <div className="text-lg font-bold text-red-300">💀 You stayed too long</div>
                <div className="text-xs text-pulse-mute">Lost {outcome.bet.toLocaleString('en-US')} PULSE</div>
              </div>
            ) : (
              <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-xl px-4 py-3">
                <div className="text-xl font-bold text-pulse-gold">🎉 +{(outcome.payout - outcome.bet).toLocaleString('en-US')} PULSE net</div>
                <div className="text-xs text-pulse-mute">
                  {outcome.payout.toLocaleString('en-US')} back · chicken flew at <span className="text-red-400 font-semibold">{outcome.crash_mult.toFixed(2)}x</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 space-y-4">
        {phase === 'idle' && (
          <>
            <div>
              <label className="text-xs uppercase text-pulse-mute">Bet (1-500 PULSE)</label>
              <input type="number" min={1} max={500} value={bet}
                onChange={e => setBet(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2 mt-2">
                {[10, 25, 50, 100, 250].map(v => (
                  <button key={v} onClick={() => setBet(v)}
                    className={`flex-1 py-1.5 rounded-lg text-xs ${bet === v ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} className="accent-pulse-gold" />
              Share 3×+ wins to Discord
            </label>

            {share && (
              <div>
                <label className="text-xs uppercase text-pulse-mute">Channel</label>
                <select value={channelId} onChange={e => setChannelId(e.target.value)}
                  className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm">
                  {channels.map(c => <option key={c.channel_id} value={c.channel_id}># {c.name}</option>)}
                </select>
              </div>
            )}

            <button onClick={start} disabled={balance < bet}
              className="w-full bg-pulse-gold text-black font-bold text-lg py-4 rounded-xl disabled:opacity-50 shadow-brand">
              🐔 JUMP ON — {bet} PULSE
            </button>
          </>
        )}

        {phase === 'running' && (
          <button onClick={cashOut}
            className="w-full bg-emerald-500 text-black font-bold text-2xl py-6 rounded-xl shadow-brand active:scale-95 transition-transform">
            💸 CASH OUT {multiplier.toFixed(2)}x
          </button>
        )}

        {phase === 'crashing' && (
          <div className="w-full bg-red-500/20 border border-red-500/40 text-red-200 font-bold text-lg py-6 rounded-xl text-center">
            🐔💨 Chicken's gone…
          </div>
        )}

        {phase === 'ended' && (
          <button onClick={playAgain}
            className="w-full bg-pulse-gold text-black font-bold text-lg py-4 rounded-xl">
            🔁 Play again
          </button>
        )}

        {error && <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
      </div>

      <div className="mt-4 bg-pulse-card border border-pulse-border rounded-xl p-3 text-xs text-pulse-mute">
        <div className="font-semibold text-pulse-text mb-1">How it works</div>
        <div>Bet, jump on the chicken. Multiplier climbs 🐔🏃. Cash out any time. If the chicken flies before you cash out → wiped. Median crash ~4-6×, tail up to 50×.</div>
      </div>
    </>
  );
}
