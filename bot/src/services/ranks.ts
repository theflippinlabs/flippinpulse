import { ChannelType, EmbedBuilder, Guild, GuildMember } from 'discord.js';
import { supabase } from '../supabase.js';
import { runWithGuild, currentGuildIdOrNull } from '../guildContext.js';
import { getRankUpConfig } from './settings.js';
import { pulsarCelebrate } from './pulsar.js';
import { log } from '../utils/logger.js';

interface RankConfig {
  rank_name: string;
  threshold: number;
  discord_role_id: string | null;
  color?: string | null;
}

// guildId -> ranks (sorted)
const ranksCache = new Map<string, RankConfig[]>();

export async function loadRanks(): Promise<void> {
  const { data, error } = await supabase
    .from('roles_config')
    .select('guild_id, rank_name, threshold, discord_role_id, color')
    .order('sort_order', { ascending: true });

  if (error) {
    log('ERROR', 'Failed to load ranks', error);
    return;
  }
  ranksCache.clear();
  for (const row of data ?? []) {
    const gid = (row as { guild_id: string }).guild_id;
    if (!ranksCache.has(gid)) ranksCache.set(gid, []);
    ranksCache.get(gid)!.push(row as RankConfig);
  }
  log('INFO', `Loaded ranks for ${ranksCache.size} guild(s)`);
}

function ranksForCurrentGuild(): RankConfig[] {
  const gid = currentGuildIdOrNull();
  if (!gid) return [];
  return ranksCache.get(gid) ?? [];
}

export function getRankForPoints(points: number): RankConfig | null {
  let best: RankConfig | null = null;
  for (const rank of ranksForCurrentGuild()) {
    if (points >= rank.threshold) {
      if (!best || rank.threshold > best.threshold) best = rank;
    }
  }
  return best;
}

export async function checkRankUp(
  discordId: string,
  currentPoints: number,
  guild: Guild,
  member: GuildMember
): Promise<void> {
  await runWithGuild(guild.id, async () => {
    const ranks = ranksCache.get(guild.id) ?? [];
    const newRank = getRankForPoints(currentPoints);
    if (!newRank) return;

    const { data: user } = await supabase
      .from('discord_users')
      .select('rank_name')
      .eq('guild_id', guild.id)
      .eq('discord_id', discordId)
      .single();

    if (user?.rank_name === newRank.rank_name) return;

    await supabase
      .from('discord_users')
      .update({ rank_name: newRank.rank_name })
      .eq('guild_id', guild.id)
      .eq('discord_id', discordId);

    try {
      const oldRoleIds = ranks
        .filter(r => r.discord_role_id && r.rank_name !== newRank.rank_name)
        .map(r => r.discord_role_id!);

      for (const roleId of oldRoleIds) {
        if (member.roles.cache.has(roleId)) await member.roles.remove(roleId);
      }
      if (newRank.discord_role_id) await member.roles.add(newRank.discord_role_id);

      log('INFO', `Rank up: ${guild.id}/${discordId} → ${newRank.rank_name}`);
    } catch (err) {
      log('ERROR', `Failed to update Discord roles for ${discordId}`, err);
    }

    await announceRankUp(guild, member, newRank, user?.rank_name ?? null).catch(err =>
      log('ERROR', `Failed to announce rank-up for ${discordId}`, err),
    );
  });
}

function parseHexColor(input: string | null | undefined): number {
  if (!input) return 0x38BDF8;
  const num = parseInt(input.replace('#', ''), 16);
  return Number.isFinite(num) ? num : 0x38BDF8;
}

async function announceRankUp(
  guild: Guild,
  member: GuildMember,
  newRank: RankConfig,
  previousRank: string | null,
): Promise<void> {
  const config = getRankUpConfig();
  if (!config.enabled || !config.channel_id) return;

  const channel = await guild.channels.fetch(config.channel_id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const embed = new EmbedBuilder()
    .setColor(parseHexColor(newRank.color))
    .setTitle('🚀 Rank up!')
    .setDescription(
      previousRank
        ? `**${member.user.username}** just climbed from **${previousRank}** to **${newRank.rank_name}**.`
        : `**${member.user.username}** reached **${newRank.rank_name}**.`,
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();

  await channel.send({
    content: config.ping_user ? `<@${member.id}>` : undefined,
    embeds: [embed],
  });

  void pulsarCelebrate(member.client, `${member.user.username} just ranked up to ${newRank.rank_name}`, member.id);
}
