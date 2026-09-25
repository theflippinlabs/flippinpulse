-- ============================================================
-- Sprint 3.3 (Multi-tenancy foundation): add guild_id to every
-- table that holds per-server state.
--
-- Adds a nullable guild_id column, backfills it with the current
-- default from the `config` setting `default_guild_id` (or leaves
-- NULL if unset — the bot / dashboard fill it in as calls come in).
-- Does NOT make it NOT NULL yet — a following migration will do
-- that once every code path scopes queries by guild_id.
--
-- Tables tagged as PER-GUILD (data belongs to one server):
--   discord_users, activity_events, pulse_transactions, orders,
--   user_purchases, missions, mission_completions, roles_config,
--   settings*, shop_items, quiz_questions, user_game_limits,
--   lottery_rounds, lottery_tickets, achievements, user_achievements,
--   pulse_challenges, challenge_claims, user_cosmetics,
--   discord_channels*, dashboard_commands,
--   ai_companions, ai_companion_messages,
--   battle_pass_seasons, battle_pass_tiers, battle_pass_progress,
--   member_owned_cosmetics, reward_grants_ledger,
--   pets, pet_battles, pet_skins, pet_skin_ownership,
--   tcg_cards, tcg_collection, tcg_trades,
--   marriages, marriage_proposals,
--   guilds, guild_members,
--   bank_accounts, loans,
--   server_events, server_event_rsvps,
--   treasure_hunts, sagas, saga_progress,
--   member_birthdays, weekly_analytics,
--   push_subscriptions, push_queue,
--   stream_links, live_stream_sessions
--
-- (* settings + discord_channels already de-facto per-guild —
--  discord_channels even has guild_id from day one; settings uses
--  a single global row set, which is now flagged with a nullable
--  guild_id so a global fallback stays possible.)
-- ============================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'discord_users','activity_events','pulse_transactions','orders','user_purchases',
    'missions','mission_completions','roles_config','settings','shop_items',
    'quiz_questions','user_game_limits','lottery_rounds','lottery_tickets',
    'achievements','user_achievements','pulse_challenges','challenge_claims',
    'user_cosmetics','dashboard_commands',
    'ai_companions','ai_companion_messages',
    'battle_pass_seasons','battle_pass_tiers','battle_pass_progress',
    'member_owned_cosmetics','reward_grants_ledger',
    'pets','pet_battles','pet_skins','pet_skin_ownership',
    'tcg_cards','tcg_collection','tcg_trades',
    'marriages','marriage_proposals',
    'guilds','guild_members',
    'bank_accounts','loans',
    'server_events','server_event_rsvps',
    'treasure_hunts','sagas','saga_progress',
    'member_birthdays','weekly_analytics',
    'push_subscriptions','push_queue',
    'stream_links','live_stream_sessions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS guild_id TEXT', t);
    -- Index only if not already present.
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(guild_id)', 'idx_' || t || '_guild', t);
  END LOOP;
END $$;

-- Backfill: read the default guild_id from a dedicated settings row
-- (a Lord fills this via the /setup wizard, or the bot writes it on
-- first-ready when a single guild is present). Rows that don't get
-- one stay NULL and are treated as "legacy" until the code catches
-- up.
UPDATE public.discord_users u
   SET guild_id = COALESCE(u.guild_id, s.value_json->>'default_guild_id')
  FROM public.settings s
 WHERE s.key = 'config'
   AND u.guild_id IS NULL
   AND s.value_json ? 'default_guild_id';
