-- ============================================================
-- Phase 3 (lite): NOT NULL on guild_id for the main per-user and
-- per-config tables, plus RLS enablement + a permissive service_role
-- policy on every tenant table. Service_role has BYPASSRLS in Supabase
-- by default, so the policies are belt-and-braces; without them, a bug
-- that revoked BYPASSRLS would silently lock the dashboard out.
--
-- A later Phase 3-full migration will layer per-guild policies driven
-- by `current_setting('app.guild_id', true)` for the anon/authenticated
-- roles once we expose any direct client access.
--
-- Applied live via execute_sql on 2026-10-13; this file lets a fresh
-- clone reproduce the state.
-- ============================================================

ALTER TABLE public.discord_users          ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.ai_companions          ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.bank_accounts          ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.member_birthdays       ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.user_cosmetics         ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.member_owned_cosmetics ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.pet_skin_ownership     ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.battle_pass_progress   ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.pets                   ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.tcg_collection         ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.tcg_slot_unlocks       ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.pulse_transactions     ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.activity_events        ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.shop_items             ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.missions               ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.settings               ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.sagas                  ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.treasure_hunts         ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.lottery_rounds         ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.stream_links           ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.live_stream_sessions   ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.pet_battles            ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.tcg_battles            ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.marriages              ALTER COLUMN guild_id SET NOT NULL;
ALTER TABLE public.weekly_analytics       ALTER COLUMN guild_id SET NOT NULL;

-- RLS on every tenant table + a permissive service_role policy.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'discord_users','ai_companions','ai_companion_messages','bank_accounts',
    'member_birthdays','user_cosmetics','member_owned_cosmetics','pet_skin_ownership',
    'battle_pass_progress','battle_pass_seasons','battle_pass_tiers',
    'pets','pet_battles','pet_skins',
    'tcg_cards','tcg_collection','tcg_slot_unlocks','tcg_battles','tcg_trades',
    'pulse_transactions','activity_events',
    'shop_items','missions','mission_completions','settings',
    'sagas','saga_progress','treasure_hunts',
    'lottery_rounds','lottery_tickets',
    'stream_links','live_stream_sessions',
    'marriages','marriage_proposals','loans','guilds','guild_members',
    'reward_grants_ledger','server_events','server_event_rsvps',
    'push_queue','push_subscriptions','quiz_questions',
    'achievements','user_achievements','user_game_limits','user_purchases','orders',
    'challenge_claims','pulse_challenges','dashboard_commands','weekly_analytics',
    'roles_config','jailed_members','reaction_roles','giveaways','giveaway_entries',
    'tournaments','tournament_matches','tournament_players',
    'game_sessions','game_players','game_results','games_config'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I_service_role ON public.%I', t, t);
      EXECUTE format('CREATE POLICY %I_service_role ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
    END IF;
  END LOOP;
END $$;
