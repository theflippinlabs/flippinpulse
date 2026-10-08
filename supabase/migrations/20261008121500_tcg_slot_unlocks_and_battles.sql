-- ============================================================
-- TCG: purchasable extra equipment slots + persisted duel history.
--
-- A fresh account starts with 3 unlocked slots (weapon, shield, spell).
-- Members buy the three remaining slots (helmet, boots, amulet) with
-- PULSE through the dashboard; this table remembers who owns which.
--
-- tcg_battles stores every resolved card duel so the dashboard can show
-- recent fights, win rate and the fight log without re-querying Discord.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tcg_slot_unlocks (
  discord_id TEXT NOT NULL,
  slot       TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_id, slot),
  CONSTRAINT tcg_slot_unlocks_slot_chk CHECK (slot IN ('weapon','shield','spell','helmet','boots','amulet'))
);

ALTER TABLE public.tcg_slot_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tcg_slot_unlocks_service_role ON public.tcg_slot_unlocks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.tcg_battles (
  id              BIGSERIAL PRIMARY KEY,
  attacker_id     TEXT NOT NULL,
  defender_id     TEXT NOT NULL,
  winner_id       TEXT,                 -- NULL on a tie / cancelled fight
  attacker_card   TEXT NOT NULL,        -- character card code
  defender_card   TEXT,                 -- defender's champion if they picked one
  pulse_wagered   INT  NOT NULL DEFAULT 0,
  log_json        JSONB,                -- round-by-round log for a future replay view
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tcg_battles_attacker_idx ON public.tcg_battles(attacker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tcg_battles_defender_idx ON public.tcg_battles(defender_id, created_at DESC);

ALTER TABLE public.tcg_battles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tcg_battles_service_role ON public.tcg_battles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
