import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commandData } from './commands/index.js';
import { log } from './utils/logger.js';

// Multi-server: register commands GLOBALLY so they work in every server the
// bot is added to. (Global commands can take up to ~1h to appear the first time.)
export async function registerCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationCommands(config.DISCORD_APPLICATION_ID),
    { body: commandData }
  );
  log('INFO', `Registered ${commandData.length} global commands (propagation up to 1h)`);
}
