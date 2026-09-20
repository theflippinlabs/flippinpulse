// Client-safe channel helpers. This file MUST NOT import the supabase
// server client — the games are client components and would pull the
// service-role key into the browser bundle.

export interface DiscordChannel {
  channel_id: string;
  guild_id: string;
  name: string;
  type: number;
  parent_id: string | null;
  position: number;
}

// Pick the room the user wants big wins to land in by default:
// pulse-hood first (that's the announce channel here), then any name
// shaped like announcements, else the first channel.
export function pickDefaultShareChannel(channels: DiscordChannel[]): string {
  if (!channels.length) return '';
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const priority = ['pulsehood', 'hood', 'pulseloud', 'loud', 'announce', 'annonces', 'general', 'chat'];
  for (const key of priority) {
    const hit = channels.find(c => norm(c.name).includes(key));
    if (hit) return hit.channel_id;
  }
  return channels[0].channel_id;
}
