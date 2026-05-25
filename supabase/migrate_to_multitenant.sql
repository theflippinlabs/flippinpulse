-- ============================================================
-- PULSE ENGINE — IN-PLACE MIGRATION: single-server -> multi-tenant
-- ============================================================
-- Upgrades your EXISTING single-server database (the current
-- production schema from setup_complete.sql) into the multi-tenant
-- (Pro) schema, WITHOUT losing any data. Every existing row is
-- tagged with your current server's guild_id.
--
-- ⚠️ SAFETY FIRST
--   1. Do NOT run this blindly on production. Test it on a COPY first
--      (Supabase: create a new project, restore a backup, run it there).
--   2. Take a backup / snapshot before running on production.
--   3. Run the WHOLE script in one go (the guild id is set for the session).
--   4. After this, deploy the Pro bot code (branch claude/multi-server-pro,
--      see MULTI_SERVER.md). The old single-server bot must be stopped first,
--      or it will keep writing rows without guild_id.
--
-- It is written to be re-runnable (idempotent) where possible.
-- ============================================================

-- 👉 STEP 0 — put YOUR Discord server (guild) ID here, then run everything.
SELECT set_config('app.guild_id', 'PUT-YOUR-GUILD-ID-HERE', false);

SET check_function_bodies = off;

-- ------------------------------------------------------------
-- STEP 1 — add guild_id to every per-server table and backfill it
-- ------------------------------------------------------------
DO $$
DECLARE
  gid TEXT := current_setting('app.guild_id');
  t   TEXT;
  tables TEXT[] := ARRAY[
    'discord_users','activity_events','missions','mission_completions',
    'roles_config','settings','audit_logs','shop_items','pulse_transactions',
    'orders','user_purchases','games_config','game_sessions','quiz_questions',
    'user_game_limits','lottery_rounds','lottery_tickets'
  ];
BEGIN
  IF gid = 'PUT-YOUR-GUILD-ID-HERE' OR gid IS NULL OR gid = '' THEN
    RAISE EXCEPTION 'Set your guild id in STEP 0 first.';
  END IF;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS guild_id TEXT', t);
    EXECUTE format('UPDATE public.%I SET guild_id = %L WHERE guild_id IS NULL', t, gid);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN guild_id SET NOT NULL', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- STEP 2 — drop foreign keys / uniques that block per-guild keys
-- (names below are PostgreSQL's defaults for the original schema)
-- ------------------------------------------------------------
ALTER TABLE public.activity_events     DROP CONSTRAINT IF EXISTS activity_events_discord_id_fkey;
ALTER TABLE public.mission_completions DROP CONSTRAINT IF EXISTS mission_completions_discord_id_fkey;
ALTER TABLE public.game_sessions       DROP CONSTRAINT IF EXISTS game_sessions_game_key_fkey;

ALTER TABLE public.discord_users   DROP CONSTRAINT IF EXISTS discord_users_discord_id_key;
ALTER TABLE public.settings        DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE public.games_config    DROP CONSTRAINT IF EXISTS games_config_pkey;
ALTER TABLE public.roles_config    DROP CONSTRAINT IF EXISTS roles_config_rank_name_key;
ALTER TABLE public.user_game_limits DROP CONSTRAINT IF EXISTS user_game_limits_discord_id_limit_key_key;

-- ------------------------------------------------------------
-- STEP 3 — add the new per-guild keys
-- ------------------------------------------------------------
ALTER TABLE public.discord_users    ADD CONSTRAINT discord_users_guild_discord_key UNIQUE (guild_id, discord_id);
ALTER TABLE public.settings         ADD CONSTRAINT settings_pkey PRIMARY KEY (guild_id, key);
ALTER TABLE public.games_config     ADD CONSTRAINT games_config_pkey PRIMARY KEY (guild_id, game_key);
ALTER TABLE public.roles_config     ADD CONSTRAINT roles_config_guild_rank_key UNIQUE (guild_id, rank_name);
ALTER TABLE public.user_game_limits ADD CONSTRAINT user_game_limits_guild_user_key_key UNIQUE (guild_id, discord_id, limit_key);

-- helpful indexes for per-guild lookups
CREATE INDEX IF NOT EXISTS idx_discord_users_guild ON public.discord_users (guild_id);
CREATE INDEX IF NOT EXISTS idx_tx_guild_user ON public.pulse_transactions (guild_id, discord_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_guild ON public.shop_items (guild_id, is_active);
CREATE INDEX IF NOT EXISTS idx_quiz_guild ON public.quiz_questions (guild_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_guild ON public.game_sessions (guild_id, status);
CREATE INDEX IF NOT EXISTS idx_missions_guild ON public.missions (guild_id, is_active);
CREATE INDEX IF NOT EXISTS idx_lottery_rounds_guild ON public.lottery_rounds (guild_id, status, draw_at);

-- ------------------------------------------------------------
-- STEP 4 — create the guilds registry + per-guild seeding function
-- (so the Pro bot can onboard NEW servers automatically)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guilds (
  guild_id TEXT PRIMARY KEY,
  name TEXT,
  owner_discord_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  is_active BOOLEAN NOT NULL DEFAULT true,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.guilds ENABLE ROW LEVEL SECURITY;

-- register your current server
INSERT INTO public.guilds (guild_id, plan)
VALUES (current_setting('app.guild_id'), 'pro')
ON CONFLICT (guild_id) DO NOTHING;

-- NOTE: the seed_guild_defaults(text) function lives in
-- supabase/setup_multitenant.sql — run that file once too (it only
-- CREATEs things that don't exist yet and adds the function). Your
-- existing data is preserved because all its inserts use
-- ON CONFLICT DO NOTHING.

-- ------------------------------------------------------------
-- STEP 5 — verify
-- ------------------------------------------------------------
SELECT 'discord_users' AS table, count(*) AS rows, count(*) FILTER (WHERE guild_id IS NOT NULL) AS with_guild FROM public.discord_users
UNION ALL SELECT 'settings', count(*), count(*) FILTER (WHERE guild_id IS NOT NULL) FROM public.settings
UNION ALL SELECT 'games_config', count(*), count(*) FILTER (WHERE guild_id IS NOT NULL) FROM public.games_config
UNION ALL SELECT 'pulse_transactions', count(*), count(*) FILTER (WHERE guild_id IS NOT NULL) FROM public.pulse_transactions;
