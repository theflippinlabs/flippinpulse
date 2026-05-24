import { Client } from 'pg';
import { SCHEMA_SQL } from './dbSchema.js';
import { log } from './utils/logger.js';

export async function runDbSetup(): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    log('ERROR', 'AUTO_DB_SETUP is on but DATABASE_URL is not set. Skipping DB setup.');
    return false;
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    log('INFO', 'DB setup: connecting to Postgres…');
    await client.connect();
    log('INFO', 'DB setup: running schema (this creates all tables, idempotent)…');
    await client.query(SCHEMA_SQL);
    log('INFO', 'DB setup: schema applied successfully. ✅');
    return true;
  } catch (err) {
    log('ERROR', 'DB setup failed', err);
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}
