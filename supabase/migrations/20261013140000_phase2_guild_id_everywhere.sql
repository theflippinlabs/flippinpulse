-- ============================================================
-- Phase 2 data isolation: add guild_id to the last few tables that
-- missed the earlier multi-tenancy migration, and backfill them.
--
-- Tables intentionally skipped (no cross-tenant risk):
--   audit_logs    — global admin audit trail
--   profiles      — Supabase auth table, not used by Novarys
--   stripe_events — webhook idempotency, keyed by Stripe event id
--   user_roles    — Supabase auth
--
-- After this migration every table that holds game data or
-- configuration carries a guild_id column. Enforcement with
-- NOT NULL + RLS lands in Phase 3.
-- ============================================================

ALTER TABLE public.games_config         ADD COLUMN IF NOT EXISTS guild_id TEXT;
ALTER TABLE public.game_sessions        ADD COLUMN IF NOT EXISTS guild_id TEXT;
ALTER TABLE public.game_players         ADD COLUMN IF NOT EXISTS guild_id TEXT;
ALTER TABLE public.game_results         ADD COLUMN IF NOT EXISTS guild_id TEXT;
ALTER TABLE public.giveaway_entries     ADD COLUMN IF NOT EXISTS guild_id TEXT;
ALTER TABLE public.tournament_matches   ADD COLUMN IF NOT EXISTS guild_id TEXT;
ALTER TABLE public.tournament_players   ADD COLUMN IF NOT EXISTS guild_id TEXT;
ALTER TABLE public.tcg_battles          ADD COLUMN IF NOT EXISTS guild_id TEXT;
ALTER TABLE public.tcg_slot_unlocks     ADD COLUMN IF NOT EXISTS guild_id TEXT;

CREATE INDEX IF NOT EXISTS games_config_guild_idx       ON public.games_config(guild_id);
CREATE INDEX IF NOT EXISTS game_sessions_guild_idx      ON public.game_sessions(guild_id);
CREATE INDEX IF NOT EXISTS game_players_guild_idx       ON public.game_players(guild_id);
CREATE INDEX IF NOT EXISTS game_results_guild_idx       ON public.game_results(guild_id);
CREATE INDEX IF NOT EXISTS giveaway_entries_guild_idx   ON public.giveaway_entries(guild_id);
CREATE INDEX IF NOT EXISTS tournament_matches_guild_idx ON public.tournament_matches(guild_id);
CREATE INDEX IF NOT EXISTS tournament_players_guild_idx ON public.tournament_players(guild_id);
CREATE INDEX IF NOT EXISTS tcg_battles_guild_idx        ON public.tcg_battles(guild_id);
CREATE INDEX IF NOT EXISTS tcg_slot_unlocks_guild_idx   ON public.tcg_slot_unlocks(guild_id);

-- Backfill: everything that exists today belongs to the original
-- single-tenant deployment. The DEFAULT_GUILD_ID env var holds that id
-- but we can't read env vars from a migration — grab it from the one
-- guild_installs row that currently exists. Falls back to the subscriptions
-- table's guild_id if that's empty.
DO $$
DECLARE
  v_guild TEXT;
BEGIN
  SELECT guild_id INTO v_guild FROM public.guild_installs ORDER BY installed_at ASC LIMIT 1;
  IF v_guild IS NULL THEN
    SELECT guild_id INTO v_guild FROM public.subscriptions ORDER BY current_period_end DESC NULLS LAST LIMIT 1;
  END IF;
  IF v_guild IS NULL THEN
    RAISE NOTICE 'No guild_installs or subscriptions row — skipping backfill. Set guild_id by hand later.';
    RETURN;
  END IF;

  UPDATE public.games_config       SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.game_sessions      SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.game_players       SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.game_results       SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.giveaway_entries   SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.tournament_matches SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.tournament_players SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.tcg_battles        SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.tcg_slot_unlocks   SET guild_id = v_guild WHERE guild_id IS NULL;

  -- Backfill all the Sprint-3 tables that got nullable guild_id but were
  -- never actually populated beyond discord_users.
  UPDATE public.achievements           SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.activity_events        SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.ai_companion_messages  SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.ai_companions          SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.bank_accounts          SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.battle_pass_progress   SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.battle_pass_seasons    SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.battle_pass_tiers      SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.challenge_claims       SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.dashboard_commands     SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.discord_users          SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.live_stream_sessions   SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.loans                  SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.lottery_rounds         SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.lottery_tickets        SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.marriage_proposals     SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.marriages              SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.member_birthdays       SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.member_owned_cosmetics SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.mission_completions    SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.missions               SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.orders                 SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.pet_battles            SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.pet_skin_ownership     SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.pet_skins              SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.pets                   SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.pulse_challenges       SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.pulse_transactions     SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.push_queue             SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.push_subscriptions     SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.quiz_questions         SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.reward_grants_ledger   SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.roles_config           SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.saga_progress          SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.sagas                  SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.server_event_rsvps     SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.server_events          SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.settings               SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.shop_items             SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.stream_links           SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.tcg_cards              SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.tcg_collection         SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.tcg_trades             SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.treasure_hunts         SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.user_achievements      SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.user_cosmetics         SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.user_game_limits       SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.user_purchases         SET guild_id = v_guild WHERE guild_id IS NULL;
  UPDATE public.weekly_analytics       SET guild_id = v_guild WHERE guild_id IS NULL;
END $$;
