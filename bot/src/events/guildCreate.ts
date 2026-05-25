import { Guild } from 'discord.js';
import { supabase } from '../supabase.js';
import { loadSettings } from '../services/settings.js';
import { loadGameConfigs } from '../services/games.js';
import { loadRanks } from '../services/ranks.js';
import { log } from '../utils/logger.js';

/** Installs a server's default settings/ranks/games/quiz (idempotent). */
export async function seedGuildDefaults(guildId: string): Promise<boolean> {
  const { error } = await supabase.rpc('seed_guild_defaults', { p_guild_id: guildId });
  if (error) {
    log('ERROR', `seed_guild_defaults failed for ${guildId}`, error);
    return false;
  }
  return true;
}

export async function handleGuildCreate(guild: Guild): Promise<void> {
  log('INFO', `Joined guild ${guild.name} (${guild.id}) — installing defaults`);
  const ok = await seedGuildDefaults(guild.id);
  if (!ok) return;
  // Refresh the in-memory caches so the new guild is usable immediately.
  await loadSettings();
  await loadGameConfigs();
  await loadRanks();
}
