import { MessageReaction } from 'discord.js';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

export function reactionKey(reaction: MessageReaction): string {
  return reaction.emoji.id ?? reaction.emoji.name ?? '';
}

export async function findRoleForReaction(reaction: MessageReaction): Promise<string | null> {
  const emoji = reactionKey(reaction);
  if (!emoji) return null;

  const { data, error } = await supabase
    .from('reaction_roles')
    .select('role_id')
    .eq('message_id', reaction.message.id)
    .eq('emoji', emoji)
    .maybeSingle();

  if (error) {
    log('ERROR', 'Failed to fetch reaction role', error);
    return null;
  }
  return data?.role_id ?? null;
}

export async function saveReactionRole(params: {
  guildId: string;
  channelId: string;
  messageId: string;
  emoji: string;
  roleId: string;
  createdBy: string;
}): Promise<boolean> {
  const { error } = await supabase.from('reaction_roles').upsert({
    guild_id: params.guildId,
    channel_id: params.channelId,
    message_id: params.messageId,
    emoji: params.emoji,
    role_id: params.roleId,
    created_by: params.createdBy,
  }, { onConflict: 'message_id,emoji' });

  if (error) {
    log('ERROR', 'Failed to save reaction role', error);
    return false;
  }
  return true;
}

export async function deleteReactionRole(messageId: string, emoji: string): Promise<boolean> {
  const { error } = await supabase
    .from('reaction_roles')
    .delete()
    .eq('message_id', messageId)
    .eq('emoji', emoji);

  if (error) {
    log('ERROR', 'Failed to delete reaction role', error);
    return false;
  }
  return true;
}
