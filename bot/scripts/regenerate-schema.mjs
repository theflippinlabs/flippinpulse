#!/usr/bin/env node
// Regenerate bot/src/dbSchema.ts from supabase/setup_complete.sql plus
// every incremental migration under supabase/migrations, so a fresh
// AUTO_DB_SETUP=true boot produces the full schema (not just the
// snapshot from early 2026).
//
// Usage: node bot/scripts/regenerate-schema.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const migrationsDir = join(repo, 'supabase', 'migrations');
const setupPath = join(repo, 'supabase', 'setup_complete.sql');
const outPath = join(repo, 'bot', 'src', 'dbSchema.ts');

const base = readFileSync(setupPath, 'utf8');

// Chronological order — filenames start with the version timestamp.
const files = readdirSync(migrationsDir).filter(n => n.endsWith('.sql')).sort();

let sql = base;
for (const name of files) {
  const body = readFileSync(join(migrationsDir, name), 'utf8');
  sql += `\n\n-- ==== MIGRATION ${name} ====\n${body}`;
}

const escaped = sql.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
const out = `// AUTO-GENERATED from supabase/setup_complete.sql + supabase/migrations/*.sql\n// Do not edit by hand — run \`node bot/scripts/regenerate-schema.mjs\` to refresh.\nexport const SCHEMA_SQL = "${escaped}";\n`;

writeFileSync(outPath, out);
console.log(`Wrote ${outPath} (${(out.length / 1024).toFixed(1)} KB, ${files.length} migrations appended).`);
