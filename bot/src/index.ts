import { Client, GatewayIntentBits, Partials, ActivityType } from 'discord.js';
import { config } from './config.js';
import { BRAND } from './brand.js';
import { registerEvents } from './events/index.js';
import { loadSettings, startSettingsRefresh } from './services/settings.js';
import { loadRanks } from './services/ranks.js';
import { loadGameConfigs } from './services/games.js';
import { startAntiSpamCleanup } from './services/antiSpam.js';
import { rehydrateVoiceSessions, startVoiceSessionCleanup } from './events/voiceStateUpdate.js';
import { startGiveawayScheduler } from './services/giveaways.js';
import { startDecayScheduler } from './services/decay.js';
import { startLotteryScheduler } from './services/lottery.js';
import { startAutoQuizScheduler } from './services/communityQuiz.js';
import { startPulsar } from './services/pulsar.js';
import { startChallengeScheduler } from './services/challenges.js';
import { startAutomodCleanup } from './services/automod.js';
import { startJailScheduler } from './services/jail.js';
import { startCosmeticsScheduler } from './services/cosmetics.js';
import { startDashboardBridge } from './services/dashboardBridge.js';
import { startChannelSync } from './services/channelSync.js';
import { runDailyBirthdaySweep } from './services/birthdays.js';
import { runReminderSweep } from './services/calendar.js';
import { runWeeklyAnalyticsSweep } from './services/analytics.js';
import { runSagaSweep } from './services/sagas.js';
import { runDbSetup } from './setup-db.js';
import { registerCommands } from './registerCommands.js';
import { log } from './utils/logger.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

registerEvents(client);

async function main() {
  if (process.env.AUTO_DB_SETUP === 'true') {
    await runDbSetup();
  }
  await client.login(config.DISCORD_TOKEN);
}

client.once('ready', async () => {
  log('INFO', `${BRAND.agent} online as ${client.user?.tag} — ${BRAND.agentRole} of ${BRAND.ecosystem}`);
  client.user?.setPresence({
    activities: [{ name: `over ${BRAND.ecosystem}`, type: ActivityType.Watching }],
    status: 'online',
  });
  try {
    await registerCommands();
  } catch (err) {
    log('ERROR', 'Command registration failed (bot will still run)', err);
  }
  await loadSettings();
  await loadRanks();
  await loadGameConfigs();
  startSettingsRefresh();
  startAntiSpamCleanup();
  rehydrateVoiceSessions(client);
  startVoiceSessionCleanup(client);
  startGiveawayScheduler(client);
  startDecayScheduler(client);
  startLotteryScheduler(client);
  startAutoQuizScheduler(client);
  startPulsar(client);
  startChallengeScheduler(client);
  startAutomodCleanup();
  startJailScheduler(client);
  startCosmeticsScheduler(client);
  startDashboardBridge(client);
  startChannelSync(client);

  // Birthday sweep: runs once at startup and then every hour. The service
  // internally skips members already celebrated for the current year, so
  // hourly ticks are cheap and cost nothing if nobody has a birthday today.
  void runDailyBirthdaySweep(client).catch(err => log('ERROR', 'Initial birthday sweep failed', err));
  setInterval(() => {
    runDailyBirthdaySweep(client).catch(err => log('ERROR', 'Birthday sweep tick failed', err));
  }, 60 * 60 * 1000);

  // Calendar 15-min reminder sweep: check every 60s if any scheduled event
  // is within the next 15 minutes and hasn't been reminded yet.
  setInterval(() => {
    runReminderSweep(client).catch(err => log('ERROR', 'Calendar reminder tick failed', err));
  }, 60 * 1000);

  // Weekly analytics: check every 6 hours if the current week's report has
  // been delivered yet. Fires on Monday 00:00 UTC-ish (first tick after
  // that moment). Idempotent via the weekly_analytics.week_starts_at row.
  setInterval(() => {
    runWeeklyAnalyticsSweep(client).catch(err => log('ERROR', 'Weekly analytics tick failed', err));
  }, 6 * 60 * 60 * 1000);

  // Saga scheduler: promote scheduled → running once start time hits and
  // end running → ended once end time hits. Runs every 5 minutes.
  setInterval(() => {
    runSagaSweep(client).catch(err => log('ERROR', 'Saga sweep tick failed', err));
  }, 5 * 60 * 1000);

  log('INFO', `${BRAND.ecosystem} // ${BRAND.agent} — systems operational.`);
});

main().catch(err => {
  log('ERROR', 'Failed to start bot', err);
  process.exit(1);
});
