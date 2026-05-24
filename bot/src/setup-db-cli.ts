import 'dotenv/config';
import { runDbSetup } from './setup-db.js';

runDbSetup().then(ok => {
  process.exit(ok ? 0 : 1);
});
