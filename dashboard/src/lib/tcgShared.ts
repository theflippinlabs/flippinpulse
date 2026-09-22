// Client-safe TCG constants. Importable from React client components without
// pulling in the server-only Supabase client that lib/tcg needs.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface Card {
  id: number;
  code: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  attack: number;
  defense: number;
  speed: number;
  flavor: string;
  is_active: boolean;
}

export const PACK_COST = 100;
export const PACK_SIZE = 5;

export const RARITY_STYLE: Record<Rarity, { color: string; ring: string; glow: string; label: { fr: string; en: string } }> = {
  common:    { color: 'text-gray-300',   ring: 'ring-gray-500/40',    glow: 'shadow-none',                                           label: { fr: 'Commune',    en: 'Common'    } },
  rare:      { color: 'text-blue-300',   ring: 'ring-blue-400/60',    glow: 'shadow-[0_0_18px_rgba(59,130,246,.35)]',                label: { fr: 'Rare',       en: 'Rare'      } },
  epic:      { color: 'text-purple-300', ring: 'ring-purple-400/70',  glow: 'shadow-[0_0_22px_rgba(168,85,247,.45)]',                label: { fr: 'Épique',     en: 'Epic'      } },
  legendary: { color: 'text-amber-300',  ring: 'ring-amber-400/80',   glow: 'shadow-[0_0_26px_rgba(251,191,36,.55)]',                label: { fr: 'Légendaire', en: 'Legendary' } },
  mythic:    { color: 'text-red-300',    ring: 'ring-red-400/90',     glow: 'shadow-[0_0_32px_rgba(239,68,68,.75)]',                 label: { fr: 'Mythique',   en: 'Mythic'    } },
};

export function rarityOrder(r: Rarity): number {
  return { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 }[r];
}
