
-- Enum for game session status
CREATE TYPE public.game_session_status AS ENUM ('waiting', 'active', 'completed', 'cancelled');

-- Games configuration
CREATE TABLE public.games_config (
  game_key TEXT PRIMARY KEY,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Game sessions
CREATE TABLE public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_key TEXT NOT NULL REFERENCES public.games_config(game_key),
  channel_id TEXT,
  status public.game_session_status NOT NULL DEFAULT 'waiting',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Game players
CREATE TABLE public.game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  bet_amount INTEGER NOT NULL DEFAULT 0,
  payout INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Game results
CREATE TABLE public.game_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  outcome_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quiz questions bank
CREATE TABLE public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  choices_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_index INTEGER NOT NULL DEFAULT 0,
  difficulty TEXT NOT NULL DEFAULT 'medium',
  category TEXT NOT NULL DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User rate limits for games
CREATE TABLE public.user_game_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  limit_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(discord_id, limit_key)
);

-- Trigger for updated_at on games_config
CREATE TRIGGER update_games_config_updated_at
  BEFORE UPDATE ON public.games_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.games_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_game_limits ENABLE ROW LEVEL SECURITY;

-- Policies: admins manage all, authenticated can view
CREATE POLICY "Admins can manage games config" ON public.games_config FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view games config" ON public.games_config FOR SELECT USING (true);

CREATE POLICY "Admins can manage game sessions" ON public.game_sessions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view game sessions" ON public.game_sessions FOR SELECT USING (true);

CREATE POLICY "Admins can manage game players" ON public.game_players FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view game players" ON public.game_players FOR SELECT USING (true);

CREATE POLICY "Admins can manage game results" ON public.game_results FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view game results" ON public.game_results FOR SELECT USING (true);

CREATE POLICY "Admins can manage quiz questions" ON public.quiz_questions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view quiz questions" ON public.quiz_questions FOR SELECT USING (true);

CREATE POLICY "Admins can manage user game limits" ON public.user_game_limits FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view user game limits" ON public.user_game_limits FOR SELECT USING (true);

-- Seed default game configs
INSERT INTO public.games_config (game_key, config_json, is_enabled) VALUES
  ('crash', '{"min_bet": 10, "max_bet": 500, "fee_percent": 5, "cooldown_seconds": 30, "max_sessions_per_channel": 1, "crash_min": 1.1, "crash_max": 8.0}'::jsonb, true),
  ('duel', '{"min_bet": 5, "max_bet": 300, "fee_percent": 5, "cooldown_seconds": 15, "timeout_seconds": 60, "modes": ["coinflip", "dice"]}'::jsonb, true),
  ('quiz', '{"questions_per_round": 10, "time_per_question_seconds": 15, "cooldown_seconds": 120, "rewards": [50, 30, 15]}'::jsonb, true),
  ('treasure_drop', '{"min_reward": 5, "max_reward": 50, "drops_per_day_min": 2, "drops_per_day_max": 6, "max_claims_per_user_per_day": 3, "channels_whitelist": []}'::jsonb, true),
  ('typing_race', '{"min_bet": 0, "max_bet": 200, "fixed_reward": 20, "cooldown_seconds": 60, "max_players": 10, "join_timeout_seconds": 30}'::jsonb, true);
