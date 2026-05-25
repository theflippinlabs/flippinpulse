import { supabase } from '../supabase.js';
import { currentGuildId } from '../guildContext.js';
import { getStreakConfig } from './settings.js';
import { log } from '../utils/logger.js';

export interface StreakResult {
  streak: number;
  bonusPercent: number;
  bonusPulse: number;
}

export async function applyDailyStreak(
  discordId: string,
  baseRewardPulse: number,
): Promise<StreakResult> {
  const guildId = currentGuildId();
  const config = getStreakConfig();
  const now = new Date();

  const { data: user } = await supabase
    .from('discord_users')
    .select('streak, last_daily_at')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .single();

  let streak = user?.streak ?? 0;
  const lastClaim = user?.last_daily_at ? new Date(user.last_daily_at) : null;

  if (!config.enabled) {
    await supabase
      .from('discord_users')
      .update({ streak: 1, last_daily_at: now.toISOString() })
      .eq('guild_id', guildId)
      .eq('discord_id', discordId);
    return { streak: 1, bonusPercent: 0, bonusPulse: 0 };
  }

  if (lastClaim) {
    const hoursSince = (now.getTime() - lastClaim.getTime()) / 3_600_000;
    streak = hoursSince <= config.reset_after_hours ? streak + 1 : 1;
  } else {
    streak = 1;
  }

  const rawBonus = (streak - 1) * config.bonus_percent_per_day;
  const bonusPercent = Math.min(rawBonus, config.max_bonus_percent);
  const bonusPulse = Math.floor(baseRewardPulse * (bonusPercent / 100));

  const { error } = await supabase
    .from('discord_users')
    .update({ streak, last_daily_at: now.toISOString() })
    .eq('guild_id', guildId)
    .eq('discord_id', discordId);

  if (error) log('ERROR', `Failed to update streak for ${discordId}`, error);

  return { streak, bonusPercent, bonusPulse };
}
