import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commandData } from './commands/index.js';
import { log } from './utils/logger.js';

const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

async function main() {
  log('INFO', `Registering ${commandData.length} slash commands...`);

  if (config.GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(config.DISCORD_APPLICATION_ID, config.GUILD_ID),
      { body: commandData }
    );
    log('INFO', `Registered guild commands for ${config.GUILD_ID}`);
  } else {
    await rest.put(
      Routes.applicationCommands(config.DISCORD_APPLICATION_ID),
      { body: commandData }
    );
    log('INFO', 'Registered global commands (may take up to 1 hour to propagate)');
  }
}

main().catch(err => {
  log('ERROR', 'Failed to register commands', err);
  process.exit(1);
});
