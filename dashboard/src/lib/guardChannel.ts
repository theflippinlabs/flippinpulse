import { supabase } from './supabase';

// Verify a client-supplied channel_id resolves to a real, public text
// channel we already know about (from discord_channels). Prevents any
// authenticated user from making the bot post to arbitrary channels for
// spam or phishing.
export async function assertChannelAllowed(channelId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!channelId || !/^\d{15,20}$/.test(channelId)) return { ok: false, error: 'bad_channel' };
  const { data } = await supabase
    .from('discord_channels')
    .select('channel_id, type')
    .eq('channel_id', channelId)
    .maybeSingle();
  if (!data) return { ok: false, error: 'channel_not_allowed' };
  // Discord channel type 0 = GUILD_TEXT. Reject voice, categories, threads,
  // stage, forum, DM — nothing dangerous should live in dashboard_commands.
  if (data.type !== 0) return { ok: false, error: 'channel_not_text' };
  return { ok: true };
}
