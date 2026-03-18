import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { registerEvents } from './events/index.js';
import { loadSettings, startSettingsRefresh } from './services/settings.js';
import { loadRanks } from './services/ranks.js';
import { loadGameConfigs } from './services/games.js';
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
});

registerEvents(client);

client.once('ready', async () => {
  log('INFO', `Bot online as ${client.user?.tag}`);
  await loadSettings();
  await loadRanks();
  await loadGameConfigs();
  startSettingsRefresh();
  log('INFO', 'Settings, ranks, and game configs loaded. Bot is ready.');
});

client.login(config.DISCORD_TOKEN).catch(err => {
  log('ERROR', 'Failed to login', err);
  process.exit(1);
});
