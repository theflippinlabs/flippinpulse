'use client';

import { useEffect, useState } from 'react';

interface LiveState {
  token: string;
  bet: number;
  player: string[];
  dealerUpCard: string;
  playerTotal: number;
}

interface FinalState {
  outcome: 'win' | 'lose' | 'push' | 'bust' | 'blackjack' | 'dealer_blackjack';
  bet: number;
  payout: number;
  player: string[];
  dealer: string[];
  playerTotal: number;
  dealerTotal: number;
  newBalance: number;
}

const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR = (s: string) => (s === 'H' || s === 'D' ? '#c62828' : '#1a1a1a');

// Playing card. Flips in 3D from face-down to face-up when `reveal` becomes
// true, so newly dealt cards feel alive.
function Card({ card, hidden, reveal, delay = 0 }: { card?: string; hidden?: boolean; reveal?: boolean; delay?: number }) {
  const [flipped, setFlipped] = useState(!hidden);
  useEffect(() => {
    if (reveal) {
      const t = setTimeout(() => setFlipped(true), delay);
      return () => clearTimeout(t);
    }
    if (hidden) setFlipped(false);
    else setFlipped(true);
  }, [reveal, hidden, delay]);

  const rank = card ? card.slice(0, card.length - 1) : '';
  const suit = card ? card.slice(-1) : '';
  const sym = SUIT_SYMBOL[suit] ?? '';
  const col = SUIT_COLOR(suit);

  return (
    <div className="relative" style={{ width: 72, height: 100, perspective: '1000px' }}>
      <div
        className="absolute inset-0"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(0deg)' : 'rotateY(180deg)',
          transition: 'transform 0.6s cubic-bezier(0.34, 1.2, 0.64, 1)',
        }}
      >
        {/* Front (card face) */}
        <div
          className="absolute inset-0 rounded-lg flex flex-col justify-between p-2"
          style={{
            background: 'linear-gradient(180deg, #fefdf7 0%, #f0eed7 100%)',
            border: '2px solid #d4a12c',
            boxShadow: 'inset 0 3px 8px rgba(255,255,255,0.6), inset 0 -6px 12px rgba(0,0,0,0.15), 0 10px 20px rgba(0,0,0,0.55)',
            backfaceVisibility: 'hidden',
          }}
        >
          <div className="text-xs font-black leading-none" style={{ color: col }}>
            <div>{rank}</div>
            <div className="text-sm leading-none">{sym}</div>
          </div>
          <div className="text-4xl font-black self-center" style={{ color: col, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}>
            {sym}
          </div>
          <div className="text-xs font-black leading-none rotate-180 self-end" style={{ color: col }}>
            <div>{rank}</div>
            <div className="text-sm leading-none">{sym}</div>
          </div>
        </div>
        {/* Back (card back) */}
        <div
          className="absolute inset-0 rounded-lg flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, #1a0f04 0%, #3a2410 50%, #1a0f04 100%)',
            border: '2px solid #F5B62E',
            boxShadow: 'inset 0 3px 8px rgba(245,182,46,0.2), inset 0 -6px 12px rgba(0,0,0,0.5), 0 10px 20px rgba(0,0,0,0.55)',
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <div
            className="absolute inset-1 rounded opacity-40"
            style={{ background: 'repeating-linear-gradient(45deg, transparent 0 6px, rgba(245,182,46,0.4) 6px 8px)' }}
          />
          <div className="relative text-3xl font-black text-pulse-gold" style={{ filter: 'drop-shadow(0 0 8px rgba(245,182,46,0.7))' }}>
            ⚡
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ amount, size = 44 }: { amount: number; size?: number }) {
  return (
    <div
      className="rounded-full bg-gradient-to-b from-pulse-gold to-[#B8860B] border-4 border-[#5a4008] text-black font-black flex items-center justify-center shadow-lg"
      style={{ width: size, height: size, fontSize: size / 3, boxShadow: '0 4px 8px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.4)' }}
    >
      {amount >= 1000 ? `${(amount / 1000).toFixed(0)}k` : amount}
    </div>
  );
}

export default function BlackjackClient({ initialBalance }: { initialBalance: number }) {
  const [balance, setBalance] = useState(initialBalance);
  const [bet, setBet] = useState(50);
  const [live, setLive] = useState<LiveState | null>(null);
  const [final, setFinal] = useState<FinalState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ won: 0, lost: 0, push: 0, blackjacks: 0 });

  const deal = async () => {
    if (busy) return;
    if (balance < bet) { setError('Not enough PULSE.'); return; }
    setBusy(true);
    setError(null);
    setFinal(null);
    setLive(null);
    try {
      const res = await fetch('/api/play/blackjack/deal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bet }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      if (data.done) {
        setFinal(data);
        setBalance(data.newBalance);
        bump(data.outcome);
      } else {
        setLive(data);
        setBalance(data.newBalance);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: 'hit' | 'stand' | 'double') => {
    if (busy || !live) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/play/blackjack/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: live.token, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      if (data.done) {
        setFinal(data);
        setBalance(data.newBalance);
        setLive(null);
        bump(data.outcome);
      } else {
        setLive(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  };

  const bump = (outcome: FinalState['outcome']) => {
    setStats(s => ({
      won:        s.won        + (outcome === 'win' || outcome === 'blackjack' ? 1 : 0),
      lost:       s.lost       + (outcome === 'lose' || outcome === 'bust' || outcome === 'dealer_blackjack' ? 1 : 0),
      push:       s.push       + (outcome === 'push' ? 1 : 0),
      blackjacks: s.blackjacks + (outcome === 'blackjack' ? 1 : 0),
    }));
  };

  const player = final?.player ?? live?.player ?? [];
  const dealerRevealed = final?.dealer ?? [];
  const dealerUp = live?.dealerUpCard;
  const playerTotal = final?.playerTotal ?? live?.playerTotal;
  const dealerTotal = final?.dealerTotal;
  const net = final ? final.payout - final.bet : 0;

  const outcomeBanner = () => {
    if (!final) return null;
    const map: Record<FinalState['outcome'], { icon: string; text: string; color: string }> = {
      blackjack:        { icon: '🃏', text: `BLACKJACK! +${net} PULSE`,    color: 'from-pulse-gold to-yellow-500' },
      win:              { icon: '🎉', text: `Tu gagnes +${net} PULSE`,      color: 'from-emerald-500 to-emerald-700' },
      push:             { icon: '↩️', text: 'Push — mise remboursée',        color: 'from-neutral-500 to-neutral-700' },
      bust:             { icon: '💥', text: `Bust — –${final.bet} PULSE`,   color: 'from-red-600 to-red-800' },
      lose:             { icon: '☠️', text: `Dealer gagne — –${final.bet}`,  color: 'from-red-600 to-red-800' },
      dealer_blackjack: { icon: '🃏', text: `Dealer BJ — –${final.bet}`,     color: 'from-red-600 to-red-800' },
    };
    const b = map[final.outcome];
    return (
      <div className={`bg-gradient-to-r ${b.color} rounded-xl px-4 py-3 flex items-center justify-center gap-3 shadow-xl mb-3`}>
        <span className="text-2xl">{b.icon}</span>
        <span className="font-black text-black text-lg">{b.text}</span>
      </div>
    );
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between bg-pulse-card border border-pulse-border rounded-xl p-3 mb-4">
        <div>
          <div className="text-xs text-pulse-mute uppercase tracking-wide">Your PULSE</div>
          <div className="text-2xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-right text-xs text-pulse-mute space-y-0.5">
          <div>W <b className="text-emerald-400">{stats.won}</b> · L <b className="text-red-400">{stats.lost}</b> · P <b className="text-neutral-300">{stats.push}</b></div>
          <div>BJ pays <b className="text-pulse-gold">2.5×</b> {stats.blackjacks > 0 && <span>· {stats.blackjacks} hit</span>}</div>
        </div>
      </div>

      {outcomeBanner()}

      {/* Felt table with double-ring border and card decorations */}
      <div
        className="relative rounded-3xl p-5 md:p-7 mb-4 border-4 border-pulse-gold/40 shadow-2xl overflow-hidden"
        style={{
          background:
            'radial-gradient(ellipse at 50% 45%, #146d3e 0%, #0a4527 45%, #052a17 100%)',
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5), 0 20px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Faint arc lines like a real BJ layout */}
        <div className="absolute inset-4 rounded-3xl pointer-events-none border-2 border-pulse-gold/15" />
        <div className="absolute inset-8 rounded-3xl pointer-events-none border border-pulse-gold/10" />

        {/* Dealer */}
        <div className="relative mb-6">
          <div className="text-[10px] uppercase tracking-widest text-pulse-gold/70 mb-2 text-center">
            Dealer{dealerTotal ? ` — ${dealerTotal}` : ''}
          </div>
          <div className="flex items-center justify-center gap-2">
            {live ? (
              <>
                <Card card={dealerUp} />
                <Card hidden />
              </>
            ) : dealerRevealed.length ? (
              dealerRevealed.map((c, i) => <Card key={`${c}-${i}`} card={c} reveal delay={i * 200} />)
            ) : (
              <>
                <Card hidden />
                <Card hidden />
              </>
            )}
          </div>
        </div>

        {/* Center felt arc text */}
        <div className="relative text-center my-3">
          <div className="text-[10px] uppercase tracking-widest text-pulse-gold/40">
            Blackjack pays 3 to 2 · Dealer stands on all 17s
          </div>
        </div>

        {/* Player */}
        <div className="relative">
          <div className="text-[10px] uppercase tracking-widest text-pulse-gold/70 mb-2 text-center">
            You{playerTotal ? ` — ${playerTotal}` : ''}
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {player.length ? player.map((c, i) => <Card key={`${c}-${i}`} card={c} reveal delay={i * 150} />) : (
              <>
                <Card hidden />
                <Card hidden />
              </>
            )}
          </div>

          {/* Chip on the felt showing current stake */}
          {(live || final) && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <Chip amount={final?.bet ?? live?.bet ?? bet} size={40} />
              <span className="text-xs text-pulse-gold/70 uppercase tracking-widest">Mise</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      {live ? (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button onClick={() => act('hit')} disabled={busy}
            className="py-4 rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 text-black font-black text-base border-2 border-emerald-800 disabled:opacity-50 shadow-lg active:scale-95 transition-transform">
            ➕ HIT
          </button>
          <button onClick={() => act('stand')} disabled={busy}
            className="py-4 rounded-xl bg-gradient-to-b from-pulse-gold to-[#B8860B] text-black font-black text-base border-2 border-[#5a4008] disabled:opacity-50 shadow-brand active:scale-95 transition-transform">
            ✋ STAND
          </button>
          <button onClick={() => act('double')} disabled={busy || balance < live.bet}
            className="py-4 rounded-xl bg-gradient-to-b from-red-500 to-red-700 text-white font-black text-base border-2 border-red-900 disabled:opacity-50 shadow-lg active:scale-95 transition-transform">
            2× DOUBLE
          </button>
        </div>
      ) : (
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 space-y-4">
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

          <button onClick={deal} disabled={busy || balance < bet}
            className="w-full bg-pulse-gold text-black font-black text-lg py-4 rounded-xl disabled:opacity-50 shadow-brand active:scale-[0.98] transition-transform">
            {busy ? 'Dealing…' : `🃏 DEAL — ${bet} PULSE`}
          </button>
        </div>
      )}

      {error && <div className="mt-3 p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
    </>
  );
}
