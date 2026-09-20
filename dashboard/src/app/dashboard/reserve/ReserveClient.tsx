'use client';

import { useMemo, useState } from 'react';
import { pickDefaultShareChannel, type DiscordChannel } from '@/lib/channelTypes';

type Mode = 'gift' | 'giveaway' | 'drop';
type Scope = 'active_week' | 'top_50' | 'all';

export interface MemberOption {
  discord_id: string;
  username: string;
  avatar_url: string | null;
  balance_pulse: number;
}

const fmt = (n: number) => (n ?? 0).toLocaleString('en-US');

export default function ReserveClient({
  channels,
  memberCount,
  members,
}: {
  channels: DiscordChannel[];
  memberCount: number;
  members: MemberOption[];
}) {
  const [mode, setMode] = useState<Mode>('gift');
  const [channelId, setChannelId] = useState(pickDefaultShareChannel(channels));

  // Direct gift form
  const [giftQuery, setGiftQuery] = useState('');
  const [giftPick, setGiftPick] = useState<MemberOption | null>(null);
  const [giftAmount, setGiftAmount] = useState(100);
  const [giftReason, setGiftReason] = useState('');

  // Giveaway form
  const [gPrize, setGPrize] = useState('');
  const [gPrizePulse, setGPrizePulse] = useState(100);
  const [gWinners, setGWinners] = useState(1);
  const [gMinutes, setGMinutes] = useState(60);

  // Drop form
  const [dAmount, setDAmount] = useState(50);
  const [dWinners, setDWinners] = useState(5);
  const [dScope, setDScope] = useState<Scope>('active_week');

  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Local filter for the gift-mode search box.
  const suggestions = useMemo(() => {
    const q = giftQuery.trim().toLowerCase();
    if (!q) return [] as MemberOption[];
    return members
      .filter(m => (m.username ?? '').toLowerCase().includes(q) || m.discord_id.includes(q))
      .slice(0, 8);
  }, [giftQuery, members]);

  const send = async (command: string, payload: Record<string, unknown>) => {
    setStatus('sending');
    setError(null);
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command, payload }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setStatus('sent');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed.');
    }
  };

  const submitGiveaway = () => {
    if (!channelId) { setError('Pick a channel.'); return; }
    if (gPrizePulse <= 0) { setError('Prize must be > 0 PULSE.'); return; }
    if (gWinners < 1) { setError('At least 1 winner.'); return; }
    if (gMinutes < 1) { setError('Duration must be ≥ 1 minute.'); return; }
    send('create_giveaway', {
      channel_id: channelId,
      prize_label: gPrize.trim() || `${gPrizePulse} PULSE`,
      prize_pulse: Math.floor(gPrizePulse),
      winners_count: Math.floor(gWinners),
      duration_minutes: Math.floor(gMinutes),
    });
  };

  const submitDrop = () => {
    if (!channelId) { setError('Pick a channel.'); return; }
    if (dAmount <= 0) { setError('Amount must be > 0 PULSE.'); return; }
    if (dWinners < 1) { setError('At least 1 winner.'); return; }
    send('bulk_drop', {
      channel_id: channelId,
      amount: Math.floor(dAmount),
      winners_count: Math.floor(dWinners),
      scope: dScope,
    });
  };

  const submitGift = () => {
    if (!giftPick) { setError('Pick a member first.'); return; }
    if (giftAmount <= 0) { setError('Amount must be > 0 PULSE.'); return; }
    send('grant_pulse', {
      discord_id: giftPick.discord_id,
      amount: Math.floor(giftAmount),
      reason: giftReason.trim() || 'Gift from reserve',
    });
    // Clear the picker so it's obvious the action fired.
    setTimeout(() => {
      setGiftQuery('');
      setGiftPick(null);
      setGiftReason('');
    }, 1500);
  };

  const totalCost =
    mode === 'giveaway' ? gPrizePulse * gWinners :
    mode === 'drop'     ? dAmount * dWinners :
    giftAmount;

  return (
    <div className="bg-pulse-card border border-pulse-border rounded-2xl p-5">
      {/* Mode toggle */}
      <div className="grid grid-cols-3 gap-1 mb-5 bg-pulse-bg/50 p-1 rounded-xl">
        <button
          onClick={() => setMode('gift')}
          className={`py-2.5 rounded-lg text-xs font-semibold transition-all ${
            mode === 'gift' ? 'bg-pulse-gold text-black shadow-brand' : 'text-pulse-mute'
          }`}
        >
          🎁 Cadeau
        </button>
        <button
          onClick={() => setMode('giveaway')}
          className={`py-2.5 rounded-lg text-xs font-semibold transition-all ${
            mode === 'giveaway' ? 'bg-pulse-gold text-black shadow-brand' : 'text-pulse-mute'
          }`}
        >
          🎉 Giveaway
        </button>
        <button
          onClick={() => setMode('drop')}
          className={`py-2.5 rounded-lg text-xs font-semibold transition-all ${
            mode === 'drop' ? 'bg-pulse-gold text-black shadow-brand' : 'text-pulse-mute'
          }`}
        >
          💸 Drop
        </button>
      </div>

      {/* Channel picker — only for modes that post an embed. Gift is silent. */}
      {mode !== 'gift' && (
        <label className="block mb-4">
          <span className="text-xs uppercase text-pulse-mute">Channel</span>
          <select
            value={channelId}
            onChange={e => setChannelId(e.target.value)}
            className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2.5 text-sm"
          >
            {channels.map(c => (
              <option key={c.channel_id} value={c.channel_id}># {c.name}</option>
            ))}
          </select>
        </label>
      )}

      {mode === 'gift' ? (
        <div className="space-y-3">
          {/* Member picker: search + suggestion list. Once picked we show a
              chip with avatar + balance so the operator sees who's about to
              receive. Clear by clicking the ✕. */}
          {giftPick ? (
            <div className="flex items-center gap-3 bg-pulse-bg/60 border border-pulse-gold/40 rounded-xl p-3">
              {giftPick.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={giftPick.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-pulse-gold/20 flex items-center justify-center font-bold text-pulse-gold">
                  {(giftPick.username ?? '?').trim().charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{giftPick.username || giftPick.discord_id.slice(-6)}</div>
                <div className="text-xs text-pulse-mute font-mono truncate">
                  {fmt(giftPick.balance_pulse)} PULSE · {giftPick.discord_id}
                </div>
              </div>
              <button
                onClick={() => { setGiftPick(null); setGiftQuery(''); }}
                className="text-pulse-mute hover:text-red-400 text-lg px-1"
                aria-label="Clear"
              >✕</button>
            </div>
          ) : (
            <div className="relative">
              <label className="block">
                <span className="text-xs uppercase text-pulse-mute">Member</span>
                <input
                  type="text"
                  placeholder="Type a name or Discord ID…"
                  value={giftQuery}
                  onChange={e => setGiftQuery(e.target.value)}
                  className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2.5 text-sm"
                />
              </label>
              {suggestions.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1 bg-pulse-card border border-pulse-border rounded-lg shadow-xl max-h-72 overflow-y-auto">
                  {suggestions.map(m => (
                    <li key={m.discord_id}>
                      <button
                        onClick={() => { setGiftPick(m); setGiftQuery(''); }}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-pulse-gold/10 text-left"
                      >
                        {m.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-pulse-gold/20 flex items-center justify-center text-xs font-bold text-pulse-gold">
                            {(m.username ?? '?').trim().charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{m.username || m.discord_id.slice(-6)}</div>
                          <div className="text-[10px] text-pulse-mute font-mono">{fmt(m.balance_pulse)} PULSE</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {giftQuery && suggestions.length === 0 && (
                <div className="mt-2 text-xs text-pulse-mute">No match. Try a different name.</div>
              )}
            </div>
          )}

          <label className="block">
            <span className="text-xs uppercase text-pulse-mute">Amount (PULSE)</span>
            <input
              type="number"
              min={1}
              value={giftAmount}
              onChange={e => setGiftAmount(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2.5 text-sm"
            />
            <div className="flex gap-2 mt-2 flex-wrap">
              {[50, 100, 250, 500, 1000].map(v => (
                <button
                  key={v}
                  onClick={() => setGiftAmount(v)}
                  className={`px-3 py-1 rounded-lg text-xs ${giftAmount === v ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </label>

          <label className="block">
            <span className="text-xs uppercase text-pulse-mute">Reason (optional)</span>
            <input
              type="text"
              placeholder="e.g. helped with the mission, birthday…"
              value={giftReason}
              onChange={e => setGiftReason(e.target.value)}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
        </div>
      ) : mode === 'giveaway' ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs uppercase text-pulse-mute">Prize label (optional)</span>
            <input
              type="text"
              placeholder={`${gPrizePulse} PULSE`}
              value={gPrize}
              onChange={e => setGPrize(e.target.value)}
              className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2.5 text-sm"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-xs uppercase text-pulse-mute">PULSE / winner</span>
              <input
                type="number"
                min={1}
                value={gPrizePulse}
                onChange={e => setGPrizePulse(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase text-pulse-mute">Winners</span>
              <input
                type="number"
                min={1}
                max={20}
                value={gWinners}
                onChange={e => setGWinners(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase text-pulse-mute">Minutes</span>
              <input
                type="number"
                min={1}
                max={43200}
                value={gMinutes}
                onChange={e => setGMinutes(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-2.5 text-sm"
              />
            </label>
          </div>

          <div className="flex gap-2 flex-wrap">
            {[15, 60, 60 * 6, 60 * 24].map(m => (
              <button
                key={m}
                onClick={() => setGMinutes(m)}
                className={`px-3 py-1 rounded-lg text-xs ${gMinutes === m ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}
              >
                {m < 60 ? `${m}m` : m < 60 * 24 ? `${m / 60}h` : `${m / (60 * 24)}d`}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <span className="text-xs uppercase text-pulse-mute">Eligible members</span>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(['active_week', 'top_50', 'all'] as Scope[]).map(s => (
                <button
                  key={s}
                  onClick={() => setDScope(s)}
                  className={`py-2 rounded-lg text-xs font-semibold ${dScope === s ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}
                >
                  {s === 'active_week' ? 'Active week' : s === 'top_50' ? 'Top 50' : `All ${memberCount}`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs uppercase text-pulse-mute">PULSE / winner</span>
              <input
                type="number"
                min={1}
                value={dAmount}
                onChange={e => setDAmount(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase text-pulse-mute">Winners</span>
              <input
                type="number"
                min={1}
                max={50}
                value={dWinners}
                onChange={e => setDWinners(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-2 py-2.5 text-sm"
              />
            </label>
          </div>

          <div className="flex gap-2 flex-wrap">
            {[10, 25, 50, 100, 250].map(v => (
              <button
                key={v}
                onClick={() => setDAmount(v)}
                className={`px-3 py-1 rounded-lg text-xs ${dAmount === v ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Total */}
      <div className="mt-4 flex items-center justify-between bg-pulse-bg/50 border border-pulse-border/60 rounded-lg px-3 py-2">
        <span className="text-xs text-pulse-mute uppercase">Total from reserve</span>
        <span className="font-bold text-pulse-gold">{totalCost.toLocaleString('en-US')} PULSE</span>
      </div>

      <button
        onClick={
          mode === 'giveaway' ? submitGiveaway :
          mode === 'drop'     ? submitDrop     :
          submitGift
        }
        disabled={status === 'sending'}
        className="w-full mt-4 bg-pulse-gold text-black font-bold text-base py-3 rounded-xl disabled:opacity-50 shadow-brand"
      >
        {status === 'sending'
          ? 'Queuing…'
          : status === 'sent'
          ? '✅ Queued — bot will run it in ≤15s'
          : mode === 'giveaway'
          ? '🎉 Launch giveaway'
          : mode === 'drop'
          ? '💸 Send drop now'
          : giftPick
          ? `🎁 Give ${fmt(giftAmount)} PULSE to ${giftPick.username || giftPick.discord_id.slice(-6)}`
          : '🎁 Pick a member first'}
      </button>

      {error && <div className="mt-3 p-2 rounded-lg bg-red-900/40 border border-red-800 text-red-200 text-xs">{error}</div>}
    </div>
  );
}
