'use client';

import { useState } from 'react';

// Player-visible state during a live hand. `token` is the HMAC-signed hand
// the server re-signs after each action; dealer is masked to just the
// up-card until the hand ends.
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

function suitSymbol(s: string): string {
  return s === 'S' ? '♠' : s === 'H' ? '♥' : s === 'D' ? '♦' : '♣';
}

function suitColor(s: string): string {
  return s === 'H' || s === 'D' ? 'text-red-500' : 'text-neutral-900';
}

function Card({ card, hidden = false }: { card?: string; hidden?: boolean }) {
  if (hidden || !card) {
    return (
      <div
        className="w-16 h-24 md:w-20 md:h-28 rounded-lg border-2 border-pulse-gold flex items-center justify-center shadow-xl"
        style={{
          background: 'linear-gradient(135deg, #1a0f04 0%, #3a2410 50%, #1a0f04 100%)',
          boxShadow: 'inset 0 4px 8px rgba(245,182,46,0.15), inset 0 -6px 10px rgba(0,0,0,0.4), 0 8px 18px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="absolute w-12 h-20 rounded opacity-40"
          style={{ background: 'repeating-linear-gradient(45deg, transparent 0 6px, rgba(245,182,46,0.3) 6px 8px)' }}
        />
        <span className="text-2xl font-black text-pulse-gold relative">⚡</span>
      </div>
    );
  }
  const rank = card.slice(0, card.length - 1);
  const suit = card.slice(-1);
  const sym = suitSymbol(suit);
  const cls = suitColor(suit);
  return (
    <div
      className="w-16 h-24 md:w-20 md:h-28 rounded-lg flex flex-col justify-between p-1.5 relative shadow-xl"
      style={{
        background: 'linear-gradient(180deg, #fdfcf5 0%, #f0eee0 100%)',
        border: '2px solid #d4a12c',
        boxShadow: 'inset 0 3px 8px rgba(255,255,255,0.5), inset 0 -4px 10px rgba(0,0,0,0.15), 0 8px 18px rgba(0,0,0,0.5)',
      }}
    >
      <div className={`text-xs font-black leading-none ${cls}`}>
        <div>{rank}</div>
        <div>{sym}</div>
      </div>
      <div className={`text-3xl md:text-4xl font-black self-center ${cls}`}>{sym}</div>
      <div className={`text-xs font-black self-end leading-none rotate-180 ${cls}`}>
        <div>{rank}</div>
        <div>{sym}</div>
      </div>
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
      } else {
        setLive(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  };

  // Combined view: while playing show live state; when hand ends show final.
  const player = final?.player ?? live?.player ?? [];
  const dealerRevealed = final?.dealer ?? [];
  const dealerUp = live?.dealerUpCard;
  const playerTotal = final?.playerTotal ?? live?.playerTotal;
  const dealerTotal = final?.dealerTotal;

  const net = final ? final.payout - final.bet : 0;

  return (
    <>
      <div className="flex items-center justify-between bg-pulse-card border border-pulse-border rounded-xl p-3 mb-4">
        <div>
          <div className="text-xs text-pulse-mute uppercase tracking-wide">Your PULSE</div>
          <div className="text-2xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-xs text-pulse-mute text-right">
          <div>Blackjack pays <b className="text-pulse-gold">2.5×</b></div>
          <div>Push refunds</div>
        </div>
      </div>

      <div
        className="rounded-3xl p-5 md:p-7 mb-4 border-2 border-pulse-gold/40 shadow-2xl"
        style={{
          background: 'radial-gradient(ellipse at center, #0d4a2b 0%, #082e1a 60%, #041508 100%)',
        }}
      >
        {/* Dealer */}
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-pulse-gold/70 mb-2 text-center">Dealer{dealerTotal ? ` — ${dealerTotal}` : ''}</div>
          <div className="flex items-center justify-center gap-2">
            {live ? (
              <>
                <Card card={dealerUp} />
                <Card hidden />
              </>
            ) : dealerRevealed.length ? (
              dealerRevealed.map((c, i) => <Card key={`${c}-${i}`} card={c} />)
            ) : (
              <>
                <Card hidden />
                <Card hidden />
              </>
            )}
          </div>
        </div>

        {/* Player */}
        <div>
          <div className="text-xs uppercase tracking-widest text-pulse-gold/70 mb-2 text-center">You{playerTotal ? ` — ${playerTotal}` : ''}</div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {player.length ? player.map((c, i) => <Card key={`${c}-${i}`} card={c} />) : (
              <>
                <Card hidden />
                <Card hidden />
              </>
            )}
          </div>
        </div>

        {final && (
          <div className="mt-5 text-center">
            {final.outcome === 'blackjack' && (
              <div className="text-2xl font-black text-pulse-gold multi-pulse">🃏 BLACKJACK! +{net.toLocaleString('en-US')} PULSE</div>
            )}
            {final.outcome === 'win' && (
              <div className="text-2xl font-bold text-pulse-gold">🎉 +{net.toLocaleString('en-US')} PULSE net</div>
            )}
            {final.outcome === 'push' && (
              <div className="text-lg text-pulse-mute">↩️ Push — bet refunded</div>
            )}
            {final.outcome === 'bust' && (
              <div className="text-lg text-red-300">💥 Bust — {final.bet.toLocaleString('en-US')} PULSE</div>
            )}
            {final.outcome === 'lose' && (
              <div className="text-lg text-red-300">Dealer wins — {final.bet.toLocaleString('en-US')} PULSE</div>
            )}
            {final.outcome === 'dealer_blackjack' && (
              <div className="text-lg text-red-300">Dealer blackjack — {final.bet.toLocaleString('en-US')} PULSE</div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      {live ? (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button onClick={() => act('hit')} disabled={busy}
            className="py-4 rounded-xl bg-emerald-500 text-black font-bold disabled:opacity-50">
            ➕ HIT
          </button>
          <button onClick={() => act('stand')} disabled={busy}
            className="py-4 rounded-xl bg-pulse-gold text-black font-bold disabled:opacity-50">
            ✋ STAND
          </button>
          <button onClick={() => act('double')} disabled={busy || balance < live.bet}
            className="py-4 rounded-xl bg-red-500 text-black font-bold disabled:opacity-50">
            2× DOUBLE
          </button>
        </div>
      ) : (
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

          <button onClick={deal} disabled={busy || balance < bet}
            className="w-full bg-pulse-gold text-black font-bold text-lg py-4 rounded-xl disabled:opacity-50 shadow-brand">
            {busy ? 'Dealing…' : `🃏 DEAL — ${bet} PULSE`}
          </button>
        </div>
      )}

      {error && <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
    </>
  );
}
