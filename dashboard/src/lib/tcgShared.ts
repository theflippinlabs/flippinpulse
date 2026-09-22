// Client-safe TCG constants. Importable from React client components without
// pulling in the server-only Supabase client that lib/tcg needs.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type CardKind = 'character' | 'equipment';

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
  card_kind: CardKind;
  atk_bonus: number;
  def_bonus: number;
  spd_bonus: number;
}

export const PACK_COST = 100;
export const PACK_SIZE = 5;
// Max equipment items that can attach to a champion in a duel.
export const MAX_EQUIPMENT_SLOTS = 3;

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

export const SELL_VALUE: Record<Rarity, number> = {
  common: 10, rare: 30, epic: 100, legendary: 300, mythic: 1000,
};

// null = terminal rarity (mythic can't be fused up).
export const NEXT_RARITY: Record<Rarity, Rarity | null> = {
  common: 'rare', rare: 'epic', epic: 'legendary', legendary: 'mythic', mythic: null,
};

// Effective stats for a champion once equipment is attached.
export function effectiveStats(character: Card, equipment: Card[]): { attack: number; defense: number; speed: number } {
  return {
    attack:  character.attack  + equipment.reduce((s, e) => s + (e.atk_bonus ?? 0), 0),
    defense: character.defense + equipment.reduce((s, e) => s + (e.def_bonus ?? 0), 0),
    speed:   character.speed   + equipment.reduce((s, e) => s + (e.spd_bonus ?? 0), 0),
  };
}
