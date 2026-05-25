# 🏢 Pulse Engine — Pro / Multi-server preparation

> **Status: PREPARED, NOT ACTIVE.** Your live single-server bot on branch
> `claude/discord-bot-review-4YOaJ` is untouched and keeps working. This branch
> (`claude/multi-server-pro`) holds everything needed to turn the bot into a
> multi-server (SaaS) product you can sell to many Discord servers, each with
> fully isolated data.

---

## 1. What "multi-server" means here
- **One bot instance** serves many Discord servers at once.
- Every server has its **own** balances, settings, shop, games, quizzes, ranks, lottery — nothing is shared.
- You add the bot to a customer's server, and it **auto-installs** their defaults.

The only structural idea: **every per-server row carries a `guild_id`**, and every read/write is filtered by it.

---

## 2. What's already done on this branch
- ✅ `supabase/setup_multitenant.sql` — the full multi-tenant schema:
  - a `guilds` registry table (with a `plan` column for your billing/tiers),
  - `guild_id` added to every per-server table, with the right unique keys
    (`discord_users (guild_id, discord_id)`, `settings (guild_id, key)`,
    `games_config (guild_id, game_key)`, etc.),
  - a `seed_guild_defaults(guild_id)` SQL function that installs a new server's
    defaults (settings, ranks, games, starter mission + quiz questions).

---

## 3. Code changes still to do (the refactor)
These are mechanical but touch many files. Do them on this branch, typecheck, then test on a **second test database** before selling.

### 3.1 Config (`bot/src/config.ts`)
- Remove the single `GUILD_ID` (or keep it only as an optional dev override).
- Keep `DISCORD_TOKEN`, `DISCORD_APPLICATION_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the DB connection vars.

### 3.2 Command registration (`bot/src/registerCommands.ts`)
- Register commands **globally** (`Routes.applicationCommands(appId)`), not per-guild,
  so they work in every server. (Global commands can take up to ~1h to appear the first time.)

### 3.3 Per-guild caches (the core change)
Today these caches are global; make them keyed by guild.
- `bot/src/services/settings.ts`: cache becomes `Map<guildId, Map<key, value>>`.
  Every getter takes a `guildId`: `getWelcomeConfig(guildId)`, `getEconomyConfig(guildId)`, etc.
  `loadSettings()` loads all rows grouped by `guild_id`. `setSetting(guildId, key, value)`.
- `bot/src/services/games.ts`: `getGameConfig(guildId, key)`, `isGameEnabled(guildId, key)`,
  `loadGameConfigs()` groups by guild. `createGameSession(guildId, …)` writes `guild_id`.

### 3.4 Thread `guildId` through everything
Add `guild_id` to every query and every insert. Main spots:
- **Economy** (`services/economy.ts`): `spendPulse/creditPulse/grantPulse/revokePulse/getBalance/setPulse`
  all take `guildId` and filter `.eq('guild_id', guildId)`; upserts use `onConflict: 'guild_id,discord_id'`.
- **Points** (`services/points.ts`): `awardPoints` already gets the `guild` — pass `guild.id` into all writes.
- **Ranks** (`services/ranks.ts`): load ranks per guild; `checkRankUp` filters by guild.
- **Games / lobby / lottery / community quiz**: every read/write includes `guild_id`
  (use `interaction.guildId` / `message.guildId` / the session's `guild_id`).
- **Events** (`messageCreate`, `messageReactionAdd/Remove`, `voiceStateUpdate`, `guildMemberAdd`):
  use `message.guild.id` / `reaction.message.guildId` etc. as the `guildId`.
- **Commands**: every command does `const guildId = interaction.guildId!;` and passes it down.
  Guard: if `!interaction.inGuild()` reply "server only".

### 3.5 Onboarding when the bot joins a server (`events/guildCreate.ts` — new)
- On `guildCreate`, call the SQL function once: `await supabase.rpc('seed_guild_defaults', { p_guild_id: guild.id })`,
  then `loadSettings()` / `loadGameConfigs()` to refresh caches.
- Register `Events.GuildCreate` in `events/index.ts`.
- Optionally DM the server owner a "thanks + /help" message.

### 3.6 Schedulers (`giveaways`, `lottery`, `decay`, `autoquiz`)
- They currently assume one server. Make each tick **iterate over guilds**:
  read the relevant config per guild (e.g. each guild's `auto_quiz` / `lottery_config`)
  and act per guild. Lottery: one active round **per guild**.

### 3.7 DB setup on boot (`services/setup-db.ts`)
- Point the embedded schema at `setup_multitenant.sql` (regenerate `dbSchema.ts` from it).
- Keep `AUTO_DB_SETUP` for the one-time schema creation.

---

## 4. Selling / operating it
- **Keep `Public Bot` OFF** in the Discord Developer Portal until you're ready; turn it ON
  (or add the bot yourself per customer) when you sell.
- Use the `guilds` table: set `is_active = false` to cut off a server that didn't pay,
  and check it in `guildCreate` / command handlers to refuse service if inactive.
- The `plan` column lets you gate features by tier later (free vs pro).

---

## 5. Testing checklist (before going live)
1. Run `setup_multitenant.sql` on a **fresh test Supabase project** (not production).
2. Run the bot (test token) and add it to **two** test servers.
3. Confirm each server gets its own defaults (`seed_guild_defaults` ran for both).
4. Earn PULSE in server A — verify it does **not** appear in server B (`/balance`).
5. Change a setting in A (`/seteconomy`) — verify B is unchanged.
6. Run a game, a lottery buy, and an auto-quiz in each — verify isolation.
7. Verify moderation/welcome/rankup configs are independent per server.

---

## 6. Migrating your CURRENT data (optional)
If you want your existing single-server data to live on in the multi-tenant DB:
1. Create the multi-tenant schema in a new DB.
2. `SELECT seed_guild_defaults('<your_guild_id>');`
3. Export your current tables and re-insert them with `guild_id = '<your_guild_id>'`
   (a one-off SQL script — happy to generate it when you're ready).

> When you decide to switch, tell me and I'll execute section 3 (the code refactor)
> on this branch, typecheck it, and walk you through testing on a separate DB.
