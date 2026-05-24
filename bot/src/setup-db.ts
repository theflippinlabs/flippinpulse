import { Client, type ClientConfig } from 'pg';
import { SCHEMA_SQL } from './dbSchema.js';
import { log } from './utils/logger.js';

export async function runDbSetup(): Promise<boolean> {
  const config: ClientConfig = { ssl: { rejectUnauthorized: false } };

  if (process.env.DATABASE_URL) {
    config.connectionString = process.env.DATABASE_URL;
  } else if (process.env.SUPABASE_DB_HOST && process.env.SUPABASE_DB_PASSWORD) {
    config.host = process.env.SUPABASE_DB_HOST;
    config.port = Number(process.env.SUPABASE_DB_PORT ?? 5432);
    config.user = process.env.SUPABASE_DB_USER ?? 'postgres';
    config.password = process.env.SUPABASE_DB_PASSWORD;
    config.database = process.env.SUPABASE_DB_NAME ?? 'postgres';
  } else {
    log('ERROR', 'AUTO_DB_SETUP is on but no DB connection info found (set SUPABASE_DB_HOST + SUPABASE_DB_PASSWORD, or DATABASE_URL). Skipping DB setup.');
    return false;
  }

  const client = new Client(config);

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
