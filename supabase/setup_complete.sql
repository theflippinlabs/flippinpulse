-- ============================================================
-- FLIPPIN PULSE — FULL SETUP (from scratch)
-- ============================================================
-- Run this ONCE in the Supabase SQL Editor. It is idempotent
-- (safe to re-run). It creates every table the bot needs, seeds
-- defaults, and enables welcome / rank-up / automod / pulse_hour.
-- Decay and daily cap stay OFF.
-- ============================================================

-- ---------- PART 0: types & helper functions ----------
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN INSERT INTO public.profiles (user_id, username) VALUES (NEW.id, NEW.raw_user_meta_data->>'username'); RETURN NEW; END; $$;

-- ---------- PART 1: base tables ----------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  username TEXT, avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.discord_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  avatar_url TEXT,
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  points_total INTEGER NOT NULL DEFAULT 0,
  points_week INTEGER NOT NULL DEFAULT 0,
  points_month INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  rank_name TEXT DEFAULT 'Initiate',
  balance_pulse INTEGER NOT NULL DEFAULT 0,
  lifetime_earned_pulse INTEGER NOT NULL DEFAULT 0,
  lifetime_spent_pulse INTEGER NOT NULL DEFAULT 0,
  last_daily_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.discord_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL REFERENCES public.discord_users(discord_id) ON DELETE CASCADE,
  type TEXT NOT NULL, channel_id TEXT,
  metadata_json JSONB DEFAULT '{}',
  points_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'daily',
  title TEXT NOT NULL, description TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at TIMESTAMPTZ NOT NULL,
  reward_points INTEGER NOT NULL DEFAULT 10,
  rules_json JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.mission_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL REFERENCES public.discord_users(discord_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  proof_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mission_completions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.roles_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_name TEXT NOT NULL UNIQUE,
  threshold INTEGER NOT NULL DEFAULT 0,
  discord_role_id TEXT,
  color TEXT DEFAULT '#00d4ff',
  sort_order INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.roles_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_discord_id TEXT, admin_user_id UUID,
  action TEXT NOT NULL, target_discord_id TEXT,
  payload_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ---------- PART 2: wallet, shop, transactions ----------
DO $$ BEGIN CREATE TYPE public.shop_item_category AS ENUM ('role', 'perk', 'ticket', 'cosmetic', 'irl'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pulse_tx_type AS ENUM ('EARN_MISSION','EARN_VOICE','EARN_EVENT','ADMIN_GRANT','ADMIN_REVOKE','SPEND_SHOP','REFUND'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.order_status AS ENUM ('PENDING','APPROVED','REJECTED','FULFILLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  category shop_item_category NOT NULL DEFAULT 'perk',
  price_pulse INTEGER NOT NULL DEFAULT 0,
  stock_total INTEGER, stock_remaining INTEGER,
  max_per_user INTEGER DEFAULT 1, cooldown_hours INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_limited_drop BOOLEAN NOT NULL DEFAULT false,
  available_from TIMESTAMPTZ, available_until TIMESTAMPTZ,
  image_url TEXT, metadata_json JSONB DEFAULT '{}',
  auto_apply BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pulse_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  type pulse_tx_type NOT NULL,
  amount INTEGER NOT NULL, reason TEXT, ref_id TEXT,
  balance_after INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pulse_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  status order_status NOT NULL DEFAULT 'PENDING',
  notes TEXT, admin_notes TEXT,
  pulse_spent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ, is_active BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;

-- ---------- PART 3: games ----------
DO $$ BEGIN CREATE TYPE public.game_session_status AS ENUM ('waiting','active','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.games_config (
  game_key TEXT PRIMARY KEY,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.games_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_key TEXT NOT NULL REFERENCES public.games_config(game_key),
  channel_id TEXT, status public.game_session_status NOT NULL DEFAULT 'waiting',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  bet_amount INTEGER NOT NULL DEFAULT 0, payout INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  outcome_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL, choices_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_index INTEGER NOT NULL DEFAULT 0,
  difficulty TEXT NOT NULL DEFAULT 'medium', category TEXT NOT NULL DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_game_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL, limit_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(discord_id, limit_key)
);
ALTER TABLE public.user_game_limits ENABLE ROW LEVEL SECURITY;

-- ---------- PART 4: engagement (reaction roles, giveaways) ----------
CREATE TABLE IF NOT EXISTS public.reaction_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT NOT NULL,
  emoji TEXT NOT NULL, role_id TEXT NOT NULL, created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reaction_roles_message ON public.reaction_roles (message_id);
ALTER TABLE public.reaction_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE TYPE public.giveaway_status AS ENUM ('active','ended','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.giveaways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT,
  host_discord_id TEXT NOT NULL, prize TEXT NOT NULL,
  winners_count INTEGER NOT NULL DEFAULT 1, end_at TIMESTAMPTZ NOT NULL,
  status public.giveaway_status NOT NULL DEFAULT 'active',
  winner_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_giveaways_status_end ON public.giveaways (status, end_at);
ALTER TABLE public.giveaways ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.giveaway_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id UUID NOT NULL REFERENCES public.giveaways(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL, entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (giveaway_id, discord_id)
);
CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway ON public.giveaway_entries (giveaway_id);
ALTER TABLE public.giveaway_entries ENABLE ROW LEVEL SECURITY;

-- ---------- PART 5: moderation ----------
DO $$ BEGIN CREATE TYPE public.mod_action_type AS ENUM ('warn','mute','unmute','kick','ban','unban','clear','automod'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.mod_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL, type public.mod_action_type NOT NULL,
  target_discord_id TEXT, moderator_discord_id TEXT,
  reason TEXT, duration_seconds INTEGER, expires_at TIMESTAMPTZ,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mod_actions_target ON public.mod_actions (target_discord_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_guild ON public.mod_actions (guild_id, created_at DESC);
ALTER TABLE public.mod_actions ENABLE ROW LEVEL SECURITY;

-- ---------- PART 6: RLS policies (admins manage, authenticated view) ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'discord_users','activity_events','missions','mission_completions','roles_config',
    'settings','audit_logs','shop_items','pulse_transactions','orders','user_purchases',
    'games_config','game_sessions','game_players','game_results','quiz_questions',
    'user_game_limits','reaction_roles','giveaways','giveaway_entries','mod_actions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin_all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_view" ON public.%I', t);
    EXECUTE format('CREATE POLICY "admin_all" ON public.%I FOR ALL USING (public.has_role(auth.uid(), ''admin''))', t);
    EXECUTE format('CREATE POLICY "auth_view" ON public.%I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_roles_admin" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ---------- PART 7: triggers ----------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
DROP TRIGGER IF EXISTS update_discord_users_updated_at ON public.discord_users;
CREATE TRIGGER update_discord_users_updated_at BEFORE UPDATE ON public.discord_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_shop_items_updated_at ON public.shop_items;
CREATE TRIGGER update_shop_items_updated_at BEFORE UPDATE ON public.shop_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_games_config_updated_at ON public.games_config;
CREATE TRIGGER update_games_config_updated_at BEFORE UPDATE ON public.games_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- PART 8: seed defaults ----------
INSERT INTO public.settings (key, value_json) VALUES
  ('points_config', '{"message": 5, "reaction": 2, "voice_per_minute": 1, "invite": 5, "event": 20}'::jsonb),
  ('anti_spam', '{"message_cooldown_seconds": 10, "reaction_cooldown_seconds": 5}'::jsonb),
  ('economy', '{"pulse_per_point": 1, "daily_pulse_cap": 500}'::jsonb),
  ('decay', '{"enabled": true, "inactive_hours": 72, "decay_percent": 5, "min_points": 0, "notify": true}'::jsonb),
  ('pulse_hour', '{"enabled": true, "multiplier": 2, "duration_minutes": 60, "schedule": [{"day": 3, "hour": 20}, {"day": 6, "hour": 20}]}'::jsonb),
  ('flash_missions', '{"enabled": true, "frequency_hours_min": 6, "frequency_hours_max": 12}'::jsonb),
  ('welcome_config', '{"enabled": false, "channel_id": null, "embed_color": "#38BDF8", "title": "Welcome to the pulse, {username}!", "description": "You just joined a server where every message, reaction and voice minute earns you PULSE. Type `/profile` to see your stats, `/daily` to claim your first reward, and `/shop` to spend what you earn.", "show_member_count": true, "ping_user": true}'::jsonb),
  ('rank_up_config', '{"enabled": false, "channel_id": null, "ping_user": true}'::jsonb),
  ('streak_config', '{"enabled": true, "bonus_percent_per_day": 5, "max_bonus_percent": 50, "reset_after_hours": 48}'::jsonb),
  ('daily_cap_config', '{"enabled": false, "cap_pulse": 500}'::jsonb),
  ('mod_config', '{"mod_log_channel_id": null, "automod_enabled": false, "anti_spam": {"enabled": true, "max_messages": 5, "window_seconds": 5, "mute_seconds": 600}, "anti_mass_mentions": {"enabled": true, "max_mentions": 5, "action": "delete"}, "anti_invites": {"enabled": false, "action": "delete"}, "anti_links": {"enabled": false, "whitelist_domains": ["twitter.com", "x.com", "youtube.com", "youtu.be"]}, "anti_raid": {"enabled": false, "max_joins": 10, "window_seconds": 30, "lockdown_minutes": 10}, "auto_warn_threshold": 3}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.roles_config (rank_name, threshold, sort_order, color) VALUES
  ('Initiate', 0, 1, '#9ca3af'),
  ('Operator', 100, 2, '#3b82f6'),
  ('Elite', 500, 3, '#a855f7'),
  ('Shadow Core', 1500, 4, '#ef4444')
ON CONFLICT (rank_name) DO NOTHING;

INSERT INTO public.games_config (game_key, config_json, is_enabled) VALUES
  ('crash', '{"min_bet": 10, "max_bet": 500, "fee_percent": 5, "cooldown_seconds": 30, "crash_min": 1.1, "crash_max": 8.0}'::jsonb, true),
  ('duel', '{"min_bet": 5, "max_bet": 300, "fee_percent": 5, "cooldown_seconds": 15, "timeout_seconds": 60, "modes": ["coinflip", "dice"]}'::jsonb, true),
  ('quiz', '{"questions_per_round": 10, "time_per_question_seconds": 15, "cooldown_seconds": 120, "rewards": [50, 30, 15]}'::jsonb, true),
  ('treasure_drop', '{"min_reward": 5, "max_reward": 50, "max_claims_per_user_per_day": 3}'::jsonb, true),
  ('typing_race', '{"min_bet": 0, "max_bet": 200, "fixed_reward": 20, "cooldown_seconds": 60, "max_players": 10, "join_timeout_seconds": 30}'::jsonb, true),
  ('slots', '{"min_bet": 5, "max_bet": 500, "fee_percent": 0, "cooldown_seconds": 5, "symbols": ["🍒", "🍋", "🍊", "🍇", "⭐", "💎", "7️⃣"], "weights": [30, 25, 20, 15, 6, 3, 1], "payouts": {"three_seven": 50, "three_diamond": 20, "three_star": 10, "three_other": 5, "two_match": 1}}'::jsonb, true),
  ('roulette', '{"min_bet": 5, "max_bet": 500, "fee_percent": 0, "cooldown_seconds": 10, "even_money_payout": 2, "single_number_payout": 36}'::jsonb, true),
  ('blackjack', '{"min_bet": 10, "max_bet": 500, "fee_percent": 0, "cooldown_seconds": 15, "blackjack_payout_num": 3, "blackjack_payout_den": 2, "dealer_stand_min": 17}'::jsonb, true),
  ('rps', '{"min_bet": 5, "max_bet": 300, "fee_percent": 5, "cooldown_seconds": 10, "timeout_seconds": 60}'::jsonb, true),
  ('wheel', '{"min_bet": 10, "max_bet": 300, "fee_percent": 0, "cooldown_seconds": 10, "outcomes": [{"label": "💸 Bust", "multiplier": 0, "weight": 35, "color": "#6B7280"}, {"label": "🪙 Common", "multiplier": 1, "weight": 30, "color": "#9CA3AF"}, {"label": "🥉 Uncommon", "multiplier": 2, "weight": 20, "color": "#22C55E"}, {"label": "🥈 Rare", "multiplier": 3, "weight": 10, "color": "#3B82F6"}, {"label": "🥇 Epic", "multiplier": 5, "weight": 4, "color": "#A855F7"}, {"label": "💎 Legendary", "multiplier": 25, "weight": 1, "color": "#F59E0B"}]}'::jsonb, true)
ON CONFLICT (game_key) DO NOTHING;

-- A starter daily mission so /daily works immediately (valid 1 year)
INSERT INTO public.missions (type, title, description, reward_points, end_at, is_active)
SELECT 'daily', 'Daily check-in', 'Claim your daily PULSE reward.', 15, now() + interval '365 days', true
WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE type = 'daily' AND is_active = true);

-- ---------- PART 9: ACTIVATE features (decay & cap stay OFF) ----------
UPDATE public.settings SET value_json = jsonb_set(value_json, '{enabled}', 'true'::jsonb) WHERE key = 'welcome_config';
UPDATE public.settings SET value_json = jsonb_set(value_json, '{enabled}', 'true'::jsonb) WHERE key = 'rank_up_config';
UPDATE public.settings SET value_json = jsonb_set(value_json, '{automod_enabled}', 'true'::jsonb) WHERE key = 'mod_config';
UPDATE public.settings SET value_json = jsonb_set(value_json, '{enabled}', 'true'::jsonb) WHERE key = 'pulse_hour';
UPDATE public.settings SET value_json = jsonb_set(value_json, '{enabled}', 'false'::jsonb) WHERE key = 'decay';
UPDATE public.settings SET value_json = jsonb_set(value_json, '{enabled}', 'false'::jsonb) WHERE key = 'daily_cap_config';

-- ---------- VERIFY ----------
SELECT 'Tables created' AS check, count(*) AS n
FROM information_schema.tables WHERE table_schema = 'public';
