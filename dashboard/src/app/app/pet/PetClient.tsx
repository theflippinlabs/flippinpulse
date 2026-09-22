'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SPECIES, type Pet, type SpeciesKey } from '@/lib/petsShared';

interface Props {
  fr: boolean;
  pet: Pet | null;
  species: typeof SPECIES;
  battles: { id: number; winner_pet_id: number | null; pulse_wagered: number; created_at: string }[];
}

const STAT_STYLE: Record<string, { color: string; emoji: string; labelFr: string; labelEn: string }> = {
  hunger:    { color: 'bg-orange-500',  emoji: '🍖', labelFr: 'Faim',    labelEn: 'Hunger'    },
  happiness: { color: 'bg-pink-500',    emoji: '😊', labelFr: 'Bonheur', labelEn: 'Happiness' },
  energy:    { color: 'bg-yellow-400',  emoji: '⚡', labelFr: 'Énergie', labelEn: 'Energy'    },
  health:    { color: 'bg-red-500',     emoji: '❤️', labelFr: 'Santé',   labelEn: 'Health'    },
};

function Bar({ value, statKey, fr }: { value: number; statKey: keyof typeof STAT_STYLE; fr: boolean }) {
  const st = STAT_STYLE[statKey];
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span>{st.emoji} {fr ? st.labelFr : st.labelEn}</span>
        <span className="font-mono text-pulse-mute">{value}</span>
      </div>
      <div className="h-2.5 bg-pulse-border/60 rounded-full overflow-hidden">
        <div className={`h-full ${st.color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function PetClient({ fr, pet, species, battles }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [pickedSpecies, setPickedSpecies] = useState<SpeciesKey>(species[0].key);
  const [petName, setPetName] = useState('');

  const errorLabel = (code: string): string => {
    const map: Record<string, { fr: string; en: string }> = {
      already_owns_pet: { fr: 'Tu as déjà un compagnon.', en: 'You already have a pet.' },
      unknown_species: { fr: 'Espèce inconnue.', en: 'Unknown species.' },
      name_too_short: { fr: 'Le nom est trop court.', en: 'Name too short.' },
      insufficient_pulse: { fr: 'PULSE insuffisant.', en: 'Not enough PULSE.' },
      no_pet: { fr: 'Aucun compagnon actif.', en: 'No active pet.' },
      cooldown: { fr: 'Cooldown non écoulé.', en: 'Cooldown active.' },
      too_tired: { fr: 'Trop fatigué·e.', en: 'Too tired.' },
      user_not_found: { fr: 'Compte introuvable.', en: 'Account not found.' },
    };
    return map[code]?.[fr ? 'fr' : 'en'] ?? code;
  };

  async function callAction(kind: 'feed' | 'play' | 'train') {
    setError(null); setFlash(null);
    const res = await fetch('/api/pet/action', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: kind }),
    });
    const data = await res.json();
    if (!res.ok) { setError(errorLabel(data.error ?? 'error')); return; }
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
          <div className="rounded-2xl p-4 bg-gradient-to-br from-pulse-gold/20 to-pulse-gold/5 border border-pulse-gold/40 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="text-5xl">{pet.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xl font-bold truncate">{pet.name}</div>
                <div className="text-xs text-pulse-mute">
                  {fr ? 'Niveau' : 'Level'} {pet.level} · {pet.xp}/100 XP · 🏆 {pet.wins} · 💔 {pet.losses}
                </div>
              </div>
            </div>
            <div className="grid gap-2.5">
              <Bar value={pet.hunger}    statKey="hunger"    fr={fr} />
              <Bar value={pet.happiness} statKey="happiness" fr={fr} />
              <Bar value={pet.energy}    statKey="energy"    fr={fr} />
              <Bar value={pet.health}    statKey="health"    fr={fr} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <button onClick={() => callAction('feed')}  disabled={isPending} className="rounded-xl bg-orange-500/20 border border-orange-500/40 py-3 font-semibold disabled:opacity-60">🍖 {fr ? 'Nourrir (5)' : 'Feed (5)'}</button>
            <button onClick={() => callAction('play')}  disabled={isPending} className="rounded-xl bg-pink-500/20 border border-pink-500/40 py-3 font-semibold disabled:opacity-60">🎾 {fr ? 'Jouer' : 'Play'}</button>
            <button onClick={() => callAction('train')} disabled={isPending} className="rounded-xl bg-purple-500/20 border border-purple-500/40 py-3 font-semibold disabled:opacity-60">🥋 {fr ? 'Entraîner (15)' : 'Train (15)'}</button>
          </div>

          <button onClick={retire} disabled={isPending} className="w-full rounded-xl bg-pulse-card border border-pulse-border py-2 text-sm text-pulse-mute disabled:opacity-60 mb-6">
            {fr ? 'Retraite (+25 PULSE)' : 'Retire (+25 PULSE)'}
          </button>

          {battles.length > 0 && (
            <>
              <h2 className="text-sm uppercase tracking-wider text-pulse-mute mb-2">{fr ? 'Combats récents' : 'Recent battles'}</h2>
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
            </>
          )}
        </>
      )}
    </>
  );
}
