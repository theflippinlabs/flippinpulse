'use client';

import { useState } from 'react';

export interface Member {
  discord_id: string;
  username: string | null;
  rank_name: string | null;
  points_total: number;
  points_week: number;
  points_month: number;
  balance_pulse: number;
  lifetime_earned_pulse: number;
  streak: number;
  last_activity_at: string | null;
}

const fmt = (n: number) => (n ?? 0).toLocaleString('en-US');

export default function MembersClient({ initial }: { initial: Member[] }) {
  const [selected, setSelected] = useState<Member | null>(null);
  const [action, setAction] = useState<'grant' | 'revoke'>('grant');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setSelected(null);
    setAmount('');
    setReason('');
    setStatus('idle');
    setError(null);
  };

  const submit = async () => {
    if (!selected) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setError('Enter a positive amount.'); return; }
    setStatus('sending');
    setError(null);
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          command: action === 'grant' ? 'grant_pulse' : 'revoke_pulse',
          payload: {
            discord_id: selected.discord_id,
            amount: Math.floor(n),
            reason: reason.trim() || (action === 'grant' ? 'Dashboard grant' : 'Dashboard revoke'),
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setStatus('sent');
      setTimeout(close, 1200);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  };

  return (
    <>
      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {initial.map((m, i) => (
          <button
            key={m.discord_id}
            onClick={() => setSelected(m)}
            className="w-full text-left bg-pulse-card border border-pulse-border rounded-xl p-3 flex items-center gap-3"
          >
            <div className="text-pulse-mute text-sm w-6 shrink-0">#{i + 1}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{m.username ?? m.discord_id.slice(-6)}</div>
              <div className="text-xs text-pulse-mute truncate">{m.rank_name ?? '—'} · {fmt(m.balance_pulse)} PULSE · 🔥 {m.streak}</div>
            </div>
            <div className="text-right text-sm">
              <div className="font-mono">{fmt(m.points_total)}</div>
              <div className="text-[10px] text-pulse-mute">points</div>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-pulse-card border border-pulse-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-pulse-border/40 text-pulse-mute uppercase text-xs">
            <tr>
              <th className="text-left px-4 py-2">#</th>
              <th className="text-left px-4 py-2">Member</th>
              <th className="text-left px-4 py-2">Rank</th>
              <th className="text-right px-4 py-2">Points</th>
              <th className="text-right px-4 py-2">PULSE</th>
              <th className="text-right px-4 py-2">🔥</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((m, i) => (
              <tr key={m.discord_id} className="border-t border-pulse-border/50">
                <td className="px-4 py-2 text-pulse-mute">{i + 1}</td>
                <td className="px-4 py-2">
                  <div className="font-semibold">{m.username ?? m.discord_id.slice(-6)}</div>
                  <div className="text-xs font-mono text-pulse-mute">{m.discord_id}</div>
                </td>
                <td className="px-4 py-2">{m.rank_name ?? '—'}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(m.points_total)}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(m.balance_pulse)}</td>
                <td className="px-4 py-2 text-right">{m.streak}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => setSelected(m)}
                    className="px-3 py-1 rounded bg-pulse-brand text-black text-xs font-semibold"
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {selected && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-end md:items-center justify-center p-0 md:p-6" onClick={close}>
          <div
            className="w-full md:max-w-md bg-pulse-card border border-pulse-border rounded-t-2xl md:rounded-2xl p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-bold">{selected.username ?? selected.discord_id.slice(-6)}</div>
                <div className="text-xs font-mono text-pulse-mute">{selected.discord_id}</div>
              </div>
              <button onClick={close} className="text-pulse-mute text-xl">✕</button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <div className="bg-pulse-border/30 rounded-lg p-2">
                <div className="text-xs text-pulse-mute">Rank</div>
                <div className="font-semibold">{selected.rank_name ?? '—'}</div>
              </div>
              <div className="bg-pulse-border/30 rounded-lg p-2">
                <div className="text-xs text-pulse-mute">PULSE</div>
                <div className="font-mono">{fmt(selected.balance_pulse)}</div>
              </div>
              <div className="bg-pulse-border/30 rounded-lg p-2">
                <div className="text-xs text-pulse-mute">Streak</div>
                <div>🔥 {selected.streak}</div>
              </div>
            </div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setAction('grant')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold ${action === 'grant' ? 'bg-emerald-500 text-black' : 'bg-pulse-border text-pulse-mute'}`}
              >
                ➕ Give PULSE
              </button>
              <button
                onClick={() => setAction('revoke')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold ${action === 'revoke' ? 'bg-red-500 text-black' : 'bg-pulse-border text-pulse-mute'}`}
              >
                ➖ Remove PULSE
              </button>
            </div>

            <input
              type="number"
              inputMode="numeric"
              placeholder="Amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-3 text-sm mb-2"
            />
            <input
              placeholder="Reason (optional)"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-3 text-sm mb-3"
            />

            <button
              onClick={submit}
              disabled={status === 'sending'}
              className="w-full bg-pulse-brand text-black font-semibold py-3 rounded-lg disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending…' : status === 'sent' ? '✅ Done' : `Confirm`}
            </button>

            {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
          </div>
        </div>
      )}
    </>
  );
}
