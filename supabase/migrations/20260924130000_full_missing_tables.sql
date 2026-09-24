-- ============================================================
-- BOOTSTRAP THE FULL SCHEMA.
--
-- Before this migration, a Lord running AUTO_DB_SETUP=true only got
-- the snapshot from setup_complete.sql (roughly the first 40 tables:
-- economy / games / shop / lottery / moderation / tournaments / etc).
-- Every "Wave" feature (AI companion, Battle Pass, Pets, Cards,
-- Marriages, Guilds, Bank, Calendar, Sagas, Treasure hunts, Push,
-- Birthdays, Weekly analytics, Streaming, Cosmetic ledger) queried
-- tables that had never been created, silently failed on 42P01
-- ("relation does not exist"), and >⅔ of the marketing deck did
-- nothing on a fresh install.
--
-- This migration is IDEMPOTENT (every statement uses IF NOT EXISTS
-- or ADD COLUMN IF NOT EXISTS) so it is safe to re-run and safe to
-- apply on an existing prod database that already has these tables.
-- ============================================================

-- ---- AI Companion --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_companions (
  discord_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Nova',
  persona TEXT NOT NULL DEFAULT 'friendly and witty',
  tone TEXT NOT NULL DEFAULT 'casual',
  emoji TEXT NOT NULL DEFAULT '✨',
  memory_notes TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'fr',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_companion_messages (
  id BIGSERIAL PRIMARY KEY,
  discord_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_companion_messages_owner ON public.ai_companion_messages(discord_id, created_at DESC);

-- ---- Battle Pass ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.battle_pass_seasons (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🎫',
  color INT NOT NULL DEFAULT 16168238,
  xp_per_tier INT NOT NULL DEFAULT 500,
  tier_count INT NOT NULL DEFAULT 30,
  premium_price_pulse INT NOT NULL DEFAULT 500,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.battle_pass_tiers (
  id BIGSERIAL PRIMARY KEY,
  season_id BIGINT NOT NULL REFERENCES public.battle_pass_seasons(id) ON DELETE CASCADE,
  tier_number INT NOT NULL,
  free_reward_kind TEXT NOT NULL DEFAULT 'pulse',
  free_reward_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  free_reward_label TEXT NOT NULL DEFAULT '',
  premium_reward_kind TEXT NOT NULL DEFAULT 'pulse',
  premium_reward_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  premium_reward_label TEXT NOT NULL DEFAULT '',
  UNIQUE (season_id, tier_number)
);

CREATE TABLE IF NOT EXISTS public.battle_pass_progress (
  discord_id TEXT NOT NULL,
  season_id BIGINT NOT NULL REFERENCES public.battle_pass_seasons(id) ON DELETE CASCADE,
  xp INT NOT NULL DEFAULT 0,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  claimed_free INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  claimed_premium INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_id, season_id)
);

-- ---- Cosmetics ledger (non-PULSE BP grants) ------------------------
CREATE TABLE IF NOT EXISTS public.member_owned_cosmetics (
  discord_id TEXT NOT NULL,
  cosmetic_key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'battle_pass',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_equipped BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (discord_id, cosmetic_key)
);

CREATE TABLE IF NOT EXISTS public.reward_grants_ledger (
  id BIGSERIAL PRIMARY KEY,
  discord_id TEXT NOT NULL,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Pets ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pets (
  id BIGSERIAL PRIMARY KEY,
  discord_id TEXT NOT NULL,
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🐣',
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  hunger INT NOT NULL DEFAULT 80,
  happiness INT NOT NULL DEFAULT 80,
  energy INT NOT NULL DEFAULT 80,
  health INT NOT NULL DEFAULT 100,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  last_fed_at TIMESTAMPTZ,
  last_played_at TIMESTAMPTZ,
  last_trained_at TIMESTAMPTZ,
  last_battle_at TIMESTAMPTZ,
  last_ticked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  equipped_skin_id BIGINT
);
CREATE INDEX IF NOT EXISTS idx_pets_owner_active ON public.pets(discord_id, is_active);

CREATE TABLE IF NOT EXISTS public.pet_battles (
  id BIGSERIAL PRIMARY KEY,
  attacker_pet_id BIGINT NOT NULL,
  defender_pet_id BIGINT NOT NULL,
  winner_pet_id BIGINT,
  pulse_wagered INT NOT NULL DEFAULT 0,
  log_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pet_battles_created ON public.pet_battles(created_at DESC);

CREATE TABLE IF NOT EXISTS public.pet_skins (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  emoji_override TEXT,
  aura_hex TEXT NOT NULL DEFAULT '#F5B62E',
  price_pulse INT NOT NULL DEFAULT 500,
  rarity TEXT NOT NULL DEFAULT 'common',
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.pet_skin_ownership (
  discord_id TEXT NOT NULL,
  skin_id BIGINT NOT NULL REFERENCES public.pet_skins(id) ON DELETE CASCADE,
  bought_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_id, skin_id)
);

-- ---- TCG (Trading Card Game) ---------------------------------------
CREATE TABLE IF NOT EXISTS public.tcg_cards (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🃏',
  rarity TEXT NOT NULL,
  attack INT NOT NULL DEFAULT 5,
  defense INT NOT NULL DEFAULT 5,
  speed INT NOT NULL DEFAULT 5,
  flavor TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  card_kind TEXT NOT NULL DEFAULT 'character',
  atk_bonus INT NOT NULL DEFAULT 0,
  def_bonus INT NOT NULL DEFAULT 0,
  spd_bonus INT NOT NULL DEFAULT 0,
  equipment_slot TEXT
);

CREATE TABLE IF NOT EXISTS public.tcg_collection (
  id BIGSERIAL PRIMARY KEY,
  discord_id TEXT NOT NULL,
  card_id BIGINT NOT NULL REFERENCES public.tcg_cards(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  first_opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  level INT NOT NULL DEFAULT 1,
  UNIQUE (discord_id, card_id, level)
);
CREATE INDEX IF NOT EXISTS idx_tcg_collection_owner ON public.tcg_collection(discord_id);

CREATE TABLE IF NOT EXISTS public.tcg_trades (
  id BIGSERIAL PRIMARY KEY,
  offerer_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  offerer_card_id BIGINT NOT NULL,
  receiver_card_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- ---- Marriages -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marriages (
  id BIGSERIAL PRIMARY KEY,
  member_a TEXT NOT NULL,
  member_b TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  wedding_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  UNIQUE (member_a, member_b)
);
CREATE INDEX IF NOT EXISTS idx_marriages_status ON public.marriages(status);

CREATE TABLE IF NOT EXISTS public.marriage_proposals (
  id BIGSERIAL PRIMARY KEY,
  proposer_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  ring_message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- ---- Guilds --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guilds (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL UNIQUE,
  emoji TEXT NOT NULL DEFAULT '🏰',
  motto TEXT NOT NULL DEFAULT '',
  leader_id TEXT NOT NULL,
  total_xp BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guild_members (
  discord_id TEXT PRIMARY KEY,
  guild_id BIGINT NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  xp_contributed INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON public.guild_members(guild_id);

-- ---- Bank / Loans --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  discord_id TEXT PRIMARY KEY,
  savings INT NOT NULL DEFAULT 0,
  last_interest_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loans (
  id BIGSERIAL PRIMARY KEY,
  lender_id TEXT NOT NULL,
  borrower_id TEXT NOT NULL,
  principal INT NOT NULL,
  interest_percent INT NOT NULL DEFAULT 5,
  due_at TIMESTAMPTZ NOT NULL,
  repaid_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loans_borrower_status ON public.loans(borrower_id, status);

-- ---- Calendar / server events --------------------------------------
CREATE TABLE IF NOT EXISTS public.server_events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  location TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  channel_id TEXT,
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_server_events_starts ON public.server_events(starts_at);

CREATE TABLE IF NOT EXISTS public.server_event_rsvps (
  event_id BIGINT NOT NULL REFERENCES public.server_events(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'going',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, discord_id)
);

-- ---- Treasure hunts, Sagas, Birthdays ------------------------------
CREATE TABLE IF NOT EXISTS public.treasure_hunts (
  id BIGSERIAL PRIMARY KEY,
  clue TEXT NOT NULL,
  answer TEXT NOT NULL,
  reward_pulse INT NOT NULL DEFAULT 500,
  channel_id TEXT,
  created_by TEXT NOT NULL,
  winner_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  solved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_treasure_hunts_status ON public.treasure_hunts(status);

CREATE TABLE IF NOT EXISTS public.sagas (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  intro TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reward_pulse INT NOT NULL DEFAULT 1000,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  chapters_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saga_progress (
  saga_id BIGINT NOT NULL REFERENCES public.sagas(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  chapters_completed INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  final_claimed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (saga_id, discord_id)
);

CREATE TABLE IF NOT EXISTS public.member_birthdays (
  discord_id TEXT PRIMARY KEY,
  birth_month INT NOT NULL,
  birth_day INT NOT NULL,
  last_celebrated_year INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.weekly_analytics (
  week_starts_at TIMESTAMPTZ PRIMARY KEY,
  report_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_to_lord BOOLEAN NOT NULL DEFAULT false
);

-- ---- Push notifications --------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  discord_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner ON public.push_subscriptions(discord_id);

CREATE TABLE IF NOT EXISTS public.push_queue (
  id BIGSERIAL PRIMARY KEY,
  discord_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '/app',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_push_queue_status ON public.push_queue(status, created_at);

-- ---- Streaming -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stream_links (
  discord_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  external_id TEXT,
  last_live_key TEXT,
  last_live_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (discord_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_stream_links_platform ON public.stream_links(platform);

CREATE TABLE IF NOT EXISTS public.live_stream_sessions (
  id BIGSERIAL PRIMARY KEY,
  discord_id TEXT NOT NULL,
  source TEXT NOT NULL,
  channel_id TEXT,
  external_url TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  reward_pulse INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_live_sessions_owner ON public.live_stream_sessions(discord_id, started_at DESC);

-- ---- Enable RLS on every table above so a stray anon key can't read
-- ---- through the default policies of setup_complete.sql that grant
-- ---- USING (true) to any authenticated user. Real access happens
-- ---- through the service_role client only.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_companions','ai_companion_messages',
    'battle_pass_seasons','battle_pass_tiers','battle_pass_progress',
    'member_owned_cosmetics','reward_grants_ledger',
    'pets','pet_battles','pet_skins','pet_skin_ownership',
    'tcg_cards','tcg_collection','tcg_trades',
    'marriages','marriage_proposals',
    'guilds','guild_members',
    'bank_accounts','loans',
    'server_events','server_event_rsvps',
    'treasure_hunts','sagas','saga_progress',
    'member_birthdays','weekly_analytics',
    'push_subscriptions','push_queue',
    'stream_links','live_stream_sessions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- service_role bypass so the bot / dashboard can still read+write.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t || '_service', t);
  END LOOP;
END $$;
