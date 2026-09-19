import { ChannelType, Client } from 'discord.js';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

// Channel types the dashboard cares about (text-writeable).
const WRITEABLE = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
]);

async function syncOnce(client: Client): Promise<void> {
  const rows: {
    channel_id: string;
    guild_id: string;
    name: string;
    type: number;
    parent_id: string | null;
    position: number;
  }[] = [];

  for (const [, guild] of client.guilds.cache) {
    try {
      const channels = await guild.channels.fetch();
      for (const [, ch] of channels) {
        if (!ch) continue;
        if (!WRITEABLE.has(ch.type)) continue;
        rows.push({
          channel_id: ch.id,
          guild_id: guild.id,
          name: ch.name,
          type: ch.type,
          parent_id: ch.parentId ?? null,
          position: ch.position ?? 0,
        });
      }
    } catch (err) {
      log('WARN', `Channel sync: failed on guild ${guild.id}`, err);
    }
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from('discord_channels').upsert(
    rows.map(r => ({ ...r, updated_at: new Date().toISOString() })),
    { onConflict: 'channel_id' },
  );
  if (error) log('ERROR', 'channelSync upsert failed', error);
  else log('INFO', `channelSync: refreshed ${rows.length} channels`);
}

let channelInterval: ReturnType<typeof setInterval> | null = null;

export function startChannelSync(client: Client, intervalMs = 5 * 60_000): void {
  void syncOnce(client);
  channelInterval = setInterval(() => void syncOnce(client), intervalMs);
}

export function stopChannelSync(): void {
  if (channelInterval) clearInterval(channelInterval);
}
