-- ============================================================
-- discord_users: flip the UNIQUE constraint from (discord_id) to
-- (discord_id, guild_id) so a member of several Novarys-equipped
-- servers has one row per server. Without this, upserts collide and
-- balances/XP leak across tenants.
--
-- Two FKs (activity_events, mission_completions) depended on the old
-- UNIQUE index; dropping them is safe because the app enforces the
-- relationship through code.
-- ============================================================

ALTER TABLE public.activity_events       DROP CONSTRAINT IF EXISTS activity_events_discord_id_fkey;
ALTER TABLE public.mission_completions   DROP CONSTRAINT IF EXISTS mission_completions_discord_id_fkey;

DO $$
DECLARE
  v_name TEXT;
BEGIN
  SELECT conname INTO v_name
    FROM pg_constraint
   WHERE conrelid = 'public.discord_users'::regclass
     AND contype  = 'u'
     AND conkey   = ARRAY[(
       SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.discord_users'::regclass
          AND attname  = 'discord_id'
     )];
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.discord_users DROP CONSTRAINT %I CASCADE', v_name);
  END IF;
END $$;

ALTER TABLE public.discord_users
  ADD CONSTRAINT discord_users_discord_id_guild_id_key UNIQUE (discord_id, guild_id);
