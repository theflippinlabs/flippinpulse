import { supabase } from './supabase';
import type { DiscordChannel } from './channelTypes';

export type { DiscordChannel } from './channelTypes';
export { pickDefaultShareChannel } from './channelTypes';

export async function loadChannels(): Promise<DiscordChannel[]> {
  const { data } = await supabase
    .from('discord_channels')
    .select('channel_id, guild_id, name, type, parent_id, position')
    .order('position', { ascending: true });
  return (data ?? []) as DiscordChannel[];
}
