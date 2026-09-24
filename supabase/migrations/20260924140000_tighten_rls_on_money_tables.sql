-- ============================================================
-- Sprint 2 (3/3): tighten RLS on money-adjacent tables.
--
-- Blocker F from the audit: setup_complete.sql loops over every core
-- table and grants:
--   CREATE POLICY "auth_view" ON <t> FOR SELECT TO authenticated USING (true)
--
-- Since this project uses a signed-cookie session (NOT Supabase Auth),
-- there are normally no `authenticated` users. But if the anon key
-- ever leaks or a client is misconfigured, that policy leaks every
-- row of discord_users, pulse_transactions, orders, user_purchases,
-- etc. The bot + dashboard both use the service_role client, which
-- BYPASSES RLS entirely — so we can safely drop the permissive
-- policies without breaking anything.
--
-- What this migration does:
--   1. Drop the `auth_view` policy on every money-facing table.
--   2. Drop the `admin_all` policy that trusts `has_role(auth.uid(),
--      'admin')` — that check is dead code here (no auth users),
--      just noise.
--   3. Keep RLS enabled. Only service_role can now read/write.
--
-- Idempotent (uses DROP POLICY IF EXISTS).
-- ============================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'discord_users','activity_events','pulse_transactions','orders','user_purchases',
    'shop_items','missions','mission_completions','roles_config','settings',
    'audit_logs','games_config','game_sessions','game_players','game_results',
    'quiz_questions','user_game_limits','reaction_roles','giveaways',
    'giveaway_entries','mod_actions','lottery_rounds','lottery_tickets',
    'pulse_challenges','challenge_claims','jailed_members','achievements',
    'user_achievements','tournaments','tournament_players','tournament_matches',
    'user_cosmetics','discord_channels','dashboard_commands'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_view" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_all" ON public.%I', t);
    -- No service_role policy needed — Supabase's service_role has
    -- bypassrls, so removing the loose policies is enough. But we
    -- add an explicit one so a Lord reading pg_policies later sees
    -- who is meant to reach the row.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t || '_service', t);
  END LOOP;
END $$;
