import { registerCommands } from './registerCommands.js';
import { log } from './utils/logger.js';

registerCommands()
  .then(() => log('INFO', 'Command registration complete.'))
  .catch(err => {
    log('ERROR', 'Failed to register commands', err);
    process.exit(1);
  });
