import { GuildMember } from 'discord.js';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  if (member.user.bot) return;

  const { error } = await supabase.from('discord_users').upsert({
    discord_id: member.id,
    username: member.user.username,
    avatar_url: member.user.displayAvatarURL({ size: 128 }),
    joined_at: new Date().toISOString(),
  }, { onConflict: 'discord_id' });

  if (error) {
    log('ERROR', `Failed to create user for ${member.id}`, error);
  } else {
    log('INFO', `New member registered: ${member.user.username} (${member.id})`);
  }
}
