-- ============================================================
-- TCG: split cards into Characters and Equipment.
-- Characters attack. Equipment attaches to a character and boosts
-- its stats. The champion's effective ATK/DEF/SPD in a duel is the
-- base + sum of every equipped item's *_bonus.
-- ============================================================

ALTER TABLE public.tcg_cards
  ADD COLUMN IF NOT EXISTS card_kind TEXT NOT NULL DEFAULT 'character',
  ADD COLUMN IF NOT EXISTS atk_bonus INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS def_bonus INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spd_bonus INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'tcg_cards_card_kind_chk'
  ) THEN
    ALTER TABLE public.tcg_cards
      ADD CONSTRAINT tcg_cards_card_kind_chk
      CHECK (card_kind IN ('character', 'equipment'));
  END IF;
END$$;

-- ============================================================
-- Seed a starter equipment catalog. Bonuses scale with rarity so
-- the game keeps a meaningful power curve. All seeds are idempotent
-- via ON CONFLICT (code) so re-running the migration is safe.
-- ============================================================

INSERT INTO public.tcg_cards
  (code, name, emoji, rarity, attack, defense, speed, flavor, is_active, card_kind, atk_bonus, def_bonus, spd_bonus)
VALUES
  ('e_iron_sword',   'Iron Sword',      '🗡️', 'common',    0, 0, 0, 'A trusty blade.',                          true, 'equipment', 1, 0, 0),
  ('e_wood_shield',  'Wooden Shield',   '🛡️', 'common',    0, 0, 0, 'Splinters but holds.',                     true, 'equipment', 0, 1, 0),
  ('e_light_boots',  'Light Boots',     '👟', 'common',    0, 0, 0, 'Faster than nothing.',                     true, 'equipment', 0, 0, 1),
  ('e_silver_blade', 'Silver Blade',    '⚔️', 'rare',      0, 0, 0, 'Sharpened by moonlight.',                  true, 'equipment', 2, 0, 0),
  ('e_iron_shield',  'Iron Shield',     '🛡️', 'rare',      0, 0, 0, 'Turns arrows into music.',                 true, 'equipment', 0, 2, 0),
  ('e_wind_cloak',   'Wind Cloak',      '🧣', 'rare',      0, 0, 0, 'The gale takes you further.',              true, 'equipment', 0, 0, 2),
  ('e_flame_saber',  'Flame Saber',     '🔥', 'epic',      0, 0, 0, 'It never sheathes cold.',                  true, 'equipment', 3, 0, 0),
  ('e_aegis_plate',  'Aegis Plate',     '⚜️', 'epic',      0, 0, 0, 'Kings have hidden behind less.',           true, 'equipment', 0, 3, 0),
  ('e_swift_amulet', 'Swift Amulet',    '🌀', 'epic',      0, 0, 0, 'Time bends around the wearer.',            true, 'equipment', 0, 0, 3),
  ('e_dragon_fang',  'Dragon Fang',     '🐉', 'legendary', 0, 0, 0, 'Every wound remembers the dragon.',        true, 'equipment', 4, 0, 0),
  ('e_titan_bulwark','Titan Bulwark',   '🏛️', 'legendary', 0, 0, 0, 'A wall that walks with you.',              true, 'equipment', 0, 4, 0),
  ('e_solar_wings',  'Solar Wings',     '🌟', 'legendary', 0, 0, 0, 'You outrun the dawn.',                     true, 'equipment', 0, 0, 4),
  ('e_void_scythe',  'Void Scythe',     '🌑', 'mythic',    0, 0, 0, 'It cuts the idea of you.',                 true, 'equipment', 5, 0, 0),
  ('e_eternal_ward', 'Eternal Ward',    '💎', 'mythic',    0, 0, 0, 'No harm has ever reached its wearer.',     true, 'equipment', 0, 5, 0),
  ('e_chrono_boots', 'Chrono Boots',    '⌛', 'mythic',    0, 0, 0, 'You strike before deciding to.',           true, 'equipment', 0, 0, 5)
ON CONFLICT (code) DO NOTHING;
