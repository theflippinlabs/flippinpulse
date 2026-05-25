-- ============================================================
-- PULSE ENGINE — MULTI-TENANT SCHEMA (Pro / multi-server)
-- ============================================================
-- Every per-server table carries a guild_id so ONE bot instance can
-- serve many Discord servers with fully isolated data (balances,
-- settings, shop, games, quizzes…). Idempotent (safe to re-run).
--
-- This is a NEW schema for the Pro version. Do NOT run it on the
-- single-server production database without the migration steps in
-- MULTI_SERVER.md (it changes keys/constraints).
-- ============================================================

SET check_function_bodies = off;

-- ---------- enums & helper functions ----------
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.shop_item_category AS ENUM ('role', 'perk', 'ticket', 'cosmetic', 'irl'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pulse_tx_type AS ENUM ('EARN_MISSION','EARN_VOICE','EARN_EVENT','ADMIN_GRANT','ADMIN_REVOKE','SPEND_SHOP','REFUND'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.order_status AS ENUM ('PENDING','APPROVED','REJECTED','FULFILLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.game_session_status AS ENUM ('waiting','active','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.giveaway_status AS ENUM ('active','ended','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.mod_action_type AS ENUM ('warn','mute','unmute','kick','ban','unban','clear','automod'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- ---------- guild registry (the servers using the bot) ----------
CREATE TABLE IF NOT EXISTS public.guilds (
  guild_id TEXT PRIMARY KEY,
  name TEXT,
  owner_discord_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',          -- e.g. free / pro — for your billing
  is_active BOOLEAN NOT NULL DEFAULT true,    -- flip off to disable a customer
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.guilds ENABLE ROW LEVEL SECURITY;

-- ---------- members & activity ----------
CREATE TABLE IF NOT EXISTS public.discord_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_id)
);
ALTER TABLE public.discord_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  type TEXT NOT NULL, channel_id TEXT,
  metadata_json JSONB DEFAULT '{}',
  points_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_guild_user ON public.activity_events (guild_id, discord_id, created_at DESC);
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- ---------- missions ----------
CREATE TABLE IF NOT EXISTS public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'daily',
  title TEXT NOT NULL, description TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at TIMESTAMPTZ NOT NULL,
  reward_points INTEGER NOT NULL DEFAULT 10,
  rules_json JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_missions_guild ON public.missions (guild_id, is_active);
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.mission_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  proof_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mission_completions ENABLE ROW LEVEL SECURITY;

-- ---------- ranks & settings (per guild) ----------
CREATE TABLE IF NOT EXISTS public.roles_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  rank_name TEXT NOT NULL,
  threshold INTEGER NOT NULL DEFAULT 0,
  discord_role_id TEXT,
  color TEXT DEFAULT '#00d4ff',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (guild_id, rank_name)
);
ALTER TABLE public.roles_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.settings (
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (guild_id, key)
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  admin_discord_id TEXT, admin_user_id UUID,
  action TEXT NOT NULL, target_discord_id TEXT,
  payload_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ---------- shop, wallet, transactions ----------
CREATE TABLE IF NOT EXISTS public.shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_shop_guild ON public.shop_items (guild_id, is_active);
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pulse_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  type pulse_tx_type NOT NULL,
  amount INTEGER NOT NULL, reason TEXT, ref_id TEXT,
  balance_after INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tx_guild_user ON public.pulse_transactions (guild_id, discord_id, created_at DESC);
ALTER TABLE public.pulse_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
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
  guild_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ, is_active BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;

-- ---------- games ----------
CREATE TABLE IF NOT EXISTS public.games_config (
  guild_id TEXT NOT NULL,
  game_key TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, game_key)
);
ALTER TABLE public.games_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  game_key TEXT NOT NULL,
  channel_id TEXT, status public.game_session_status NOT NULL DEFAULT 'waiting',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_guild ON public.game_sessions (guild_id, status);
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
  guild_id TEXT NOT NULL,
  question TEXT NOT NULL, choices_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_index INTEGER NOT NULL DEFAULT 0,
  difficulty TEXT NOT NULL DEFAULT 'medium', category TEXT NOT NULL DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quiz_guild ON public.quiz_questions (guild_id, is_active);
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_game_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  discord_id TEXT NOT NULL, limit_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, discord_id, limit_key)
);
ALTER TABLE public.user_game_limits ENABLE ROW LEVEL SECURITY;

-- ---------- engagement: reaction roles, giveaways ----------
CREATE TABLE IF NOT EXISTS public.reaction_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT NOT NULL,
  emoji TEXT NOT NULL, role_id TEXT NOT NULL, created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, message_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reaction_roles_message ON public.reaction_roles (message_id);
ALTER TABLE public.reaction_roles ENABLE ROW LEVEL SECURITY;

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

-- ---------- moderation ----------
CREATE TABLE IF NOT EXISTS public.mod_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL, type public.mod_action_type NOT NULL,
  target_discord_id TEXT, moderator_discord_id TEXT,
  reason TEXT, duration_seconds INTEGER, expires_at TIMESTAMPTZ,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mod_actions_target ON public.mod_actions (guild_id, target_discord_id, created_at DESC);
ALTER TABLE public.mod_actions ENABLE ROW LEVEL SECURITY;

-- ---------- lottery (per guild) ----------
CREATE TABLE IF NOT EXISTS public.lottery_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  pot_pulse INTEGER NOT NULL DEFAULT 0,
  ticket_price INTEGER NOT NULL DEFAULT 50,
  total_tickets INTEGER NOT NULL DEFAULT 0,
  draw_at TIMESTAMPTZ NOT NULL,
  winner_discord_id TEXT,
  drawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lottery_rounds_guild ON public.lottery_rounds (guild_id, status, draw_at);
ALTER TABLE public.lottery_rounds ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.lottery_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  round_id UUID NOT NULL REFERENCES public.lottery_rounds(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  tickets INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, discord_id)
);
CREATE INDEX IF NOT EXISTS idx_lottery_tickets_round ON public.lottery_tickets (round_id);
ALTER TABLE public.lottery_tickets ENABLE ROW LEVEL SECURITY;

-- ---------- updated_at triggers ----------
DROP TRIGGER IF EXISTS update_discord_users_updated_at ON public.discord_users;
CREATE TRIGGER update_discord_users_updated_at BEFORE UPDATE ON public.discord_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_shop_items_updated_at ON public.shop_items;
CREATE TRIGGER update_shop_items_updated_at BEFORE UPDATE ON public.shop_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_games_config_updated_at ON public.games_config;
CREATE TRIGGER update_games_config_updated_at BEFORE UPDATE ON public.games_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_guilds_updated_at ON public.guilds;
CREATE TRIGGER update_guilds_updated_at BEFORE UPDATE ON public.guilds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- seed_guild_defaults(): call this once per server (on guildCreate).
-- It installs default settings, ranks, games and starter content
-- for that guild only. Idempotent.
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_guild_defaults(p_guild_id TEXT)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.guilds (guild_id) VALUES (p_guild_id)
  ON CONFLICT (guild_id) DO NOTHING;

  INSERT INTO public.settings (guild_id, key, value_json) VALUES
    (p_guild_id, 'points_config', '{"message": 5, "reaction": 2, "voice_per_minute": 1, "invite": 5, "event": 20}'::jsonb),
    (p_guild_id, 'anti_spam', '{"message_cooldown_seconds": 10, "reaction_cooldown_seconds": 5}'::jsonb),
    (p_guild_id, 'economy', '{"pulse_per_point": 1, "daily_pulse_cap": 500}'::jsonb),
    (p_guild_id, 'decay', '{"enabled": false, "inactive_hours": 72, "decay_percent": 5, "min_points": 0, "notify": true}'::jsonb),
    (p_guild_id, 'pulse_hour', '{"enabled": false, "multiplier": 2, "duration_minutes": 60, "schedule": []}'::jsonb),
    (p_guild_id, 'welcome_config', '{"enabled": false, "channel_id": null, "embed_color": "#38BDF8", "title": "Welcome, {username}!", "description": "Every message, reaction and voice minute earns you PULSE. Type /profile to see your stats, /daily for a reward, and /shop to spend.", "show_member_count": true, "ping_user": true}'::jsonb),
    (p_guild_id, 'rank_up_config', '{"enabled": false, "channel_id": null, "ping_user": true}'::jsonb),
    (p_guild_id, 'streak_config', '{"enabled": true, "bonus_percent_per_day": 5, "max_bonus_percent": 50, "reset_after_hours": 48}'::jsonb),
    (p_guild_id, 'daily_cap_config', '{"enabled": false, "cap_pulse": 500}'::jsonb),
    (p_guild_id, 'mod_config', '{"mod_log_channel_id": null, "automod_enabled": false, "anti_spam": {"enabled": true, "max_messages": 5, "window_seconds": 5, "mute_seconds": 600}, "anti_mass_mentions": {"enabled": true, "max_mentions": 5, "action": "delete"}, "anti_invites": {"enabled": false, "action": "delete"}, "anti_links": {"enabled": false, "whitelist_domains": ["twitter.com", "x.com", "youtube.com", "youtu.be"]}, "anti_raid": {"enabled": false, "max_joins": 10, "window_seconds": 30, "lockdown_minutes": 10}, "auto_warn_threshold": 3}'::jsonb),
    (p_guild_id, 'lottery_config', '{"enabled": true, "ticket_price": 50, "draw_interval_hours": 24, "house_cut_percent": 0, "announce_channel_id": null, "seed_pot": 0}'::jsonb),
    (p_guild_id, 'auto_quiz', '{"enabled": false, "channel_id": null, "interval_hours": 6, "questions_per_round": 5, "seconds_per_question": 20, "reward_per_correct": 10, "category": null}'::jsonb)
  ON CONFLICT (guild_id, key) DO NOTHING;

  INSERT INTO public.roles_config (guild_id, rank_name, threshold, sort_order, color) VALUES
    (p_guild_id, 'Initiate', 0, 1, '#9ca3af'),
    (p_guild_id, 'Operator', 100, 2, '#3b82f6'),
    (p_guild_id, 'Elite', 500, 3, '#a855f7'),
    (p_guild_id, 'Shadow Core', 1500, 4, '#ef4444')
  ON CONFLICT (guild_id, rank_name) DO NOTHING;

  INSERT INTO public.games_config (guild_id, game_key, config_json, is_enabled) VALUES
    (p_guild_id, 'crash', '{"min_bet": 10, "max_bet": 500, "fee_percent": 5, "cooldown_seconds": 30, "crash_min": 1.1, "crash_max": 8.0}'::jsonb, true),
    (p_guild_id, 'duel', '{"min_bet": 5, "max_bet": 300, "fee_percent": 5, "cooldown_seconds": 15, "timeout_seconds": 60, "modes": ["coinflip", "dice"]}'::jsonb, true),
    (p_guild_id, 'quiz', '{"questions_per_round": 10, "time_per_question_seconds": 15, "cooldown_seconds": 120, "rewards": [50, 30, 15]}'::jsonb, true),
    (p_guild_id, 'treasure_drop', '{"min_reward": 5, "max_reward": 50, "max_claims_per_user_per_day": 3}'::jsonb, true),
    (p_guild_id, 'typing_race', '{"min_bet": 0, "max_bet": 200, "fixed_reward": 20, "cooldown_seconds": 60, "max_players": 10, "join_timeout_seconds": 30}'::jsonb, true),
    (p_guild_id, 'slots', '{"min_bet": 5, "max_bet": 500, "fee_percent": 0, "cooldown_seconds": 5, "symbols": ["🍒","🍋","🍊","🍇","⭐","💎","7️⃣"], "weights": [30,25,20,15,6,3,1], "payouts": {"three_seven": 50, "three_diamond": 20, "three_star": 10, "three_other": 5, "two_match": 1}}'::jsonb, true),
    (p_guild_id, 'roulette', '{"min_bet": 5, "max_bet": 500, "fee_percent": 0, "cooldown_seconds": 10, "even_money_payout": 2, "single_number_payout": 36}'::jsonb, true),
    (p_guild_id, 'blackjack', '{"min_bet": 10, "max_bet": 500, "fee_percent": 0, "cooldown_seconds": 15, "blackjack_payout_num": 3, "blackjack_payout_den": 2, "dealer_stand_min": 17}'::jsonb, true),
    (p_guild_id, 'rps', '{"min_bet": 5, "max_bet": 300, "fee_percent": 5, "cooldown_seconds": 10, "timeout_seconds": 60}'::jsonb, true),
    (p_guild_id, 'wheel', '{"min_bet": 10, "max_bet": 300, "fee_percent": 0, "cooldown_seconds": 10, "outcomes": [{"label": "💸 Bust", "multiplier": 0, "weight": 35}, {"label": "🪙 Common", "multiplier": 1, "weight": 30}, {"label": "🥉 Uncommon", "multiplier": 2, "weight": 20}, {"label": "🥈 Rare", "multiplier": 3, "weight": 10}, {"label": "🥇 Epic", "multiplier": 5, "weight": 4}, {"label": "💎 Legendary", "multiplier": 25, "weight": 1}]}'::jsonb, true),
    (p_guild_id, 'higherlower', '{"min_bet": 10, "max_bet": 500, "fee_percent": 5, "cooldown_seconds": 5, "max_rounds": 10}'::jsonb, true),
    (p_guild_id, 'battle_royale', '{"min_bet": 0, "max_bet": 1000, "fixed_reward": 50, "min_players": 2}'::jsonb, true),
    (p_guild_id, 'dice_royale', '{"min_bet": 0, "max_bet": 1000, "fixed_reward": 50, "min_players": 2}'::jsonb, true)
  ON CONFLICT (guild_id, game_key) DO NOTHING;

  -- starter daily mission
  INSERT INTO public.missions (guild_id, type, title, description, reward_points, end_at, is_active)
  SELECT p_guild_id, 'daily', 'Daily check-in', 'Claim your daily PULSE reward.', 15, now() + interval '365 days', true
  WHERE NOT EXISTS (SELECT 1 FROM public.missions WHERE guild_id = p_guild_id AND type = 'daily' AND is_active = true);

  -- starter quiz pack (cinema, music, Cronos, MainCity, community) — idempotent per question per guild
  INSERT INTO public.quiz_questions (guild_id, question, choices_json, correct_index, category)
  SELECT p_guild_id, v.question, v.choices_json::jsonb, v.correct_index, v.category
  FROM (VALUES
    ('What is the name of this server''s currency?', '["PULSE","Coins","Gems","Credits"]', 0, 'community'),
    ('Which command shows your PULSE balance?', '["/balance","/wallet","/money","/cash"]', 0, 'community'),
    ('How do you earn PULSE automatically?', '["By being active (messages, reactions, voice)","By paying real money","Only by inviting friends","You cannot earn it"]', 0, 'community'),
    ('What is the name of this community bot?', '["MEE6","Pulse Engine","Dyno","Carl-bot"]', 1, 'community'),
    ('Who directed the 1975 film Jaws?', '["George Lucas","Steven Spielberg","Martin Scorsese","Ridley Scott"]', 1, 'cinema'),
    ('In The Matrix, which color pill does Neo take?', '["Blue","Green","Red","Yellow"]', 2, 'cinema'),
    ('Which actor played Jack in Titanic (1997)?', '["Brad Pitt","Tom Cruise","Leonardo DiCaprio","Johnny Depp"]', 2, 'cinema'),
    ('Who played the Joker in The Dark Knight (2008)?', '["Jared Leto","Heath Ledger","Joaquin Phoenix","Jack Nicholson"]', 1, 'cinema'),
    ('Which company created Mickey Mouse?', '["Disney","Pixar","Warner Bros","Universal"]', 0, 'cinema'),
    ('Which Pixar film features a clownfish?', '["Moana","Finding Nemo","Shark Tale","Coco"]', 1, 'cinema'),
    ('Which band performed Bohemian Rhapsody?', '["The Beatles","Queen","Led Zeppelin","Pink Floyd"]', 1, 'music'),
    ('Who is known as the King of Pop?', '["Elvis Presley","Prince","Michael Jackson","Freddie Mercury"]', 2, 'music'),
    ('How many strings does a standard guitar have?', '["4","5","6","7"]', 2, 'music'),
    ('What instrument has 88 keys?', '["Organ","Piano","Harp","Accordion"]', 1, 'music'),
    ('Smells Like Teen Spirit is a song by which band?', '["Pearl Jam","Green Day","Nirvana","Soundgarden"]', 2, 'music'),
    ('What does BPM measure in music?', '["Beats per minute","Bars per measure","Bass per minute","Beats per measure"]', 0, 'music'),
    ('Which company created the Cronos blockchain?', '["Binance","Coinbase","Crypto.com","Kraken"]', 2, 'cronos'),
    ('What is the native token of Cronos?', '["CRO","CRON","CNS","CRX"]', 0, 'cronos'),
    ('Cronos is compatible with which two ecosystems?', '["Solana and Polkadot","Ethereum (EVM) and Cosmos","Bitcoin and Litecoin","Tron and EOS"]', 1, 'cronos'),
    ('In which year did the Cronos mainnet beta go live?', '["2018","2020","2021","2024"]', 2, 'cronos'),
    ('Cronos is known for transaction fees of roughly how much?', '["About $0.001","About $1","About $10","About $50"]', 0, 'cronos'),
    ('In 2024 Cronos launched a zero-knowledge Layer 2 called?', '["Cronos zkEVM","Cronos Turbo","Cronos Lightning","Cronos Mini"]', 0, 'cronos'),
    ('On which blockchain is Loaded Lions: Mane City built?', '["Ethereum","Cronos","Solana","Polygon"]', 1, 'maincity'),
    ('What kind of game is Mane City?', '["A city-building tycoon simulator","A first-person shooter","A racing game","A card battler"]', 0, 'maincity'),
    ('Which company is behind Mane City?', '["Ubisoft","Crypto.com","EA","Riot Games"]', 1, 'maincity'),
    ('What are the main in-game resources in Mane City?', '["Gold and Diamonds","Wood and Stone","Food and Water","Oil and Gas"]', 0, 'maincity'),
    ('Which characters star in Mane City?', '["Bored Apes","Cool Cats","Loaded Lions and Cyber Cubs","Pudgy Penguins"]', 2, 'maincity'),
    ('In Mane City, players build and decorate their...', '["Mane Mansions","Space stations","Castles","Farms"]', 0, 'maincity')
  ) AS v(question, choices_json, correct_index, category)
  WHERE NOT EXISTS (SELECT 1 FROM public.quiz_questions q WHERE q.guild_id = p_guild_id AND q.question = v.question);
END $$;
