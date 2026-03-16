import { Guild, GuildMember } from 'discord.js';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

interface RankConfig {
  rank_name: string;
  threshold: number;
  discord_role_id: string | null;
}

let ranksCache: RankConfig[] = [];

export async function loadRanks(): Promise<void> {
  const { data, error } = await supabase
    .from('roles_config')
    .select('rank_name, threshold, discord_role_id')
    .order('sort_order', { ascending: true });

  if (error) {
    log('ERROR', 'Failed to load ranks', error);
    return;
  }
  ranksCache = data ?? [];
  log('INFO', `Loaded ${ranksCache.length} rank configs`);
}

export function getRankForPoints(points: number): RankConfig | null {
  let best: RankConfig | null = null;
  for (const rank of ranksCache) {
    if (points >= rank.threshold) {
      if (!best || rank.threshold > best.threshold) {
        best = rank;
      }
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
  const newRank = getRankForPoints(currentPoints);
  if (!newRank) return;

  // Get current rank
  const { data: user } = await supabase
    .from('discord_users')
    .select('rank_name')
    .eq('discord_id', discordId)
    .single();

  if (user?.rank_name === newRank.rank_name) return;

  // Update rank in DB
  await supabase
    .from('discord_users')
    .update({ rank_name: newRank.rank_name })
    .eq('discord_id', discordId);

  // Manage Discord roles
  try {
    // Remove old rank roles
    const oldRoleIds = ranksCache
      .filter(r => r.discord_role_id && r.rank_name !== newRank.rank_name)
      .map(r => r.discord_role_id!);

    for (const roleId of oldRoleIds) {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
      }
    }

    // Add new rank role
    if (newRank.discord_role_id) {
      await member.roles.add(newRank.discord_role_id);
    }

    log('INFO', `Rank up: ${discordId} → ${newRank.rank_name}`);
  } catch (err) {
    log('ERROR', `Failed to update Discord roles for ${discordId}`, err);
  }
}
