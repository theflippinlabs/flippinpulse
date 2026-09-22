-- ============================================================
-- TCG: equipment slots + per-copy leveling.
--
-- Slots  — each champion may equip AT MOST ONE item of every slot,
--          so a full loadout is up to 6 items.
--          Slots: weapon · shield · spell · helmet · boots · amulet
--
-- Levels — an equipment copy carries a level (1..5). Levels multiply
--          the base bonus (level N → base × N). Merging 3 copies of
--          the same equipment at level N produces 1 copy at level N+1,
--          which is handled by /api/cards/upgrade-equipment.
-- ============================================================

ALTER TABLE public.tcg_cards
  ADD COLUMN IF NOT EXISTS equipment_slot TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'tcg_cards_equipment_slot_chk'
  ) THEN
    ALTER TABLE public.tcg_cards
      ADD CONSTRAINT tcg_cards_equipment_slot_chk
      CHECK (
        (card_kind = 'equipment' AND equipment_slot IN ('weapon','shield','spell','helmet','boots','amulet'))
        OR (card_kind = 'character' AND equipment_slot IS NULL)
      );
  END IF;
END$$;

-- Assign slots to the 15 equipment seeds from the previous migration.
UPDATE public.tcg_cards SET equipment_slot = 'weapon' WHERE code IN ('e_iron_sword','e_silver_blade','e_flame_saber','e_dragon_fang','e_void_scythe') AND equipment_slot IS NULL;
UPDATE public.tcg_cards SET equipment_slot = 'shield' WHERE code IN ('e_wood_shield','e_iron_shield','e_aegis_plate','e_titan_bulwark','e_eternal_ward') AND equipment_slot IS NULL;
UPDATE public.tcg_cards SET equipment_slot = 'boots'  WHERE code IN ('e_light_boots','e_wind_cloak','e_solar_wings','e_chrono_boots') AND equipment_slot IS NULL;
UPDATE public.tcg_cards SET equipment_slot = 'amulet' WHERE code IN ('e_swift_amulet') AND equipment_slot IS NULL;
-- Any leftover equipment we forgot to slot: infer from dominant bonus.
UPDATE public.tcg_cards SET equipment_slot = 'weapon' WHERE card_kind = 'equipment' AND equipment_slot IS NULL AND atk_bonus > 0;
UPDATE public.tcg_cards SET equipment_slot = 'shield' WHERE card_kind = 'equipment' AND equipment_slot IS NULL AND def_bonus > 0;
UPDATE public.tcg_cards SET equipment_slot = 'boots'  WHERE card_kind = 'equipment' AND equipment_slot IS NULL AND spd_bonus > 0;

-- Seed the missing slots: spells, helmets, amulets (rarity progression).
INSERT INTO public.tcg_cards
  (code, name, emoji, rarity, attack, defense, speed, flavor, is_active, card_kind, equipment_slot, atk_bonus, def_bonus, spd_bonus)
VALUES
  -- spells
  ('e_ember_bolt',     'Ember Bolt',     '🔥', 'common',    0,0,0,'A quick spark.',                    true,'equipment','spell', 1,0,0),
  ('e_frost_ward',     'Frost Ward',     '❄️', 'common',    0,0,0,'Chill the air, chill the foe.',      true,'equipment','spell', 0,1,0),
  ('e_zephyr_step',    'Zephyr Step',    '🌬️', 'common',    0,0,0,'Feet lighter than thought.',         true,'equipment','spell', 0,0,1),
  ('e_pyre_lance',     'Pyre Lance',     '☄️', 'rare',      0,0,0,'A javelin of pure fire.',            true,'equipment','spell', 2,0,0),
  ('e_arcane_barrier', 'Arcane Barrier', '🌀', 'rare',      0,0,0,'A wall of woven runes.',             true,'equipment','spell', 0,2,0),
  ('e_starcaller',     'Starcaller',     '✨', 'epic',      0,0,0,'Even the sky replies.',              true,'equipment','spell', 3,0,1),
  ('e_aegis_hymn',     'Aegis Hymn',     '📯', 'epic',      0,0,0,'A song no blade can pierce.',        true,'equipment','spell', 0,3,0),
  ('e_grand_meteor',   'Grand Meteor',   '🌠', 'legendary', 0,0,0,'The heavens fall on command.',       true,'equipment','spell', 5,0,0),
  ('e_gaia_shell',     'Gaia Shell',     '🌍', 'legendary', 0,0,0,'The world itself defends you.',      true,'equipment','spell', 0,5,0),
  ('e_god_word',       'God Word',       '🔯', 'mythic',    0,0,0,'One syllable rewrites reality.',      true,'equipment','spell', 6,3,0),
  -- helmets
  ('e_leather_cap',    'Leather Cap',    '🎩', 'common',    0,0,0,'Better than nothing.',                true,'equipment','helmet',0,1,0),
  ('e_iron_helm',      'Iron Helm',      '⛑️', 'rare',      0,0,0,'Cheap insurance.',                    true,'equipment','helmet',0,2,0),
  ('e_dragonhelm',     'Dragon Helm',    '🐲', 'epic',      0,0,0,'The dragon still watches.',           true,'equipment','helmet',0,3,0),
  ('e_crown_of_kings', 'Crown of Kings', '👑', 'legendary', 0,0,0,'It has never been humble.',           true,'equipment','helmet',1,3,0),
  ('e_starlit_diadem', 'Starlit Diadem', '💫', 'mythic',    0,0,0,'You wear the night.',                 true,'equipment','helmet',2,4,0),
  -- amulets
  ('e_copper_charm',   'Copper Charm',   '🪙', 'common',    0,0,0,'Bought at the fair.',                 true,'equipment','amulet',0,0,1),
  ('e_lucky_locket',   'Lucky Locket',   '🍀', 'rare',      0,0,0,'It has never let its owner die.',     true,'equipment','amulet',1,1,1),
  ('e_moonwreath',     'Moonwreath',     '🌙', 'epic',      0,0,0,'You blur between shadows.',           true,'equipment','amulet',0,0,3),
  ('e_phoenix_tear',   'Phoenix Tear',   '🥀', 'legendary', 0,0,0,'A single tear of resurrection.',      true,'equipment','amulet',2,2,2),
  ('e_worldheart',     'Worldheart',     '💠', 'mythic',    0,0,0,'The heartbeat of everything.',        true,'equipment','amulet',3,3,3)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- Per-copy level tracking on tcg_collection.
-- Existing rows default to level 1, which matches everything the
-- game did before this migration.
-- ============================================================
ALTER TABLE public.tcg_collection
  ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5);

-- Widen the uniqueness so the same (member, card) can exist at multiple
-- levels. We look up whatever 2-column UNIQUE(discord_id, card_id) was
-- in place under the previous schema and drop it before adding the new
-- 3-column key.
DO $$
DECLARE cname TEXT;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'public.tcg_collection'::regclass
     AND contype = 'u'
     AND array_length(conkey, 1) = 2
   LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tcg_collection DROP CONSTRAINT %I', cname);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tcg_collection_owner_card_level_key'
  ) THEN
    ALTER TABLE public.tcg_collection
      ADD CONSTRAINT tcg_collection_owner_card_level_key
      UNIQUE (discord_id, card_id, level);
  END IF;
END$$;
