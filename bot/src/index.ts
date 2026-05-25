import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
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
import { runDbSetup } from './setup-db.js';
import { registerCommands } from './registerCommands.js';
import { seedGuildDefaults } from './events/guildCreate.js';
import { log } from './utils/logger.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
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
  log('INFO', `Bot online as ${client.user?.tag}`);
  try {
    await registerCommands();
  } catch (err) {
    log('ERROR', 'Command registration failed (bot will still run)', err);
  }
  // Ensure every server the bot is already in has its defaults installed.
  for (const guild of client.guilds.cache.values()) {
    await seedGuildDefaults(guild.id);
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
  log('INFO', 'Settings, ranks, game configs, schedulers loaded. Bot is ready.');
});

main().catch(err => {
  log('ERROR', 'Failed to start bot', err);
  process.exit(1);
});
