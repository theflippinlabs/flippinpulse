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

// Pick the room the user wants big wins to land in by default: the
// "pulse-loud" announcement channel when it's there, otherwise the first
// name that reads like an announcement room, else the first channel.
export function pickDefaultShareChannel(channels: DiscordChannel[]): string {
  if (!channels.length) return '';
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const priority = ['pulseloud', 'loud', 'announce', 'annonces', 'general', 'chat'];
  for (const key of priority) {
    const hit = channels.find(c => norm(c.name).includes(key));
    if (hit) return hit.channel_id;
  }
  return channels[0].channel_id;
}
