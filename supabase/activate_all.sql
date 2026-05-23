-- ============================================================
-- FLIPPIN PULSE — ACTIVATION SCRIPT
-- ============================================================
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).
-- It is idempotent: safe to run multiple times.
--
-- What this does:
--   1. Applies the two new migrations (engagement + moderation/games)
--   2. Enables welcome, rank-up, automod, pulse_hour
--   3. Leaves decay & daily_cap OFF (per your choice)
--   4. Leaves channel_id fields NULL (fill them in step 5)
--
-- After running, update the rows shown at the bottom with your real
-- Discord channel IDs (enable Developer Mode in Discord, right-click
-- a channel → Copy Channel ID).
-- ============================================================


-- ------------------------------------------------------------
-- PART 1: schema for engagement features
-- ------------------------------------------------------------

ALTER TABLE public.discord_users
  ADD COLUMN IF NOT EXISTS last_daily_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.reaction_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reaction_roles_message ON public.reaction_roles (message_id);
ALTER TABLE public.reaction_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE TYPE public.giveaway_status AS ENUM ('active', 'ended', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.giveaways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  host_discord_id TEXT NOT NULL,
  prize TEXT NOT NULL,
  winners_count INTEGER NOT NULL DEFAULT 1,
  end_at TIMESTAMPTZ NOT NULL,
  status public.giveaway_status NOT NULL DEFAULT 'active',
  winner_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_giveaways_status_end ON public.giveaways (status, end_at);
ALTER TABLE public.giveaways ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.giveaway_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id UUID NOT NULL REFERENCES public.giveaways(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (giveaway_id, discord_id)
);
CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway ON public.giveaway_entries (giveaway_id);
ALTER TABLE public.giveaway_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage reaction roles" ON public.reaction_roles;
DROP POLICY IF EXISTS "Authenticated can view reaction roles" ON public.reaction_roles;
CREATE POLICY "Admins can manage reaction roles" ON public.reaction_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view reaction roles" ON public.reaction_roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage giveaways" ON public.giveaways;
DROP POLICY IF EXISTS "Authenticated can view giveaways" ON public.giveaways;
CREATE POLICY "Admins can manage giveaways" ON public.giveaways
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view giveaways" ON public.giveaways
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage giveaway entries" ON public.giveaway_entries;
DROP POLICY IF EXISTS "Authenticated can view giveaway entries" ON public.giveaway_entries;
CREATE POLICY "Admins can manage giveaway entries" ON public.giveaway_entries
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view giveaway entries" ON public.giveaway_entries
  FOR SELECT TO authenticated USING (true);


-- ------------------------------------------------------------
-- PART 2: schema for moderation
-- ------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.mod_action_type AS ENUM (
    'warn', 'mute', 'unmute', 'kick', 'ban', 'unban', 'clear', 'automod'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.mod_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  type public.mod_action_type NOT NULL,
  target_discord_id TEXT,
  moderator_discord_id TEXT,
  reason TEXT,
  duration_seconds INTEGER,
  expires_at TIMESTAMPTZ,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mod_actions_target ON public.mod_actions (target_discord_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_guild ON public.mod_actions (guild_id, created_at DESC);
ALTER TABLE public.mod_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage mod actions" ON public.mod_actions;
DROP POLICY IF EXISTS "Authenticated can view mod actions" ON public.mod_actions;
CREATE POLICY "Admins can manage mod actions" ON public.mod_actions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view mod actions" ON public.mod_actions
  FOR SELECT TO authenticated USING (true);


-- ------------------------------------------------------------
-- PART 3: seed default settings (only if missing)
-- ------------------------------------------------------------

INSERT INTO public.settings (key, value_json) VALUES
  ('welcome_config', '{"enabled": false, "channel_id": null, "embed_color": "#38BDF8", "title": "Welcome to the pulse, {username}!", "description": "You just joined a server where every message, reaction and voice minute earns you PULSE. Type `/profile` to see your stats, `/daily` to claim your first reward, and `/shop` to spend what you earn.", "show_member_count": true, "ping_user": true}'::jsonb),
  ('rank_up_config', '{"enabled": false, "channel_id": null, "ping_user": true}'::jsonb),
  ('streak_config', '{"enabled": true, "bonus_percent_per_day": 5, "max_bonus_percent": 50, "reset_after_hours": 48}'::jsonb),
  ('daily_cap_config', '{"enabled": false, "cap_pulse": 500}'::jsonb),
  ('mod_config', '{
    "mod_log_channel_id": null,
    "automod_enabled": false,
    "anti_spam": {"enabled": true, "max_messages": 5, "window_seconds": 5, "mute_seconds": 600},
    "anti_mass_mentions": {"enabled": true, "max_mentions": 5, "action": "delete"},
    "anti_invites": {"enabled": false, "action": "delete"},
    "anti_links": {"enabled": false, "whitelist_domains": ["twitter.com", "x.com", "youtube.com", "youtu.be"]},
    "anti_raid": {"enabled": false, "max_joins": 10, "window_seconds": 30, "lockdown_minutes": 10},
    "auto_warn_threshold": 3
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.games_config (game_key, config_json, is_enabled) VALUES
  ('slots', '{"min_bet": 5, "max_bet": 500, "fee_percent": 0, "cooldown_seconds": 5, "symbols": ["🍒", "🍋", "🍊", "🍇", "⭐", "💎", "7️⃣"], "weights": [30, 25, 20, 15, 6, 3, 1], "payouts": {"three_seven": 50, "three_diamond": 20, "three_star": 10, "three_other": 5, "two_match": 1}}'::jsonb, true),
  ('roulette', '{"min_bet": 5, "max_bet": 500, "fee_percent": 0, "cooldown_seconds": 10, "even_money_payout": 2, "single_number_payout": 36}'::jsonb, true),
  ('blackjack', '{"min_bet": 10, "max_bet": 500, "fee_percent": 0, "cooldown_seconds": 15, "blackjack_payout_num": 3, "blackjack_payout_den": 2, "dealer_stand_min": 17}'::jsonb, true),
  ('rps', '{"min_bet": 5, "max_bet": 300, "fee_percent": 5, "cooldown_seconds": 10, "timeout_seconds": 60}'::jsonb, true),
  ('wheel', '{"min_bet": 10, "max_bet": 300, "fee_percent": 0, "cooldown_seconds": 10, "outcomes": [{"label": "💸 Bust", "multiplier": 0, "weight": 35, "color": "#6B7280"}, {"label": "🪙 Common", "multiplier": 1, "weight": 30, "color": "#9CA3AF"}, {"label": "🥉 Uncommon", "multiplier": 2, "weight": 20, "color": "#22C55E"}, {"label": "🥈 Rare", "multiplier": 3, "weight": 10, "color": "#3B82F6"}, {"label": "🥇 Epic", "multiplier": 5, "weight": 4, "color": "#A855F7"}, {"label": "💎 Legendary", "multiplier": 25, "weight": 1, "color": "#F59E0B"}]}'::jsonb, true)
ON CONFLICT (game_key) DO NOTHING;


-- ------------------------------------------------------------
-- PART 4: ACTIVATE features (decay & daily_cap stay OFF)
-- ------------------------------------------------------------

-- Welcome embed ON
UPDATE public.settings
SET value_json = jsonb_set(value_json, '{enabled}', 'true'::jsonb)
WHERE key = 'welcome_config';

-- Rank-up announcements ON
UPDATE public.settings
SET value_json = jsonb_set(value_json, '{enabled}', 'true'::jsonb)
WHERE key = 'rank_up_config';

-- Automod ON
UPDATE public.settings
SET value_json = jsonb_set(value_json, '{automod_enabled}', 'true'::jsonb)
WHERE key = 'mod_config';

-- Pulse hour ON (default schedule: Wed 20:00 UTC, Sat 20:00 UTC, ×2 for 60 min)
UPDATE public.settings
SET value_json = jsonb_set(value_json, '{enabled}', 'true'::jsonb)
WHERE key = 'pulse_hour';

-- Decay stays OFF (explicit)
UPDATE public.settings
SET value_json = jsonb_set(value_json, '{enabled}', 'false'::jsonb)
WHERE key = 'decay';

-- Daily cap stays OFF (explicit)
UPDATE public.settings
SET value_json = jsonb_set(value_json, '{enabled}', 'false'::jsonb)
WHERE key = 'daily_cap_config';


-- ------------------------------------------------------------
-- PART 5: PLUG IN YOUR CHANNEL IDs
-- ------------------------------------------------------------
-- Uncomment and replace the IDs below with the real ones from your
-- Discord server (Developer Mode → right-click channel → Copy Channel ID)
--
-- UPDATE public.settings
-- SET value_json = jsonb_set(value_json, '{channel_id}', to_jsonb('YOUR_WELCOME_CHANNEL_ID'::text))
-- WHERE key = 'welcome_config';
--
-- UPDATE public.settings
-- SET value_json = jsonb_set(value_json, '{channel_id}', to_jsonb('YOUR_RANK_UP_CHANNEL_ID'::text))
-- WHERE key = 'rank_up_config';
--
-- UPDATE public.settings
-- SET value_json = jsonb_set(value_json, '{mod_log_channel_id}', to_jsonb('YOUR_MOD_LOG_CHANNEL_ID'::text))
-- WHERE key = 'mod_config';


-- ------------------------------------------------------------
-- VERIFY
-- ------------------------------------------------------------
SELECT key, value_json FROM public.settings
WHERE key IN ('welcome_config', 'rank_up_config', 'mod_config', 'pulse_hour', 'decay', 'daily_cap_config', 'streak_config')
ORDER BY key;
