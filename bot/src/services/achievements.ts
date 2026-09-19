import { Client, EmbedBuilder } from 'discord.js';
import { supabase } from '../supabase.js';
import { getRawSetting } from './settings.js';
import { log } from '../utils/logger.js';

export interface Achievement {
  achievement_key: string;
  category: string;
  tier: number;
  emoji: string;
  name: string;
  description: string;
  reward_pulse: number;
  is_hidden: boolean;
  sort_order: number;
}

const TIER_COLOR: Record<number, number> = {
  1: 0xCD7F32, // bronze
  2: 0xC0C0C0, // silver
  3: 0xFFD700, // gold
  4: 0x9F7AEA, // platinum / violet
};

const cache = new Map<string, Achievement>();
let cacheLoaded = false;

async function ensureCache(): Promise<void> {
  if (cacheLoaded) return;
  const { data, error } = await supabase.from('achievements').select('*');
  if (error) { log('ERROR', 'Failed to load achievements', error); return; }
  for (const row of data ?? []) cache.set(row.achievement_key, row as Achievement);
  cacheLoaded = true;
  log('INFO', `Loaded ${cache.size} achievements`);
}

export async function listAllAchievements(): Promise<Achievement[]> {
  await ensureCache();
  return Array.from(cache.values()).sort((a, b) => a.sort_order - b.sort_order);
}

export async function listUnlocked(discordId: string): Promise<string[]> {
  const { data } = await supabase
    .from('user_achievements')
    .select('achievement_key')
    .eq('discord_id', discordId);
  return (data ?? []).map(r => (r as { achievement_key: string }).achievement_key);
}

async function grantPulseSilently(discordId: string, amount: number, reason: string): Promise<void> {
  if (amount <= 0) return;
  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse, lifetime_earned_pulse')
    .eq('discord_id', discordId)
    .maybeSingle();
  const newBalance = (user?.balance_pulse ?? 0) + amount;
  await supabase.from('discord_users').update({
    balance_pulse: newBalance,
    lifetime_earned_pulse: (user?.lifetime_earned_pulse ?? 0) + amount,
  }).eq('discord_id', discordId);
  await supabase.from('pulse_transactions').insert({
    discord_id: discordId,
    type: 'EARN_EVENT',
    amount,
    reason,
    balance_after: newBalance,
  });
}

interface UserStats {
  lifetime_earned_pulse: number;
  points_total: number;
  streak: number;
}

async function getUserStats(discordId: string): Promise<UserStats | null> {
  const { data } = await supabase
    .from('discord_users')
    .select('lifetime_earned_pulse, points_total, streak')
    .eq('discord_id', discordId)
    .maybeSingle();
  return (data as UserStats | null) ?? null;
}

async function countRows(table: string, filters: Array<[string, unknown]>): Promise<number> {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  for (const [col, val] of filters) q = q.eq(col, val);
  const { count } = await q;
  return count ?? 0;
}

// Threshold definitions — kept in code so we can compute from live counts.
const THRESHOLDS = {
  economy: [
    { key: 'econ_100', min: 100 },
    { key: 'econ_1k', min: 1_000 },
    { key: 'econ_10k', min: 10_000 },
    { key: 'econ_100k', min: 100_000 },
    { key: 'econ_1m', min: 1_000_000 },
  ],
  games: [
    { key: 'games_1', min: 1 },
    { key: 'games_10', min: 10 },
    { key: 'games_100', min: 100 },
    { key: 'games_1000', min: 1_000 },
    { key: 'games_5000', min: 5_000 },
  ],
  streak: [
    { key: 'streak_3', min: 3 },
    { key: 'streak_7', min: 7 },
    { key: 'streak_30', min: 30 },
    { key: 'streak_100', min: 100 },
  ],
  messages: [
    { key: 'msg_100', min: 100 },
    { key: 'msg_1k', min: 1_000 },
    { key: 'msg_10k', min: 10_000 },
  ],
  voice_minutes: [
    { key: 'voice_60', min: 60 },
    { key: 'voice_600', min: 600 },
  ],
  quiz: [
    { key: 'quiz_1', min: 1 },
    { key: 'quiz_50', min: 50 },
    { key: 'quiz_500', min: 500 },
  ],
  missions: [
    { key: 'miss_10', min: 10 },
    { key: 'miss_100', min: 100 },
  ],
  lottery_tickets: [
    { key: 'lot_1', min: 1 },
    { key: 'lot_1k', min: 1_000 },
  ],
};

interface CheckContext {
  discordId: string;
  client?: Client;
  guildId?: string;
  // Optional signals — hooks pass what they know so we skip the DB round-trips.
  lifetimeEarned?: number;
  gamesPlayed?: number;
  streak?: number;
  messagesSent?: number;
  voiceMinutes?: number;
  quizCorrect?: number;
  missionsDone?: number;
  lotteryTicketsBought?: number;
  lotteryWon?: boolean;
  reachedMaxRank?: boolean;
}

export interface AchievementConfig {
  announce_channel_id: string | null;
  announce_enabled: boolean;
}

const DEFAULTS: AchievementConfig = { announce_channel_id: null, announce_enabled: true };

export function getAchievementConfig(): AchievementConfig {
  const cfg = { ...DEFAULTS, ...(getRawSetting<Partial<AchievementConfig>>('achievements_config') ?? {}) };
  // Fall back to the rank-up announcement channel when nothing was picked.
  if (!cfg.announce_channel_id) {
    const rankUp = getRawSetting<{ channel_id?: string | null }>('rank_up_config');
    if (rankUp?.channel_id) cfg.announce_channel_id = rankUp.channel_id;
  }
  return cfg;
}

async function unlock(discordId: string, ach: Achievement, client?: Client, guildId?: string): Promise<void> {
  const { error } = await supabase.from('user_achievements').insert({
    discord_id: discordId,
    achievement_key: ach.achievement_key,
  });
  if (error) {
    // 23505 = unique_violation — someone unlocked in a race, silent.
    if (!/duplicate|23505/i.test(error.message)) log('ERROR', `Failed to unlock ${ach.achievement_key}`, error);
    return;
  }

  if (ach.reward_pulse > 0) {
    await grantPulseSilently(discordId, ach.reward_pulse, `Achievement: ${ach.name}`);
  }

  // Announce (tier 2+ only, or explicit hide flag off).
  const cfg = getAchievementConfig();
  if (!cfg.announce_enabled || !cfg.announce_channel_id || ach.tier < 2 || !client) return;
  try {
    const channel = await client.channels.fetch(cfg.announce_channel_id).catch(() => null);
    if (channel?.isTextBased() && 'send' in channel) {
      const embed = new EmbedBuilder()
        .setColor(TIER_COLOR[ach.tier] ?? 0x38BDF8)
        .setTitle(`${ach.emoji} Achievement unlocked!`)
        .setDescription(`<@${discordId}> just earned **${ach.name}** — ${ach.description}${ach.reward_pulse > 0 ? `\n💰 **+${ach.reward_pulse} PULSE**` : ''}`)
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch(() => null);
    }
  } catch (err) {
    log('ERROR', 'Failed to announce achievement', err);
  }
  log('INFO', `Achievement unlocked: ${discordId} → ${ach.achievement_key}`);
}

// Checks every relevant achievement for one member. Cheap: gathers counts once,
// compares to thresholds, unlocks only those not already granted.
export async function checkAchievements(ctx: CheckContext): Promise<void> {
  await ensureCache();
  if (cache.size === 0) return;

  const already = new Set(await listUnlocked(ctx.discordId));

  // Gather stats — prefer signals passed by the caller, fall back to DB.
  const stats = ctx.lifetimeEarned === undefined || ctx.streak === undefined
    ? await getUserStats(ctx.discordId)
    : null;
  const lifetime = ctx.lifetimeEarned ?? stats?.lifetime_earned_pulse ?? 0;
  const streak = ctx.streak ?? stats?.streak ?? 0;

  const gamesPlayed = ctx.gamesPlayed ?? await countRows('game_players', [['discord_id', ctx.discordId]]);
  const msgs = ctx.messagesSent ?? await countRows('activity_events', [['discord_id', ctx.discordId], ['type', 'message']]);
  const missions = ctx.missionsDone ?? await countRows('mission_completions', [['discord_id', ctx.discordId], ['status', 'completed']]);
  const quizCorrect = ctx.quizCorrect ?? await countRows('activity_events', [['discord_id', ctx.discordId], ['type', 'quiz_correct']]);

  const applyBand = async (
    bands: { key: string; min: number }[],
    value: number,
  ) => {
    for (const b of bands) {
      if (value >= b.min && !already.has(b.key)) {
        const ach = cache.get(b.key);
        if (ach) await unlock(ctx.discordId, ach, ctx.client, ctx.guildId);
      }
    }
  };

  await applyBand(THRESHOLDS.economy, lifetime);
  await applyBand(THRESHOLDS.games, gamesPlayed);
  await applyBand(THRESHOLDS.streak, streak);
  await applyBand(THRESHOLDS.messages, msgs);
  await applyBand(THRESHOLDS.missions, missions);
  await applyBand(THRESHOLDS.quiz, quizCorrect);

  if (ctx.voiceMinutes !== undefined) await applyBand(THRESHOLDS.voice_minutes, ctx.voiceMinutes);
  if (ctx.lotteryTicketsBought !== undefined) await applyBand(THRESHOLDS.lottery_tickets, ctx.lotteryTicketsBought);

  if (ctx.lotteryWon && !already.has('lot_win')) {
    const ach = cache.get('lot_win');
    if (ach) await unlock(ctx.discordId, ach, ctx.client, ctx.guildId);
  }
  if (ctx.reachedMaxRank && !already.has('rank_max')) {
    const ach = cache.get('rank_max');
    if (ach) await unlock(ctx.discordId, ach, ctx.client, ctx.guildId);
  }
}

// Fire-and-forget wrapper so callers never wait on achievement DB round-trips.
export function tickAchievements(ctx: CheckContext): void {
  void checkAchievements(ctx).catch(err => log('ERROR', 'checkAchievements failed', err));
}
