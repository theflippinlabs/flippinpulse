-- Phase 2.5 follow-up: settings table needs the same (key, guild_id) PK
-- flip the other per-user tables already got. Without this, setSetting()
-- in bot/src/services/settings.ts upserts with onConflict = 'key' which
-- collides across guilds and in practice throws because the composite
-- scope conflict can't be resolved. /jail setup and /jail add both ride
-- through setSetting (jail_config) and were erroring.
--
-- Applied live via execute_sql on 2026-11-04.

ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE public.settings ADD PRIMARY KEY (key, guild_id);
