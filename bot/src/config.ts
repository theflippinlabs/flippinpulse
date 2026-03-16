import 'dotenv/config';

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  DISCORD_TOKEN: required('DISCORD_TOKEN'),
  DISCORD_APPLICATION_ID: required('DISCORD_APPLICATION_ID'),
  DISCORD_PUBLIC_KEY: required('DISCORD_PUBLIC_KEY'),
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
  GUILD_ID: process.env.GUILD_ID || null,
} as const;
