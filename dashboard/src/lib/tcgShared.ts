// Client-safe TCG constants. Importable from React client components without
// pulling in the server-only Supabase client that lib/tcg needs.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type CardKind = 'character' | 'equipment';
export type EquipmentSlot = 'weapon' | 'shield' | 'spell' | 'helmet' | 'boots' | 'amulet';

export const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'shield', 'spell', 'helmet', 'boots', 'amulet'];

export const SLOT_LABEL: Record<EquipmentSlot, { fr: string; en: string; icon: string }> = {
  weapon: { fr: 'Arme',      en: 'Weapon',  icon: '🗡️' },
  shield: { fr: 'Bouclier',  en: 'Shield',  icon: '🛡️' },
  spell:  { fr: 'Sort',      en: 'Spell',   icon: '🔮' },
  helmet: { fr: 'Casque',    en: 'Helmet',  icon: '⛑️' },
  boots:  { fr: 'Bottes',    en: 'Boots',   icon: '👟' },
  amulet: { fr: 'Amulette',  en: 'Amulet',  icon: '📿' },
};

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
  equipment_slot: EquipmentSlot | null;
  atk_bonus: number;
  def_bonus: number;
  spd_bonus: number;
}

// One row per (owner, card, level). A member can own the same equipment
// card at multiple levels simultaneously (e.g. two level-1s waiting to be
// merged plus one level-3 already equipped).
export interface OwnedCopy {
  card_id: number;
  level: number;
  quantity: number;
}

// A picked equipment for a duel: which card, at what level.
export interface EquipmentSelection {
  cardId: number;
  level: number;
}

export const PACK_COST = 100;
export const PACK_SIZE = 5;
export const MAX_LEVEL = 5;
export const MERGE_COST_COPIES = 3;
// Every equipment slot may hold at most one item, so a full loadout tops
// out at EQUIPMENT_SLOTS.length items.
export const MAX_EQUIPMENT_SLOTS = EQUIPMENT_SLOTS.length;

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

// Bonuses at a given level = base × level. So a legendary +4 ATK item at
// level 3 grants +12 ATK. The curve is intentionally punchy so pushing an
// equipment to lv5 feels meaningful.
export function scaledBonuses(card: Card, level: number): { atk: number; def: number; spd: number } {
  const l = Math.max(1, Math.min(MAX_LEVEL, level));
  return {
    atk: (card.atk_bonus ?? 0) * l,
    def: (card.def_bonus ?? 0) * l,
    spd: (card.spd_bonus ?? 0) * l,
  };
}

export interface EquippedItem { card: Card; level: number; }

export function effectiveStats(character: Card, equipment: EquippedItem[]): { attack: number; defense: number; speed: number } {
  let atk = character.attack, def = character.defense, spd = character.speed;
  for (const e of equipment) {
    const b = scaledBonuses(e.card, e.level);
    atk += b.atk; def += b.def; spd += b.spd;
  }
  return { attack: atk, defense: def, speed: spd };
}
