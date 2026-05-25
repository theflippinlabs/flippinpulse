import { ChannelType, EmbedBuilder, Guild } from 'discord.js';
import { supabase } from '../supabase.js';
import { runWithGuild } from '../guildContext.js';
import { getModConfig } from './settings.js';
import { log } from '../utils/logger.js';

export type ModActionType = 'warn' | 'mute' | 'unmute' | 'kick' | 'ban' | 'unban' | 'clear' | 'automod';

export interface ModActionInput {
  guildId: string;
  type: ModActionType;
  targetId?: string | null;
  moderatorId?: string | null;
  reason?: string | null;
  durationSeconds?: number | null;
  metadata?: Record<string, unknown>;
}

const ACTION_COLORS: Record<ModActionType, number> = {
  warn: 0xFACC15,
  mute: 0xF97316,
  unmute: 0x22C55E,
  kick: 0xEF4444,
  ban: 0xB91C1C,
  unban: 0x22C55E,
  clear: 0x6366F1,
  automod: 0xEC4899,
};

export async function recordModAction(input: ModActionInput): Promise<string | null> {
  const expiresAt = input.durationSeconds
    ? new Date(Date.now() + input.durationSeconds * 1000).toISOString()
    : null;

  const { data, error } = await supabase
    .from('mod_actions')
    .insert({
      guild_id: input.guildId,
      type: input.type,
      target_discord_id: input.targetId ?? null,
      moderator_discord_id: input.moderatorId ?? null,
      reason: input.reason ?? null,
      duration_seconds: input.durationSeconds ?? null,
      expires_at: expiresAt,
      metadata_json: input.metadata ?? {},
    })
    .select('id')
    .single();

  if (error) {
    log('ERROR', 'Failed to record mod action', error);
    return null;
  }
  return data.id;
}

export async function postModLog(guild: Guild, input: ModActionInput, actionId: string | null): Promise<void> {
  const config = runWithGuild(input.guildId, () => getModConfig());
  if (!config.mod_log_channel_id) return;

  const channel = await guild.channels.fetch(config.mod_log_channel_id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const fields = [];
  if (input.targetId) fields.push({ name: 'Target', value: `<@${input.targetId}> (\`${input.targetId}\`)`, inline: true });
  if (input.moderatorId) fields.push({ name: 'Moderator', value: `<@${input.moderatorId}>`, inline: true });
  if (input.durationSeconds) {
    const minutes = Math.floor(input.durationSeconds / 60);
    fields.push({ name: 'Duration', value: minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`, inline: true });
  }
  if (input.reason) fields.push({ name: 'Reason', value: input.reason, inline: false });
  if (actionId) fields.push({ name: 'Action ID', value: `\`${actionId}\``, inline: false });

  const embed = new EmbedBuilder()
    .setColor(ACTION_COLORS[input.type])
    .setTitle(`🛡️ Mod action: ${input.type.toUpperCase()}`)
    .addFields(fields)
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(err => log('ERROR', 'Failed to post mod log', err));
}

export async function logAndAnnounce(guild: Guild, input: ModActionInput): Promise<string | null> {
  const id = await recordModAction(input);
  await postModLog(guild, input, id);
  return id;
}

export async function countWarnings(guildId: string, targetId: string): Promise<number> {
  const { count } = await supabase
    .from('mod_actions')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .eq('target_discord_id', targetId)
    .eq('type', 'warn');
  return count ?? 0;
}

export async function listWarnings(guildId: string, targetId: string, limit = 10): Promise<Array<{
  id: string;
  reason: string | null;
  moderator_discord_id: string | null;
  created_at: string;
}>> {
  const { data, error } = await supabase
    .from('mod_actions')
    .select('id, reason, moderator_discord_id, created_at')
    .eq('guild_id', guildId)
    .eq('target_discord_id', targetId)
    .eq('type', 'warn')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    log('ERROR', 'Failed to list warnings', error);
    return [];
  }
  return data ?? [];
}

export function parseDurationSeconds(input: string): number | null {
  const match = input.trim().match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return value * mult;
}
