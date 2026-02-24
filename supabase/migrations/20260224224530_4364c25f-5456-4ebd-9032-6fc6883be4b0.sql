
-- Enum for user roles/ranks
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Profiles table for dashboard users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  username TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Discord members (bot-tracked users)
CREATE TABLE public.discord_users (
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.discord_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage discord users" ON public.discord_users FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view discord users" ON public.discord_users FOR SELECT TO authenticated USING (true);

-- Activity events
CREATE TABLE public.activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL REFERENCES public.discord_users(discord_id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'message', 'reaction', 'voice', 'event', 'invite'
  channel_id TEXT,
  metadata_json JSONB DEFAULT '{}',
  points_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage activity events" ON public.activity_events FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view activity events" ON public.activity_events FOR SELECT TO authenticated USING (true);

-- Missions
CREATE TABLE public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'daily', -- 'daily', 'weekly', 'flash'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at TIMESTAMPTZ NOT NULL,
  reward_points INTEGER NOT NULL DEFAULT 10,
  rules_json JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage missions" ON public.missions FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view missions" ON public.missions FOR SELECT TO authenticated USING (true);

-- Mission completions
CREATE TABLE public.mission_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL REFERENCES public.discord_users(discord_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'rejected'
  completed_at TIMESTAMPTZ,
  proof_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mission_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage completions" ON public.mission_completions FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view completions" ON public.mission_completions FOR SELECT TO authenticated USING (true);

-- Roles config (dynamic Discord roles thresholds)
CREATE TABLE public.roles_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_name TEXT NOT NULL UNIQUE,
  threshold INTEGER NOT NULL DEFAULT 0,
  discord_role_id TEXT,
  color TEXT DEFAULT '#00d4ff',
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.roles_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage roles config" ON public.roles_config FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view roles config" ON public.roles_config FOR SELECT TO authenticated USING (true);

-- Settings (key-value store)
CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage settings" ON public.settings FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view settings" ON public.settings FOR SELECT TO authenticated USING (true);

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_discord_id TEXT,
  admin_user_id UUID,
  action TEXT NOT NULL,
  target_discord_id TEXT,
  payload_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage audit logs" ON public.audit_logs FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (true);

-- Insert default settings
INSERT INTO public.settings (key, value_json) VALUES
  ('points_config', '{"message": 5, "reaction": 2, "voice_per_minute": 1, "mission_bonus": 10, "event_bonus": 20}'),
  ('anti_spam', '{"min_message_length": 6, "max_points_per_minute": 15, "blacklisted_channels": []}'),
  ('decay', '{"enabled": true, "inactive_hours": 72, "decay_percent": 5, "min_points": 0, "notify": true}'),
  ('pulse_hour', '{"enabled": true, "multiplier": 2, "duration_minutes": 60, "schedule": [{"day": 3, "hour": 20}, {"day": 6, "hour": 20}]}'),
  ('flash_missions', '{"enabled": true, "frequency_hours_min": 6, "frequency_hours_max": 12}');

-- Insert default roles config
INSERT INTO public.roles_config (rank_name, threshold, sort_order, color) VALUES
  ('Initiate', 0, 1, '#9ca3af'),
  ('Operator', 100, 2, '#3b82f6'),
  ('Elite', 500, 3, '#a855f7'),
  ('Shadow Core', 1500, 4, '#ef4444');

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_discord_users_updated_at
  BEFORE UPDATE ON public.discord_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
