-- ============================================================
-- Moderation actions log + automod settings
-- New games: slots, roulette, blackjack, rps, wheel
-- ============================================================

CREATE TYPE public.mod_action_type AS ENUM (
  'warn', 'mute', 'unmute', 'kick', 'ban', 'unban', 'clear', 'automod'
);

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
CREATE POLICY "Admins can manage mod actions" ON public.mod_actions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view mod actions" ON public.mod_actions
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Moderation config
-- ============================================================
INSERT INTO public.settings (key, value_json) VALUES
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

-- ============================================================
-- Game configs for 5 new games
-- ============================================================
INSERT INTO public.games_config (game_key, config_json, is_enabled) VALUES
  ('slots', '{
    "min_bet": 5,
    "max_bet": 500,
    "fee_percent": 0,
    "cooldown_seconds": 5,
    "symbols": ["🍒", "🍋", "🍊", "🍇", "⭐", "💎", "7️⃣"],
    "weights": [30, 25, 20, 15, 6, 3, 1],
    "payouts": {"three_seven": 50, "three_diamond": 20, "three_star": 10, "three_other": 5, "two_match": 1}
  }'::jsonb, true),
  ('roulette', '{
    "min_bet": 5,
    "max_bet": 500,
    "fee_percent": 0,
    "cooldown_seconds": 10,
    "even_money_payout": 2,
    "single_number_payout": 36
  }'::jsonb, true),
  ('blackjack', '{
    "min_bet": 10,
    "max_bet": 500,
    "fee_percent": 0,
    "cooldown_seconds": 15,
    "blackjack_payout_num": 3,
    "blackjack_payout_den": 2,
    "dealer_stand_min": 17
  }'::jsonb, true),
  ('rps', '{
    "min_bet": 5,
    "max_bet": 300,
    "fee_percent": 5,
    "cooldown_seconds": 10,
    "timeout_seconds": 60
  }'::jsonb, true),
  ('wheel', '{
    "min_bet": 10,
    "max_bet": 300,
    "fee_percent": 0,
    "cooldown_seconds": 10,
    "outcomes": [
      {"label": "💸 Bust", "multiplier": 0, "weight": 35, "color": "#6B7280"},
      {"label": "🪙 Common", "multiplier": 1, "weight": 30, "color": "#9CA3AF"},
      {"label": "🥉 Uncommon", "multiplier": 2, "weight": 20, "color": "#22C55E"},
      {"label": "🥈 Rare", "multiplier": 3, "weight": 10, "color": "#3B82F6"},
      {"label": "🥇 Epic", "multiplier": 5, "weight": 4, "color": "#A855F7"},
      {"label": "💎 Legendary", "multiplier": 25, "weight": 1, "color": "#F59E0B"}
    ]
  }'::jsonb, true)
ON CONFLICT (game_key) DO NOTHING;
