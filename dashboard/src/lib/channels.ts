import { supabase } from './supabase';

export interface DiscordChannel {
  channel_id: string;
  guild_id: string;
  name: string;
  type: number;
  parent_id: string | null;
  position: number;
}

export async function loadChannels(): Promise<DiscordChannel[]> {
  const { data } = await supabase
    .from('discord_channels')
    .select('channel_id, guild_id, name, type, parent_id, position')
    .order('position', { ascending: true });
  return (data ?? []) as DiscordChannel[];
}
