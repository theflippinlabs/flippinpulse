-- ============================================================
-- Phase 2.5: flip every per-user table's PK to include guild_id, so a
-- member of two Novarys-equipped servers has one row per server rather
-- than a shared row that leaks balances / pet / cosmetics / BP progress.
--
-- One FK (ai_companion_messages → ai_companions) depended on the old
-- global discord_id PK and gets dropped; the companion message service
-- enforces the relationship in code.
-- ============================================================

ALTER TABLE public.ai_companion_messages DROP CONSTRAINT IF EXISTS ai_companion_messages_discord_id_fkey;

ALTER TABLE public.ai_companions          DROP CONSTRAINT IF EXISTS ai_companions_pkey;
ALTER TABLE public.ai_companions          ADD PRIMARY KEY (discord_id, guild_id);

ALTER TABLE public.bank_accounts          DROP CONSTRAINT IF EXISTS bank_accounts_pkey;
ALTER TABLE public.bank_accounts          ADD PRIMARY KEY (discord_id, guild_id);

ALTER TABLE public.member_birthdays       DROP CONSTRAINT IF EXISTS member_birthdays_pkey;
ALTER TABLE public.member_birthdays       ADD PRIMARY KEY (discord_id, guild_id);

ALTER TABLE public.user_cosmetics         DROP CONSTRAINT IF EXISTS user_cosmetics_pkey;
ALTER TABLE public.user_cosmetics         ADD PRIMARY KEY (discord_id, guild_id);

ALTER TABLE public.member_owned_cosmetics DROP CONSTRAINT IF EXISTS member_owned_cosmetics_pkey;
ALTER TABLE public.member_owned_cosmetics ADD PRIMARY KEY (discord_id, guild_id, cosmetic_key);

ALTER TABLE public.pet_skin_ownership     DROP CONSTRAINT IF EXISTS pet_skin_ownership_pkey;
ALTER TABLE public.pet_skin_ownership     ADD PRIMARY KEY (discord_id, guild_id, skin_id);

ALTER TABLE public.battle_pass_progress   DROP CONSTRAINT IF EXISTS battle_pass_progress_pkey;
ALTER TABLE public.battle_pass_progress   ADD PRIMARY KEY (discord_id, guild_id, season_id);
