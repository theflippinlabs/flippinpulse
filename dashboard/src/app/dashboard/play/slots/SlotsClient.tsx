'use client';

import { useEffect, useState } from 'react';
import type { DiscordChannel } from '@/lib/channels';

const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];

interface Result {
  reels: string[];
  bet: number;
  payout: number;
  net: number;
  newBalance: number;
}

export default function SlotsClient({ initialBalance, channels }: { initialBalance: number; channels: DiscordChannel[] }) {
  const [balance, setBalance] = useState(initialBalance);
  const [bet, setBet] = useState(25);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState<string[]>(['🎰', '🎰', '🎰']);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState(true);
  const [channelId, setChannelId] = useState<string>('');
  const [stats, setStats] = useState({ plays: 0, wins: 0, biggest: 0 });

  useEffect(() => {
    setChannelId(channels[0]?.channel_id ?? '');
  }, [channels]);

  const spin = async () => {
    if (spinning) return;
    if (balance < bet) { setError('Not enough PULSE.'); return; }
    setSpinning(true);
    setError(null);
    setResult(null);

    // Fake spin animation before we know the result — cycle random symbols.
    const spinInterval = setInterval(() => {
      setReels([
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      ]);
    }, 80);

    try {
      const res = await fetch('/api/play/slots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bet, share, channel_id: share ? channelId : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Stop reels one by one for drama.
      await new Promise(r => setTimeout(r, 700));
      clearInterval(spinInterval);
      setReels([data.reels[0], SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)], SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]]);
      await new Promise(r => setTimeout(r, 400));
      setReels([data.reels[0], data.reels[1], SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]]);
      await new Promise(r => setTimeout(r, 400));
      setReels(data.reels);

      setResult(data);
      setBalance(data.newBalance);
      setStats(s => ({
        plays: s.plays + 1,
        wins: s.wins + (data.payout > 0 ? 1 : 0),
        biggest: Math.max(s.biggest, data.payout),
      }));
    } catch (err) {
      clearInterval(spinInterval);
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setSpinning(false);
    }
  };

  const won = result && result.payout > 0;
  const multi = result && result.bet > 0 ? Math.floor(result.payout / result.bet) : 0;

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

      <div className="bg-gradient-to-br from-pulse-gold/20 to-pulse-gold/5 border border-pulse-gold/30 rounded-2xl p-6 mb-4">
        <div className="flex justify-center gap-2 md:gap-4 mb-2">
          {reels.map((s, i) => (
            <div
              key={i}
              className={`w-20 h-20 md:w-24 md:h-24 bg-black rounded-2xl border-2 border-pulse-gold/50 flex items-center justify-center text-5xl md:text-6xl shadow-brand ${spinning ? 'animate-pulse' : ''}`}
            >
              {s}
            </div>
          ))}
        </div>
        {result && (
          <div className="text-center mt-3">
            {won ? (
              <div>
                <div className="text-2xl font-bold text-pulse-gold">🎉 +{result.payout.toLocaleString('en-US')} PULSE</div>
                <div className="text-sm text-pulse-mute">{multi}× your bet</div>
              </div>
            ) : (
              <div className="text-lg text-pulse-mute">– {result.bet.toLocaleString('en-US')} PULSE</div>
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
          className="w-full bg-pulse-gold text-black font-bold text-lg py-4 rounded-xl disabled:opacity-50"
        >
          {spinning ? 'Spinning…' : `🎰 SPIN — ${bet} PULSE`}
        </button>

        {error && <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
      </div>

      <div className="mt-4 bg-pulse-card border border-pulse-border rounded-xl p-3 text-xs text-pulse-mute">
        <div className="font-semibold text-pulse-text mb-1">Payouts (per bet)</div>
        <div>3× 7️⃣ = <b className="text-pulse-gold">50×</b> · 3× 💎 = <b className="text-pulse-gold">20×</b> · 3× ⭐ = <b className="text-pulse-gold">10×</b> · 3× other = 5× · any 2 match = 1×</div>
      </div>
    </>
  );
}
