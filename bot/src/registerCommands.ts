import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commandData } from './commands/index.js';
import { log } from './utils/logger.js';

export async function registerCommands(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

  if (config.GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(config.DISCORD_APPLICATION_ID, config.GUILD_ID),
      { body: commandData }
    );
    log('INFO', `Registered ${commandData.length} guild commands for ${config.GUILD_ID}`);
  } else {
    await rest.put(
      Routes.applicationCommands(config.DISCORD_APPLICATION_ID),
      { body: commandData }
    );
    log('INFO', `Registered ${commandData.length} global commands (propagation up to 1h)`);
  }
}
