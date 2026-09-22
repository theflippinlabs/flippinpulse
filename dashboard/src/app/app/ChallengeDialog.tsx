'use client';

import { useEffect, useState } from 'react';

interface Member { discord_id: string; username: string; avatar_url: string | null; }

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (params: { opponentId: string; opponentName: string; wager: number; channelId: string; extra?: string }) => Promise<void> | void;
  title: string;
  fr: boolean;
  channels: { channel_id: string; name: string }[];
  defaultChannel: string;
  // When set, an extra required text input (e.g. card code) is shown.
  extraLabel?: string;
  extraPlaceholder?: string;
  maxWager?: number;
}

export default function ChallengeDialog({ open, onClose, onSubmit, title, fr, channels, defaultChannel, extraLabel, extraPlaceholder, maxWager = 10_000 }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Member[]>([]);
  const [picked, setPicked] = useState<Member | null>(null);
  const [wager, setWager] = useState(0);
  const [channelId, setChannelId] = useState(defaultChannel);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setQ(''); setResults([]); setPicked(null); setWager(0); setChannelId(defaultChannel); setExtra(''); setError(null); }
  }, [open, defaultChannel]);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(async () => {
      const res = await fetch(`/api/members/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setResults(data.results ?? []);
    }, 200);
    return () => clearTimeout(h);
  }, [q, open]);

  if (!open) return null;

  async function submit() {
    if (!picked) { setError(fr ? 'Choisis un adversaire.' : 'Pick an opponent.'); return; }
    if (extraLabel && !extra.trim()) { setError(fr ? `${extraLabel} requis.` : `${extraLabel} required.`); return; }
    if (!channelId) { setError(fr ? 'Choisis un salon.' : 'Pick a channel.'); return; }
    setError(null); setBusy(true);
    try {
      await onSubmit({ opponentId: picked.discord_id, opponentName: picked.username, wager, channelId, extra: extra.trim() || undefined });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-md w-full max-h-[85vh] overflow-y-auto rounded-2xl bg-gradient-to-b from-pulse-card to-black border border-pulse-gold/40 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black">⚔️ {title}</h2>
          <button onClick={onClose} className="text-2xl text-pulse-mute leading-none px-1">×</button>
        </div>

        <div className="mb-3">
          <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Adversaire' : 'Opponent'}</label>
          {picked ? (
            <div className="mt-1 rounded-lg bg-pulse-gold/10 border border-pulse-gold/40 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {picked.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={picked.avatar_url} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                  : <div className="w-6 h-6 rounded-full bg-pulse-border" />}
                <span className="font-semibold">{picked.username}</span>
              </div>
              <button onClick={() => setPicked(null)} className="text-xs text-pulse-mute">{fr ? 'Changer' : 'Change'}</button>
            </div>
          ) : (
            <>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={fr ? 'Tape un pseudo…' : 'Type a username…'} className="w-full mt-1 rounded-lg bg-black border border-pulse-border px-3 py-2 text-sm" />
              {results.length > 0 && (
                <ul className="mt-1 rounded-lg bg-black/60 border border-pulse-border divide-y divide-pulse-border/60 max-h-40 overflow-y-auto">
                  {results.map(m => (
                    <li key={m.discord_id} onClick={() => setPicked(m)} className="cursor-pointer px-3 py-2 hover:bg-pulse-gold/10 flex items-center gap-2 text-sm">
                      {m.avatar_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                        : <div className="w-6 h-6 rounded-full bg-pulse-border" />}
                      <span>{m.username}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {extraLabel && (
          <div className="mb-3">
            <label className="text-xs text-pulse-mute uppercase tracking-wider">{extraLabel}</label>
            <input value={extra} onChange={e => setExtra(e.target.value)} placeholder={extraPlaceholder ?? ''} className="w-full mt-1 rounded-lg bg-black border border-pulse-border px-3 py-2 text-sm" />
          </div>
        )}

        <div className="mb-3">
          <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Mise (PULSE)' : 'Wager (PULSE)'}</label>
          <input type="number" min={0} max={maxWager} value={wager} onChange={e => setWager(Math.max(0, Math.min(maxWager, Math.floor(Number(e.target.value) || 0))))} className="w-full mt-1 rounded-lg bg-black border border-pulse-border px-3 py-2 text-sm" />
        </div>

        <div className="mb-4">
          <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Salon' : 'Channel'}</label>
          <select value={channelId} onChange={e => setChannelId(e.target.value)} className="w-full mt-1 rounded-lg bg-black border border-pulse-border px-3 py-2 text-sm">
            {channels.map(c => <option key={c.channel_id} value={c.channel_id}>#{c.name}</option>)}
          </select>
        </div>

        {error && <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs">{error}</div>}

        <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-pulse-gold text-black font-bold py-2.5 disabled:opacity-60">
          {busy ? (fr ? 'Envoi…' : 'Sending…') : (fr ? '⚔️ Envoyer le défi' : '⚔️ Send challenge')}
        </button>
      </div>
    </div>
  );
}
