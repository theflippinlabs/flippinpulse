'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SPECIES, type Pet, type SpeciesKey } from '@/lib/petsShared';
import PetShowcase from './PetShowcase';
import PetChallengeDialog from './PetChallengeDialog';

type BurstKind = 'feed' | 'play' | 'train' | 'level' | null;

interface Props {
  fr: boolean;
  pet: Pet | null;
  species: typeof SPECIES;
  battles: { id: number; winner_pet_id: number | null; pulse_wagered: number; created_at: string }[];
  channels: { channel_id: string; name: string }[];
  defaultChannel: string;
}

const STAT_STYLE: Record<string, { color: string; emoji: string; labelFr: string; labelEn: string }> = {
  hunger:    { color: 'bg-orange-500',  emoji: '🍖', labelFr: 'Faim',    labelEn: 'Hunger'    },
  happiness: { color: 'bg-pink-500',    emoji: '😊', labelFr: 'Bonheur', labelEn: 'Happiness' },
  energy:    { color: 'bg-yellow-400',  emoji: '⚡', labelFr: 'Énergie', labelEn: 'Energy'    },
  health:    { color: 'bg-red-500',     emoji: '❤️', labelFr: 'Santé',   labelEn: 'Health'    },
};

function Bar({ value, statKey, fr, pulse }: { value: number; statKey: keyof typeof STAT_STYLE; fr: boolean; pulse?: boolean }) {
  const st = STAT_STYLE[statKey];
  return (
    <div className={pulse ? 'animate-pulse' : ''}>
      <div className="flex items-center justify-between text-xs mb-1">
        <span>{st.emoji} {fr ? st.labelFr : st.labelEn}</span>
        <span className="font-mono text-pulse-mute">{value}</span>
      </div>
      <div className="h-2.5 bg-pulse-border/60 rounded-full overflow-hidden">
        <div className={`h-full ${st.color} transition-[width] duration-500 ease-out`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** mm:ss remaining until the given ISO timestamp + mins minutes. */
function fmtCooldown(iso: string | null, totalMins: number, now: number): string | null {
  if (!iso) return null;
  const readyAt = new Date(iso).getTime() + totalMins * 60_000;
  const remaining = readyAt - now;
  if (remaining <= 0) return null;
  const totalSec = Math.ceil(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PetClient({ fr, pet, species, battles, channels, defaultChannel }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [burst, setBurst] = useState<BurstKind>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [recentDelta, setRecentDelta] = useState<{ key: string; emoji: string; value: number } | null>(null);
  const [pulseKey, setPulseKey] = useState<string | null>(null);

  const [pickedSpecies, setPickedSpecies] = useState<SpeciesKey>(species[0].key);
  const [petName, setPetName] = useState('');

  // Tick every second so the cooldown labels stay fresh without stealing focus.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pet) return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [pet]);

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 1600);
    return () => clearTimeout(t);
  }, [burst]);
  useEffect(() => {
    if (!recentDelta) return;
    const t = setTimeout(() => setRecentDelta(null), 2200);
    return () => clearTimeout(t);
  }, [recentDelta]);
  useEffect(() => {
    if (!pulseKey) return;
    const t = setTimeout(() => setPulseKey(null), 900);
    return () => clearTimeout(t);
  }, [pulseKey]);

  const cooldowns = useMemo(() => ({
    feed:  pet ? fmtCooldown(pet.last_fed_at,     60,  now) : null,
    play:  pet ? fmtCooldown(pet.last_played_at,  60,  now) : null,
    train: pet ? fmtCooldown(pet.last_trained_at, 120, now) : null,
  }), [pet, now]);

  const tooTired = {
    feed:  false,
    play:  !!pet && pet.energy < 20,
    train: !!pet && pet.energy < 30,
  };

  const errorLabel = (code: string): string => {
    const map: Record<string, { fr: string; en: string }> = {
      already_owns_pet:   { fr: 'Tu as déjà un compagnon.',                   en: 'You already have a pet.' },
      unknown_species:    { fr: 'Espèce inconnue.',                           en: 'Unknown species.' },
      name_too_short:     { fr: 'Le nom est trop court.',                     en: 'Name too short.' },
      insufficient_pulse: { fr: 'PULSE insuffisant pour cette action.',       en: 'Not enough PULSE for this action.' },
      no_pet:             { fr: 'Aucun compagnon actif.',                     en: 'No active pet.' },
      cooldown:           { fr: 'Patience — attends la fin du cooldown.',   en: 'Patience — wait for the cooldown.' },
      too_tired:          { fr: 'Trop fatigué·e — nourris-le ou laisse-le se reposer.', en: 'Too tired — feed or let it rest.' },
      user_not_found:     { fr: 'Compte introuvable.',                        en: 'Account not found.' },
    };
    return map[code]?.[fr ? 'fr' : 'en'] ?? code;
  };

  async function callAction(kind: 'feed' | 'play' | 'train') {
    setError(null); setFlash(null); setRecentDelta(null);
    const res = await fetch('/api/pet/action', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: kind }),
    });
    const data = await res.json();
    if (!res.ok) { setError(errorLabel(data.error ?? 'error')); return; }

    // Visual burst + stat chip + pulsing bar — three signals so the member
    // always notices something happened, even on a cheap feed with +5 happy.
    setBurst(data.leveledUp ? 'level' : kind);
    const d = data.delta ?? {};
    const main =
      d.hunger    > 0 ? { key: 'hunger',    emoji: '🍖', value: d.hunger    } :
      d.happiness > 0 ? { key: 'happiness', emoji: '😊', value: d.happiness } :
      d.energy    > 0 ? { key: 'energy',    emoji: '⚡', value: d.energy    } :
      d.xp        > 0 ? { key: 'xp',        emoji: '✨', value: d.xp        } :
                        null;
    if (main) {
      setRecentDelta(main);
      setPulseKey(main.key);
    }
    if (data.leveledUp) setFlash(fr ? `✨ Niveau ${data.pet.level} !` : `✨ Level ${data.pet.level}!`);
    startTransition(() => router.refresh());
  }

  async function adopt() {
    setError(null); setFlash(null);
    if (petName.trim().length < 2) { setError(fr ? 'Le nom est trop court.' : 'Name too short.'); return; }
    const res = await fetch('/api/pet/adopt', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ species: pickedSpecies, name: petName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(errorLabel(data.error ?? 'error')); return; }
    setFlash(fr ? `${data.pet.emoji} ${data.pet.name} adopté·e !` : `${data.pet.emoji} ${data.pet.name} adopted!`);
    startTransition(() => router.refresh());
  }

  async function retire() {
    if (!confirm(fr ? 'Envoyer ton compagnon à la retraite ? (25 PULSE remboursés)' : 'Retire your pet? (25 PULSE refunded)')) return;
    setError(null); setFlash(null);
    const res = await fetch('/api/pet/retire', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { setError(errorLabel(data.error ?? 'error')); return; }
    setFlash(fr ? `Retraite validée. +${data.refund} PULSE.` : `Retirement done. +${data.refund} PULSE.`);
    startTransition(() => router.refresh());
  }

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span><span>{fr ? 'Retour' : 'Back'}</span>
      </Link>
      <h1 className="text-2xl font-bold mb-1">🐾 {fr ? 'Ton compagnon' : 'Your pet'}</h1>

      {error && <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</div>}
      {flash && <div className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">{flash}</div>}

      {!pet ? (
        <>
          <p className="text-pulse-mute text-sm mb-4">{fr ? 'Choisis une espèce et donne-lui un nom (100 PULSE).' : 'Pick a species and give it a name (100 PULSE).'}</p>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {species.map(sp => (
              <button
                key={sp.key}
                onClick={() => setPickedSpecies(sp.key)}
                className={`rounded-xl p-3 border text-center ${pickedSpecies === sp.key ? 'bg-pulse-gold/15 border-pulse-gold' : 'bg-pulse-card border-pulse-border'}`}
              >
                <div className="text-3xl mb-1">{sp.emoji}</div>
                <div className="text-[10px] leading-tight">{fr ? sp.label.fr : sp.label.en}</div>
              </button>
            ))}
          </div>
          <input
            value={petName}
            onChange={e => setPetName(e.target.value)}
            placeholder={fr ? 'Nom du compagnon' : 'Pet name'}
            maxLength={32}
            className="w-full rounded-xl bg-pulse-card border border-pulse-border px-4 py-3 mb-3 focus:outline-none focus:border-pulse-gold"
          />
          <button
            onClick={adopt}
            disabled={isPending || petName.trim().length < 2}
            className="w-full rounded-xl bg-pulse-gold text-black font-bold py-3 disabled:opacity-60"
          >
            {fr ? '🎁 Adopter (100 PULSE)' : '🎁 Adopt (100 PULSE)'}
          </button>
        </>
      ) : (
        <>
          <div className="relative">
            <PetShowcase pet={pet} fr={fr} actionBurst={burst} />
            {recentDelta && (
              <div className="absolute top-4 right-4 pointer-events-none text-sm font-black px-2 py-1 rounded-lg bg-emerald-500/90 text-black animate-[fade-out_2.2s_ease-out_forwards]">
                {recentDelta.emoji} +{recentDelta.value}
              </div>
            )}
          </div>

          <div className="rounded-2xl p-4 bg-pulse-card border border-pulse-border mb-4">
            <div className="grid gap-2.5">
              <Bar value={pet.hunger}    statKey="hunger"    fr={fr} pulse={pulseKey === 'hunger'} />
              <Bar value={pet.happiness} statKey="happiness" fr={fr} pulse={pulseKey === 'happiness'} />
              <Bar value={pet.energy}    statKey="energy"    fr={fr} pulse={pulseKey === 'energy'} />
              <Bar value={pet.health}    statKey="health"    fr={fr} />
            </div>
            <div className="mt-3 pt-3 border-t border-pulse-border/50 flex items-center justify-between text-xs text-pulse-mute">
              <span>🏆 Lv <b className="text-pulse-text">{pet.level}</b></span>
              <span className={pulseKey === 'xp' ? 'animate-pulse text-pulse-gold' : ''}>✨ XP <b className="text-pulse-text">{pet.xp}/100</b></span>
              <span>⚔️ <b className="text-pulse-text">{pet.wins}</b> / <b className="text-pulse-text">{pet.losses}</b></span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <ActionButton
              label={fr ? 'Nourrir' : 'Feed'}
              emoji="🍖"
              cost={5}
              cooldown={cooldowns.feed}
              disabled={isPending}
              color="orange"
              onClick={() => callAction('feed')}
              fr={fr}
            />
            <ActionButton
              label={fr ? 'Jouer' : 'Play'}
              emoji="🎾"
              cost={0}
              cooldown={cooldowns.play}
              tooTired={tooTired.play}
              disabled={isPending}
              color="pink"
              onClick={() => callAction('play')}
              fr={fr}
            />
            <ActionButton
              label={fr ? 'Entraîner' : 'Train'}
              emoji="🥋"
              cost={15}
              cooldown={cooldowns.train}
              tooTired={tooTired.train}
              disabled={isPending}
              color="purple"
              onClick={() => callAction('train')}
              fr={fr}
            />
          </div>

          <button onClick={() => setChallengeOpen(true)} disabled={isPending} className="w-full rounded-xl bg-red-500/20 border border-red-500/40 text-red-100 py-2.5 text-sm disabled:opacity-60 mb-2 font-semibold">
            ⚔️ {fr ? 'Arène — défier un pet' : 'Arena — challenge a pet'}
          </button>

          <button onClick={retire} disabled={isPending} className="w-full rounded-xl bg-pulse-card border border-pulse-border py-2 text-sm text-pulse-mute disabled:opacity-60 mb-6">
            {fr ? 'Retraite (+25 PULSE)' : 'Retire (+25 PULSE)'}
          </button>

          <h2 className="text-sm uppercase tracking-wider text-pulse-mute mb-2">
            {fr ? 'Combats récents' : 'Recent battles'}
          </h2>
          {battles.length > 0 ? (
            <ul className="space-y-1.5">
              {battles.map(b => {
                const won = b.winner_pet_id === pet.id;
                return (
                  <li key={b.id} className="rounded-xl bg-pulse-card border border-pulse-border px-3 py-2 text-sm flex items-center gap-2">
                    <span>{won ? '🏆' : '💥'}</span>
                    <span className="flex-1">{won ? (fr ? 'Victoire' : 'Victory') : (fr ? 'Défaite' : 'Defeat')}</span>
                    {b.pulse_wagered > 0 && <span className={`font-mono text-xs ${won ? 'text-emerald-400' : 'text-red-400'}`}>{won ? '+' : '-'}{b.pulse_wagered}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-pulse-mute italic text-sm">
              {fr ? 'Pas encore de combat. Lance ton premier défi ci-dessus !' : 'No fight yet. Launch your first challenge above!'}
            </p>
          )}
        </>
      )}

      {pet && (
        <PetChallengeDialog
          open={challengeOpen}
          onClose={() => setChallengeOpen(false)}
          fr={fr}
          myLevel={pet.level}
          channels={channels}
          defaultChannel={defaultChannel}
          onSubmit={async ({ opponentId, wager, channelId, opponentName }) => {
            setError(null); setFlash(null);
            const res = await fetch('/api/pet/challenge', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ opponentId, wager, channelId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'error');
            setFlash(fr
              ? `⚔️ Défi envoyé à ${opponentName}. Il doit l'accepter sur Discord — tu verras le résultat dans « Combats récents » dès la résolution.`
              : `⚔️ Challenge sent to ${opponentName}. They must accept on Discord — the result shows up in “Recent battles” once resolved.`);
          }}
        />
      )}

      <style jsx global>{`
        @keyframes fade-out {
          0%   { opacity: 1; transform: translateY(0); }
          80%  { opacity: 1; transform: translateY(-8px); }
          100% { opacity: 0; transform: translateY(-20px); }
        }
      `}</style>
    </>
  );
}

interface ActionButtonProps {
  label: string;
  emoji: string;
  cost: number;
  cooldown: string | null;
  tooTired?: boolean;
  disabled: boolean;
  color: 'orange' | 'pink' | 'purple';
  onClick: () => void;
  fr: boolean;
}

function ActionButton({ label, emoji, cost, cooldown, tooTired, disabled, color, onClick, fr }: ActionButtonProps) {
  const palette = {
    orange: 'bg-orange-500/20 border-orange-500/40',
    pink:   'bg-pink-500/20 border-pink-500/40',
    purple: 'bg-purple-500/20 border-purple-500/40',
  }[color];
  const blocked = Boolean(cooldown) || Boolean(tooTired);
  return (
    <button
      onClick={onClick}
      disabled={disabled || blocked}
      className={`rounded-xl ${palette} py-3 font-semibold disabled:opacity-60 flex flex-col items-center justify-center`}
    >
      <span className="text-sm">{emoji} {label}</span>
      {cooldown ? (
        <span className="text-[10px] text-pulse-mute mt-0.5 font-mono">⏱ {cooldown}</span>
      ) : tooTired ? (
        <span className="text-[10px] text-pulse-mute mt-0.5">{fr ? '😴 trop fatigué' : '😴 too tired'}</span>
      ) : cost > 0 ? (
        <span className="text-[10px] text-pulse-mute mt-0.5">{cost} PULSE</span>
      ) : (
        <span className="text-[10px] text-pulse-mute mt-0.5">{fr ? 'gratuit' : 'free'}</span>
      )}
    </button>
  );
}
