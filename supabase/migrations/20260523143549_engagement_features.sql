-- ============================================================
-- Engagement features: welcome, rank-up, reaction roles, giveaways,
-- streak tracking, daily PULSE cap, pulse hour.
-- ============================================================

-- Streak / last-daily tracking on discord_users.
ALTER TABLE public.discord_users
  ADD COLUMN IF NOT EXISTS last_daily_at TIMESTAMPTZ;

-- ============================================================
-- Reaction roles (emoji on message → assigns a Discord role)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reaction_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  emoji TEXT NOT NULL,                  -- unicode emoji OR custom emoji ID
  role_id TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reaction_roles_message ON public.reaction_roles (message_id);

ALTER TABLE public.reaction_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage reaction roles" ON public.reaction_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view reaction roles" ON public.reaction_roles
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Giveaways
-- ============================================================
CREATE TYPE public.giveaway_status AS ENUM ('active', 'ended', 'cancelled');

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
CREATE POLICY "Admins can manage giveaways" ON public.giveaways
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view giveaways" ON public.giveaways
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.giveaway_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id UUID NOT NULL REFERENCES public.giveaways(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (giveaway_id, discord_id)
);

CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway ON public.giveaway_entries (giveaway_id);

ALTER TABLE public.giveaway_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage giveaway entries" ON public.giveaway_entries
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view giveaway entries" ON public.giveaway_entries
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- New settings keys (welcome, rank_up, streak, daily_cap)
-- Decay is forced OFF (was ON by default).
-- ============================================================
INSERT INTO public.settings (key, value_json) VALUES
  ('welcome_config', '{"enabled": false, "channel_id": null, "embed_color": "#38BDF8", "title": "Welcome to the pulse, {username}!", "description": "You just joined a server where every message, reaction and voice minute earns you PULSE. Type `/profile` to see your stats, `/daily` to claim your first reward, and `/shop` to spend what you earn.", "show_member_count": true, "ping_user": true}'::jsonb),
  ('rank_up_config', '{"enabled": false, "channel_id": null, "ping_user": true}'::jsonb),
  ('streak_config', '{"enabled": true, "bonus_percent_per_day": 5, "max_bonus_percent": 50, "reset_after_hours": 48}'::jsonb),
  ('daily_cap_config', '{"enabled": false, "cap_pulse": 500}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Force decay disabled by default.
UPDATE public.settings
SET value_json = jsonb_set(value_json, '{enabled}', 'false'::jsonb)
WHERE key = 'decay';
