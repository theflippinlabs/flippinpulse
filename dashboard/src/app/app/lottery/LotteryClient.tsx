'use client';

import { useState } from 'react';
import { useT, interpolate } from '@/lib/i18n-client';

const fmt = (n: number) => n.toLocaleString('en-US');

export default function LotteryClient({
  ticketPrice, initialBalance, initialMyTickets, initialPot, initialTotalTickets,
}: {
  ticketPrice: number;
  initialBalance: number;
  initialMyTickets: number;
  initialPot: number;
  initialTotalTickets: number;
}) {
  const t = useT();
  const [tickets, setTickets] = useState(1);
  const [balance, setBalance] = useState(initialBalance);
  const [mine, setMine] = useState(initialMyTickets);
  const [pot, setPot] = useState(initialPot);
  const [total, setTotal] = useState(initialTotalTickets);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const cost = ticketPrice * tickets;
  const cantAfford = balance < cost;

  const buy = async () => {
    if (busy) return;
    if (!confirm(interpolate(t('lottery.confirm_buy'), { n: tickets, cost: fmt(cost) }))) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/lottery/buy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tickets }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setBalance(data.newBalance);
      setPot(data.newPot);
      setTotal(data.newTotal);
      setMine(m => m + tickets);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-pulse-mute">
        <span>{t('common.balance')}</span>
        <span className="text-pulse-gold font-bold">{fmt(balance)} PULSE</span>
      </div>

      <div>
        <label className="text-xs uppercase text-pulse-mute">{t('lottery.how_many')}</label>
        <input
          type="number" min={1} max={50}
          value={tickets}
          onChange={e => setTickets(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex gap-2 mt-2">
          {[1, 5, 10, 25, 50].map(n => (
            <button
              key={n}
              onClick={() => setTickets(n)}
              className={`flex-1 py-1.5 rounded-lg text-xs ${tickets === n ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between bg-pulse-bg/50 border border-pulse-border/60 rounded-lg px-3 py-2">
        <span className="text-xs uppercase text-pulse-mute">{t('common.total')}</span>
        <span className={`font-bold ${cantAfford ? 'text-red-300' : 'text-pulse-gold'}`}>{fmt(cost)} PULSE</span>
      </div>

      <button
        onClick={buy}
        disabled={busy || cantAfford}
        className="w-full bg-pulse-gold text-black font-bold py-3 rounded-xl disabled:opacity-40 shadow-brand"
      >
        {busy ? t('lottery.buying')
          : done ? `✅ ${interpolate(t('lottery.added'), { n: tickets })}`
          : cantAfford ? t('common.insufficient')
          : `🎫 ${t('lottery.buy')} — ${fmt(cost)} PULSE`}
      </button>

      {error && <div className="p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}

      {mine > 0 && total > 0 && (
        <div className="text-center text-xs text-pulse-mute pt-2">
          {t('lottery.win_chance')} : <span className="text-pulse-gold font-bold">{((mine / total) * 100).toFixed(1)}%</span>
          {' · '}{t('lottery.current_pot')} : {fmt(pot)} PULSE
        </div>
      )}
    </div>
  );
}
