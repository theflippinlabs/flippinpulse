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
import { startAutomodCleanup } from './services/automod.js';
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

client.once('ready', async () => {
  log('INFO', `Bot online as ${client.user?.tag}`);
  await loadSettings();
  await loadRanks();
  await loadGameConfigs();
  startSettingsRefresh();
  startAntiSpamCleanup();
  rehydrateVoiceSessions(client);
  startVoiceSessionCleanup(client);
  startGiveawayScheduler(client);
  startDecayScheduler(client);
  startAutomodCleanup();
  log('INFO', 'Settings, ranks, game configs, schedulers loaded. Bot is ready.');
});

client.login(config.DISCORD_TOKEN).catch(err => {
  log('ERROR', 'Failed to login', err);
  process.exit(1);
});
