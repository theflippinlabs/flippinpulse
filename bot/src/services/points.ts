import { Guild, GuildMember } from 'discord.js';
import { supabase } from '../supabase.js';
import { getEconomyConfig } from './settings.js';
import { checkRankUp } from './ranks.js';
import { log } from '../utils/logger.js';

interface AwardOptions {
  discordId: string;
  username: string;
  avatarUrl: string | null;
  type: 'message' | 'reaction' | 'voice' | 'event' | 'invite';
  channelId: string | null;
  points: number;
  guild: Guild;
  member: GuildMember;
}

export async function awardPoints(opts: AwardOptions): Promise<void> {
  const { discordId, username, avatarUrl, type, channelId, points, guild, member } = opts;
  if (points <= 0) return;

  try {
    // Upsert user
    const { data: existingUser } = await supabase
      .from('discord_users')
      .select('points_total, points_week, points_month, balance_pulse, lifetime_earned_pulse')
      .eq('discord_id', discordId)
      .single();

    const currentTotal = existingUser?.points_total ?? 0;
    const currentWeek = existingUser?.points_week ?? 0;
    const currentMonth = existingUser?.points_month ?? 0;
    const currentBalance = existingUser?.balance_pulse ?? 0;
    const currentLifetimeEarned = existingUser?.lifetime_earned_pulse ?? 0;

    const newTotal = currentTotal + points;
    const newWeek = currentWeek + points;
    const newMonth = currentMonth + points;

    const economyConfig = getEconomyConfig();
    const pulseEarned = points * economyConfig.pulse_per_point;
    const newBalance = currentBalance + pulseEarned;

    // Upsert discord_users
    await supabase.from('discord_users').upsert({
      discord_id: discordId,
      username,
      avatar_url: avatarUrl,
      points_total: newTotal,
      points_week: newWeek,
      points_month: newMonth,
      balance_pulse: newBalance,
      lifetime_earned_pulse: currentLifetimeEarned + pulseEarned,
      last_activity_at: new Date().toISOString(),
    }, { onConflict: 'discord_id' });

    // Insert activity event
    await supabase.from('activity_events').insert({
      discord_id: discordId,
      type,
      channel_id: channelId,
      points_awarded: points,
    });

    // Insert pulse transaction
    if (pulseEarned > 0) {
      const txType = type === 'voice' ? 'EARN_VOICE' : type === 'event' ? 'EARN_EVENT' : 'EARN_EVENT';
      await supabase.from('pulse_transactions').insert({
        discord_id: discordId,
        type: txType,
        amount: pulseEarned,
        reason: `${type} activity`,
        balance_after: newBalance,
      });
    }

    // Check rank up
    await checkRankUp(discordId, newTotal, guild, member);
  } catch (err) {
    log('ERROR', `Failed to award points to ${discordId}`, err);
  }
}
