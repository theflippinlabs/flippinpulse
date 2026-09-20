'use client';

import { useEffect, useRef, useState } from 'react';
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

type Phase = 'idle' | 'running' | 'ended';

export default function ChickenClient({ initialBalance, channels }: { initialBalance: number; channels: DiscordChannel[] }) {
  const [balance, setBalance] = useState(initialBalance);
  const [bet, setBet] = useState(50);
  const [phase, setPhase] = useState<Phase>('idle');
  const [session, setSession] = useState<Session | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(true);
  const [channelId, setChannelId] = useState('');
  const [stats, setStats] = useState({ plays: 0, wins: 0, biggest: 0 });
  const cashingRef = useRef(false);

  useEffect(() => setChannelId(channels[0]?.channel_id ?? ''), [channels]);

  // Live tick multiplier and trigger auto-crash locally when crash_at_ms elapses.
  useEffect(() => {
    if (phase !== 'running' || !session) return;
    const start = session.started_at_ms;
    const handle = setInterval(() => {
      const elapsed = Date.now() - start;
      const m = multiplierAt(elapsed);
      setMultiplier(m);
      // Auto-crash locally: freeze UI, then send a cashout (which the server
      // will report as too late), so the outcome card shows.
      if (elapsed >= session.crash_at_ms && !cashingRef.current) {
        cashingRef.current = true;
        void doCashout();
      }
    }, 100);
    return () => clearInterval(handle);
  }, [phase, session]);

  const start = async () => {
    if (phase === 'running') return;
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
      setPhase('running');
      cashingRef.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  };

  const doCashout = async () => {
    if (!session) return;
    if (cashingRef.current === false) cashingRef.current = true;
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
      setOutcome(data);
      setPhase('ended');
      if (typeof data.newBalance === 'number') setBalance(data.newBalance);
      setStats(s => ({
        plays: s.plays + 1,
        wins: s.wins + (data.crashed ? 0 : 1),
        biggest: Math.max(s.biggest, data.crashed ? 0 : data.payout),
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
    await doCashout();
  };

  const playAgain = () => {
    setPhase('idle');
    setSession(null);
    setOutcome(null);
    setMultiplier(1);
    cashingRef.current = false;
  };

  const displayMult = phase === 'running' ? multiplier : phase === 'ended' ? (outcome?.crashed ? outcome.crash_mult : outcome?.cashed_mult ?? 1) : 1;

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

      {/* Big multiplier display */}
      <div
        className={`rounded-2xl p-6 mb-4 text-center border transition-colors ${
          phase === 'ended' && outcome?.crashed
            ? 'bg-red-500/10 border-red-500/40'
            : phase === 'ended'
              ? 'bg-emerald-500/10 border-emerald-500/40'
              : 'bg-gradient-to-br from-pulse-gold/20 to-pulse-gold/5 border-pulse-gold/30'
        }`}
      >
        <div className="text-xs uppercase tracking-widest text-pulse-mute mb-1">
          {phase === 'running' ? 'LIVE' : phase === 'ended' && outcome?.crashed ? 'The chicken flew!' : phase === 'ended' ? 'Cashed out' : 'Ready'}
        </div>
        <div className={`text-7xl md:text-8xl font-bold ${phase === 'ended' && outcome?.crashed ? 'text-red-400' : 'text-pulse-gold'}`}>
          {displayMult.toFixed(2)}<span className="text-3xl">x</span>
        </div>
        <div className="text-4xl mt-2">
          {phase === 'ended' && outcome?.crashed ? '🐔💨' : phase === 'ended' ? '💸' : '🐔'}
        </div>

        {outcome && (
          <div className="mt-4">
            {outcome.crashed ? (
              <>
                <div className="text-lg font-bold text-red-300">💀 You stayed too long</div>
                <div className="text-sm text-pulse-mute">Lost {outcome.bet.toLocaleString('en-US')} PULSE</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-pulse-gold">🎉 +{outcome.payout.toLocaleString('en-US')} PULSE</div>
                <div className="text-xs text-pulse-mute mt-1">The chicken flew at <span className="text-red-400 font-semibold">{outcome.crash_mult.toFixed(2)}x</span></div>
              </>
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
              className="w-full bg-pulse-gold text-black font-bold text-lg py-4 rounded-xl disabled:opacity-50">
              🐔 JUMP ON — {bet} PULSE
            </button>
          </>
        )}

        {phase === 'running' && (
          <button onClick={cashOut}
            className="w-full bg-emerald-500 text-black font-bold text-2xl py-6 rounded-xl">
            💸 CASH OUT {multiplier.toFixed(2)}x
          </button>
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
        <div className="font-semibold text-pulse-text mb-1">Payouts</div>
        <div>Your win = bet × current multiplier. Chicken can fly at any moment — 2% chance instant, median around 4-6×, long tail up to 50×.</div>
      </div>
    </>
  );
}
