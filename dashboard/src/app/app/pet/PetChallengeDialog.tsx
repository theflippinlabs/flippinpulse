'use client';

import { useEffect, useState } from 'react';

interface PetSummary {
  name: string;
  emoji: string;
  species: string;
  level: number;
  wins: number;
  losses: number;
}

interface Candidate {
  discord_id: string;
  username: string;
  avatar_url: string | null;
  pet?: PetSummary;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (params: { opponentId: string; opponentName: string; wager: number; channelId: string }) => Promise<void> | void;
  fr: boolean;
  myLevel: number;
  channels: { channel_id: string; name: string }[];
  defaultChannel: string;
}

/**
 * Pet-specific opponent picker. Unlike the generic ChallengeDialog this one
 * only returns members who own an active pet — so the challenger never aims
 * at a target without a pet and sees the opponent's level + record before
 * committing a wager.
 */
export default function PetChallengeDialog({ open, onClose, onSubmit, fr, myLevel, channels, defaultChannel }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [wager, setWager] = useState(50);
  const [channelId, setChannelId] = useState(defaultChannel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setQ(''); setResults([]); setPicked(null); setWager(50); setChannelId(defaultChannel); setError(null); }
  }, [open, defaultChannel]);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(async () => {
      const res = await fetch(`/api/members/search?with=pet&q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setResults(data.results ?? []);
    }, 200);
    return () => clearTimeout(h);
  }, [q, open]);

  if (!open) return null;

  async function submit() {
    if (!picked) { setError(fr ? 'Choisis un adversaire avec un pet.' : 'Pick an opponent who has a pet.'); return; }
    if (!channelId) { setError(fr ? 'Choisis un salon.' : 'Pick a channel.'); return; }
    setError(null); setBusy(true);
    try {
      await onSubmit({ opponentId: picked.discord_id, opponentName: picked.username, wager, channelId });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function levelBadge(level: number): string {
    const diff = level - myLevel;
    if (diff <= -3) return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200';
    if (diff >= 3)  return 'bg-red-500/20 border-red-500/40 text-red-200';
    return 'bg-pulse-gold/15 border-pulse-gold/40 text-pulse-gold';
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-md w-full max-h-[85vh] overflow-y-auto rounded-2xl bg-gradient-to-b from-pulse-card to-black border border-pulse-gold/40 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black">⚔️ {fr ? 'Défier un pet' : 'Challenge a pet'}</h2>
          <button onClick={onClose} className="text-2xl text-pulse-mute leading-none px-1">×</button>
        </div>

        <p className="text-xs text-pulse-mute mb-4">
          {fr
            ? 'Seuls les membres avec un pet actif sont listés. Compare le niveau avant d\'engager la mise !'
            : 'Only members with an active pet are listed. Compare levels before locking the wager!'}
        </p>

        <div className="mb-3">
          <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Adversaire' : 'Opponent'}</label>
          {picked && picked.pet ? (
            <div className="mt-1 rounded-xl bg-pulse-gold/10 border border-pulse-gold/40 p-3 flex items-center gap-3">
              <div className="text-3xl">{picked.pet.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{picked.pet.name}</div>
                <div className="text-[11px] text-pulse-mute truncate">{fr ? 'à' : 'owned by'} {picked.username}</div>
                <div className="flex items-center gap-2 mt-1 text-[11px]">
                  <span className={`px-1.5 py-0.5 rounded border ${levelBadge(picked.pet.level)}`}>Lv {picked.pet.level}</span>
                  <span className="text-pulse-mute font-mono">🏆 {picked.pet.wins} / 💀 {picked.pet.losses}</span>
                </div>
              </div>
              <button onClick={() => setPicked(null)} className="text-xs text-pulse-mute shrink-0">{fr ? 'Changer' : 'Change'}</button>
            </div>
          ) : (
            <>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder={fr ? 'Tape un pseudo…' : 'Type a username…'} className="w-full mt-1 rounded-lg bg-black border border-pulse-border px-3 py-2 text-sm" />
              {q.trim().length >= 2 && results.length === 0 && (
                <p className="mt-2 text-[11px] text-pulse-mute italic">{fr ? 'Aucun membre avec un pet actif.' : 'No member with an active pet.'}</p>
              )}
              {results.length > 0 && (
                <ul className="mt-1 rounded-lg bg-black/60 border border-pulse-border divide-y divide-pulse-border/60 max-h-56 overflow-y-auto">
                  {results.map(m => (
                    <li key={m.discord_id} onClick={() => setPicked(m)} className="cursor-pointer px-3 py-2 hover:bg-pulse-gold/10">
                      <div className="flex items-center gap-2 text-sm">
                        {m.avatar_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                          : <div className="w-6 h-6 rounded-full bg-pulse-border" />}
                        <span className="font-semibold">{m.username}</span>
                      </div>
                      {m.pet && (
                        <div className="pl-8 mt-0.5 flex items-center gap-2 text-[11px] text-pulse-mute">
                          <span>{m.pet.emoji} {m.pet.name}</span>
                          <span className={`px-1 py-px rounded border ${levelBadge(m.pet.level)}`}>Lv {m.pet.level}</span>
                          <span className="font-mono">🏆 {m.pet.wins} / 💀 {m.pet.losses}</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="mb-3">
          <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Mise (PULSE)' : 'Wager (PULSE)'}</label>
          <input type="number" min={0} max={10_000} value={wager}
            onChange={e => setWager(Math.max(0, Math.min(10_000, Math.floor(Number(e.target.value) || 0))))}
            className="w-full mt-1 rounded-lg bg-black border border-pulse-border px-3 py-2 text-sm" />
        </div>

        <div className="mb-4">
          <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Salon' : 'Channel'}</label>
          <select value={channelId} onChange={e => setChannelId(e.target.value)} className="w-full mt-1 rounded-lg bg-black border border-pulse-border px-3 py-2 text-sm">
            {channels.map(c => <option key={c.channel_id} value={c.channel_id}>#{c.name}</option>)}
          </select>
        </div>

        {error && <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs">{error}</div>}

        <button onClick={submit} disabled={busy || !picked} className="w-full rounded-xl bg-pulse-gold text-black font-bold py-2.5 disabled:opacity-60">
          {busy ? (fr ? 'Envoi…' : 'Sending…') : (fr ? '⚔️ Lancer le combat' : '⚔️ Start the fight')}
        </button>
      </div>
    </div>
  );
}
