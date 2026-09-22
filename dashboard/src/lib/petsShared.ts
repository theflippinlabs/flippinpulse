// Client-safe pet constants (no Supabase import).

export type SpeciesKey = 'flame_fox' | 'crystal_wolf' | 'thunder_kitty' | 'shadow_bear' | 'coral_axolotl' | 'sky_owl' | 'lava_dragon' | 'moon_bunny';

export const SPECIES: { key: SpeciesKey; emoji: string; label: { fr: string; en: string } }[] = [
  { key: 'flame_fox',     emoji: '🦊', label: { fr: 'Renard de flammes',    en: 'Flame Fox'     } },
  { key: 'crystal_wolf',  emoji: '🐺', label: { fr: 'Loup de cristal',       en: 'Crystal Wolf'  } },
  { key: 'thunder_kitty', emoji: '⚡', label: { fr: 'Chat foudre',           en: 'Thunder Kitty' } },
  { key: 'shadow_bear',   emoji: '🐻', label: { fr: 'Ours des ombres',       en: 'Shadow Bear'   } },
  { key: 'coral_axolotl', emoji: '🦎', label: { fr: 'Axolotl corail',        en: 'Coral Axolotl' } },
  { key: 'sky_owl',       emoji: '🦉', label: { fr: 'Hibou céleste',         en: 'Sky Owl'       } },
  { key: 'lava_dragon',   emoji: '🐉', label: { fr: 'Dragonneau de lave',    en: 'Lava Dragon'   } },
  { key: 'moon_bunny',    emoji: '🐰', label: { fr: 'Lapin de lune',         en: 'Moon Bunny'    } },
];

export const ADOPTION_COST = 100;
export const FEED_COST = 5;
export const TRAIN_COST = 15;

export interface Pet {
  id: number;
  discord_id: string;
  name: string;
  species: string;
  emoji: string;
  level: number;
  xp: number;
  hunger: number;
  happiness: number;
  energy: number;
  health: number;
  wins: number;
  losses: number;
  last_fed_at: string | null;
  last_played_at: string | null;
  last_trained_at: string | null;
  last_battle_at: string | null;
  last_ticked_at: string;
  is_active: boolean;
  created_at: string;
}
