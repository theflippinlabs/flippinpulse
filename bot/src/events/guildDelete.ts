import { Guild } from 'discord.js';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

/**
 * Fires when the bot is kicked from a server or the server is deleted.
 * Marks the install inactive and stamps removed_at so the dashboard can
 * stop surfacing that guild in the switcher. We don't delete the row —
 * historical data (subscriptions, past battles) still references it.
 */
export async function handleGuildDelete(guild: Guild): Promise<void> {
  log('INFO', `Bot removed from guild ${guild.name ?? guild.id} (${guild.id})`);
  const { error } = await supabase
    .from('guild_installs')
    .update({ is_active: false, removed_at: new Date().toISOString() })
    .eq('guild_id', guild.id);
  if (error) log('ERROR', `guild_installs delete-mark failed for ${guild.id}`, error);
}
