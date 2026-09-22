'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Progress, Season, Tier } from '@/lib/battlePass';

interface Props {
  fr: boolean;
  season: Season;
  tiers: Tier[];
  progress: Progress;
  currentTier: number;
  xpIntoTier: number;
  xpNeeded: number;
  endsInDays: number;
  endsInHours: number;
}

interface ClaimedRow { tier: number; track: 'free' | 'premium'; label: string; pulseAwarded: number; }

export default function BattlePassClient({
  fr, season, tiers, progress, currentTier, xpIntoTier, xpNeeded, endsInDays, endsInHours,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const [claimedFlash, setClaimedFlash] = useState<ClaimedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingFree = tiers.filter(t => t.tier_number <= currentTier && !progress.claimed_free.includes(t.tier_number)).length;
  const pendingPrem = progress.is_premium ? tiers.filter(t => t.tier_number <= currentTier && !progress.claimed_premium.includes(t.tier_number)).length : 0;
  const pending = pendingFree + pendingPrem;

  const bar = (xpIntoTier / xpNeeded) * 100;

  const claim = async () => {
    setError(null);
    setFlash(null);
    setClaimedFlash(null);
    try {
      const res = await fetch('/api/battlepass/claim', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'error'); return; }
      const rows: ClaimedRow[] = data.claimed ?? [];
      if (!rows.length) {
        setFlash(fr ? 'Rien à réclamer.' : 'Nothing to claim.');
      } else {
        setClaimedFlash(rows);
      }
      startTransition(() => router.refresh());
    } catch {
      setError(fr ? 'Requête échouée.' : 'Request failed.');
    }
  };

  const buyPremium = async () => {
    setError(null);
    setFlash(null);
    setClaimedFlash(null);
    if (!confirm(fr ? `Débloquer la piste premium pour ${season.premium_price_pulse} PULSE ?` : `Unlock premium for ${season.premium_price_pulse} PULSE?`)) return;
    try {
      const res = await fetch('/api/battlepass/premium', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error === 'already_owned' ? (fr ? 'Déjà débloqué.' : 'Already unlocked.') : (data.error ?? 'error')); return; }
      setFlash(fr ? '💎 Piste premium débloquée !' : '💎 Premium track unlocked!');
      startTransition(() => router.refresh());
    } catch {
      setError(fr ? 'Requête échouée.' : 'Request failed.');
    }
  };

  const nextTier = tiers.find(t => t.tier_number === currentTier + 1);

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span><span>{fr ? 'Retour' : 'Back'}</span>
      </Link>

      <div className="rounded-2xl p-4 bg-gradient-to-br from-pulse-gold/25 to-pulse-gold/5 border border-pulse-gold/40 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">{season.emoji}</span>
          <h1 className="text-xl font-bold">{season.name}</h1>
          {progress.is_premium && <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-pulse-gold text-black font-black tracking-wider">PREMIUM</span>}
        </div>
        <div className="text-xs text-pulse-mute mb-3">
          {fr ? `Palier ${currentTier} / ${season.tier_count}` : `Tier ${currentTier} / ${season.tier_count}`} · {endsInDays > 0 ? `${endsInDays}${fr ? 'j' : 'd'} ${endsInHours}h` : `${endsInHours}h`}
        </div>
        <div className="relative h-3 bg-pulse-border/60 rounded-full overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-pulse-gold to-yellow-300" style={{ width: `${bar}%` }} />
        </div>
        <div className="mt-1 text-[10px] text-pulse-mute font-mono flex justify-between">
          <span>{xpIntoTier} / {xpNeeded} XP</span>
          {nextTier && <span>→ T{nextTier.tier_number} · {nextTier.free_reward_label}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={claim}
          disabled={isPending || pending === 0}
          className={`rounded-xl px-3 py-3 font-semibold border ${pending > 0 ? 'bg-pulse-gold text-black border-pulse-gold' : 'bg-pulse-card text-pulse-mute border-pulse-border'} disabled:opacity-60`}
        >
          {pending > 0 ? (fr ? `🎁 Réclamer (${pending})` : `🎁 Claim (${pending})`) : (fr ? '🎁 Rien à réclamer' : '🎁 Nothing to claim')}
        </button>
        <button
          onClick={buyPremium}
          disabled={isPending || progress.is_premium}
          className={`rounded-xl px-3 py-3 font-semibold border ${progress.is_premium ? 'bg-pulse-card text-pulse-mute border-pulse-border' : 'bg-purple-500/20 text-purple-200 border-purple-500/40'} disabled:opacity-60`}
        >
          {progress.is_premium ? (fr ? '💎 Premium débloqué' : '💎 Premium unlocked') : (fr ? `💎 Premium (${season.premium_price_pulse})` : `💎 Premium (${season.premium_price_pulse})`)}
        </button>
      </div>

      {claimedFlash && (
        <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          <div className="font-semibold mb-1">🎉 {fr ? 'Récompenses réclamées' : 'Rewards claimed'}</div>
          <ul className="space-y-1">
            {claimedFlash.map(r => (
              <li key={`${r.tier}-${r.track}`}>{r.track === 'premium' ? '💎' : '🆓'} T{r.tier} — {r.label}</li>
            ))}
          </ul>
        </div>
      )}
      {flash && <div className="mb-4 rounded-xl border border-pulse-border bg-pulse-card p-3 text-sm">{flash}</div>}
      {error && <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</div>}

      <h2 className="text-sm uppercase tracking-wider text-pulse-mute mb-2">{fr ? 'Paliers' : 'Tiers'}</h2>
      <ul className="space-y-1.5">
        {tiers.map(tier => {
          const reached = tier.tier_number <= currentTier;
          const claimedFree = progress.claimed_free.includes(tier.tier_number);
          const claimedPrem = progress.claimed_premium.includes(tier.tier_number);
          return (
            <li
              key={tier.id}
              className={`rounded-xl border p-3 flex items-center gap-3 ${reached ? 'bg-pulse-gold/5 border-pulse-gold/30' : 'bg-pulse-card border-pulse-border'}`}
            >
              <div className={`w-10 text-center font-black ${reached ? 'text-pulse-gold' : 'text-pulse-mute'}`}>
                T{String(tier.tier_number).padStart(2, '0')}
              </div>
              <div className="flex-1 min-w-0 grid grid-cols-2 gap-2 text-sm">
                <div className={`truncate ${claimedFree ? 'text-emerald-400' : reached ? '' : 'text-pulse-mute'}`}>
                  <span className="mr-1 text-xs">{claimedFree ? '✅' : reached ? '📦' : '🆓'}</span>
                  {tier.free_reward_label}
                </div>
                <div className={`truncate ${!progress.is_premium ? 'text-pulse-mute/60' : claimedPrem ? 'text-purple-400' : reached ? 'text-purple-300' : 'text-pulse-mute'}`}>
                  <span className="mr-1 text-xs">{!progress.is_premium ? '🔒' : claimedPrem ? '💎' : reached ? '💠' : '🟣'}</span>
                  {tier.premium_reward_label}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
