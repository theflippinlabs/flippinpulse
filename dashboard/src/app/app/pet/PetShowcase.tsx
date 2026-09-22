'use client';

import { useEffect, useState } from 'react';
import type { Pet } from '@/lib/petsShared';

interface Props {
  pet: Pet;
  fr: boolean;
  actionBurst: 'feed' | 'play' | 'train' | 'level' | null;
}

// Choose a mood emoji + tint that reacts to the pet's current stats. This is
// intentionally not a language string — it's the visual overlay.
function computeMood(pet: Pet): { label: { fr: string; en: string }; ring: string; glow: string; expression: string } {
  if (pet.health <= 25) return {
    label: { fr: '💔 Prends soin de moi !', en: '💔 Take care of me!' },
    ring: 'ring-red-500/60',
    glow: 'shadow-[0_0_60px_-10px_rgba(239,68,68,.7)]',
    expression: '🥺',
  };
  if (pet.hunger <= 25) return {
    label: { fr: '🍖 J\'ai faim…', en: '🍖 I\'m hungry…' },
    ring: 'ring-orange-500/60',
    glow: 'shadow-[0_0_60px_-10px_rgba(249,115,22,.6)]',
    expression: '😩',
  };
  if (pet.energy <= 20) return {
    label: { fr: '💤 Zzz…', en: '💤 Zzz…' },
    ring: 'ring-blue-500/40',
    glow: 'shadow-[0_0_50px_-10px_rgba(59,130,246,.5)]',
    expression: '😴',
  };
  if (pet.happiness >= 80 && pet.energy >= 60 && pet.hunger >= 60) return {
    label: { fr: '✨ En pleine forme !', en: '✨ Feeling great!' },
    ring: 'ring-pulse-gold/70',
    glow: 'shadow-[0_0_70px_-8px_rgba(245,182,46,.7)]',
    expression: '🥰',
  };
  return {
    label: { fr: '😊 Ça va bien', en: '😊 Doing fine' },
    ring: 'ring-purple-500/40',
    glow: 'shadow-[0_0_55px_-10px_rgba(168,85,247,.55)]',
    expression: '😊',
  };
}

// Floating particles are keyed on the burst so React swaps them cleanly on each action.
function ParticleBurst({ kind }: { kind: NonNullable<Props['actionBurst']> }) {
  const symbol =
    kind === 'feed'  ? '🍖' :
    kind === 'play'  ? '❤️' :
    kind === 'train' ? '💪' :
                       '✨';
  const items = Array.from({ length: kind === 'level' ? 8 : 5 }, (_, i) => i);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {items.map(i => {
        const x = 20 + Math.random() * 60;
        const delay = i * 90;
        const dur = 1200 + Math.random() * 500;
        return (
          <span
            key={`${kind}-${i}`}
            className="absolute text-2xl animate-[floatUp_1.3s_ease-out_forwards]"
            style={{
              left: `${x}%`,
              bottom: '30%',
              animationDelay: `${delay}ms`,
              animationDuration: `${dur}ms`,
            }}
          >
            {symbol}
          </span>
        );
      })}
    </div>
  );
}

export default function PetShowcase({ pet, fr, actionBurst }: Props) {
  const mood = computeMood(pet);
  const [breathe, setBreathe] = useState(false);
  useEffect(() => { setBreathe(true); }, []);

  return (
    <div className={`relative rounded-3xl overflow-hidden border border-pulse-border ${mood.ring} ring-2 ${mood.glow} bg-gradient-to-b from-purple-950/40 via-black to-black mb-4`}>
      {/* Radial spotlight background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(245,182,46,.18),transparent_65%)]" />
        <div className="absolute -inset-40 bg-[radial-gradient(circle_at_center,rgba(168,85,247,.15),transparent_60%)] animate-[breatheGlow_5s_ease-in-out_infinite]" />
      </div>

      {/* Header line inside the showcase */}
      <div className="relative flex items-center justify-between px-4 pt-4">
        <div className="min-w-0">
          <div className="text-lg font-black tracking-wide">{pet.name}</div>
          <div className="text-[10px] text-pulse-mute font-mono uppercase tracking-wider">
            Lv {pet.level} · {pet.xp}/100 XP · 🏆 {pet.wins} · 💔 {pet.losses}
          </div>
        </div>
        <div className="text-[10px] px-2 py-1 rounded-full bg-black/60 border border-pulse-border">
          {fr ? mood.label.fr : mood.label.en}
        </div>
      </div>

      {/* Main pet stage */}
      <div className="relative h-56 flex items-end justify-center pb-6">
        {/* Shadow / pedestal */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-40 h-6 rounded-full bg-black/70 blur-lg" />
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-32 h-2 rounded-full bg-pulse-gold/30 blur-sm" />

        {/* Pet — big emoji sitting on the pedestal, floating idle animation */}
        <div
          className="relative select-none"
          style={{ animation: 'petFloat 3.5s ease-in-out infinite' }}
        >
          <span
            className="text-[112px] leading-none block drop-shadow-[0_20px_25px_rgba(0,0,0,.7)]"
            style={{
              filter: 'drop-shadow(0 0 22px rgba(245,182,46,.45))',
              transform: breathe ? undefined : 'scale(.9)',
              transition: 'transform 800ms ease-out',
            }}
          >
            {pet.emoji}
          </span>
          {/* Mood expression floating next to the pet */}
          <span
            className="absolute -top-2 -right-3 text-2xl"
            style={{ animation: 'wobble 2.5s ease-in-out infinite' }}
          >
            {mood.expression}
          </span>
        </div>

        {/* Level & tap-to-pet hint */}
        <div className="absolute top-3 right-4 text-[10px] px-2 py-1 rounded-full bg-black/60 border border-pulse-border">
          ⚔️ ATK ~{Math.round(6 + pet.level * 2)}
        </div>

        {/* Action burst particles */}
        {actionBurst && <ParticleBurst kind={actionBurst} />}
      </div>

      {/* Local keyframes — kept inline so this file is self-contained. */}
      <style jsx>{`
        @keyframes petFloat {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50%      { transform: translateY(-10px) rotate(1deg); }
        }
        @keyframes wobble {
          0%, 100% { transform: rotate(-8deg) translateY(0); }
          50%      { transform: rotate(8deg) translateY(-4px); }
        }
        @keyframes floatUp {
          0%   { opacity: 0; transform: translateY(0) scale(.8); }
          20%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-120px) scale(1.1); }
        }
        @keyframes breatheGlow {
          0%, 100% { opacity: .4; transform: scale(1); }
          50%      { opacity: .8; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
