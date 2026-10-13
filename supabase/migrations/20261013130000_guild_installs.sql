-- ============================================================
-- Guild installs — one row per Discord server where Novarys is installed.
--
-- Written by bot/src/events/guildCreate.ts right after the bot joins.
-- The dashboard reads this to:
--   - list the guilds a logged-in Lord can manage,
--   - decide whether a given guild has an active install,
--   - show "installed on" cards in the admin UI.
--
-- `subscriptions.guild_id` is still the source of truth for billing status;
-- this table only tracks the Discord install side.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.guild_installs (
  guild_id      TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL,
  guild_name    TEXT,
  guild_icon    TEXT,
  member_count  INT,
  installed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS guild_installs_owner_idx ON public.guild_installs(owner_id);
CREATE INDEX IF NOT EXISTS guild_installs_active_idx ON public.guild_installs(is_active);

ALTER TABLE public.guild_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY guild_installs_service_role ON public.guild_installs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
