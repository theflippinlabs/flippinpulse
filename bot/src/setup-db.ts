import { Client, type ClientConfig } from 'pg';
import { SCHEMA_SQL } from './dbSchema.js';
import { log } from './utils/logger.js';

// Strips surrounding angle brackets, quotes and whitespace that get pasted by
// mistake (e.g. "<host>") and would otherwise break DNS / auth.
function clean(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return v.trim().replace(/^[<"'\s]+/, '').replace(/[>"'\s]+$/, '');
}

export async function runDbSetup(): Promise<boolean> {
  const config: ClientConfig = { ssl: { rejectUnauthorized: false } };

  const host = clean(process.env.SUPABASE_DB_HOST);
  const password = clean(process.env.SUPABASE_DB_PASSWORD);
  const url = clean(process.env.DATABASE_URL);

  if (url) {
    config.connectionString = url;
  } else if (host && password) {
    config.host = host;
    config.port = Number(clean(process.env.SUPABASE_DB_PORT) ?? 5432);
    config.user = clean(process.env.SUPABASE_DB_USER) ?? 'postgres';
    config.password = password;
    config.database = clean(process.env.SUPABASE_DB_NAME) ?? 'postgres';
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
