import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { getEconomyConfig } from './settings.js';

interface Mission {
  id: string;
  type: string;
  title: string;
  description: string;
  reward_points: number;
  start_at: string;
  end_at: string;
}

export async function getActiveMissions(type?: string): Promise<Mission[]> {
  const now = new Date().toISOString();
  let query = supabase
    .from('missions')
    .select('id, type, title, description, reward_points, start_at, end_at')
    .eq('is_active', true)
    .lte('start_at', now)
    .gte('end_at', now);

  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) {
    log('ERROR', 'Failed to fetch missions', error);
    return [];
  }
  return data ?? [];
}

export async function hasCompletedMission(discordId: string, missionId: string): Promise<boolean> {
  const { data } = await supabase
    .from('mission_completions')
    .select('id')
    .eq('discord_id', discordId)
    .eq('mission_id', missionId)
    .eq('status', 'completed')
    .limit(1);

  return (data?.length ?? 0) > 0;
}

export async function completeMission(
  discordId: string,
  missionId: string,
  rewardPoints: number
): Promise<boolean> {
  if (await hasCompletedMission(discordId, missionId)) return false;

  // Insert completion
  const { error } = await supabase.from('mission_completions').insert({
    discord_id: discordId,
    mission_id: missionId,
    status: 'completed',
    completed_at: new Date().toISOString(),
  });

  if (error) {
    log('ERROR', 'Failed to complete mission', error);
    return false;
  }

  // Award PULSE
  const economyConfig = getEconomyConfig();
  const pulseReward = rewardPoints * economyConfig.pulse_per_point;

  const { data: user } = await supabase
    .from('discord_users')
    .select('points_total, points_week, points_month, balance_pulse, lifetime_earned_pulse')
    .eq('discord_id', discordId)
    .single();

  if (user) {
    const newBalance = (user.balance_pulse ?? 0) + pulseReward;
    await supabase
      .from('discord_users')
      .update({
        points_total: (user.points_total ?? 0) + rewardPoints,
        points_week: (user.points_week ?? 0) + rewardPoints,
        points_month: (user.points_month ?? 0) + rewardPoints,
        balance_pulse: newBalance,
        lifetime_earned_pulse: (user.lifetime_earned_pulse ?? 0) + pulseReward,
      })
      .eq('discord_id', discordId);

    await supabase.from('pulse_transactions').insert({
      discord_id: discordId,
      type: 'EARN_MISSION',
      amount: pulseReward,
      reason: `Mission completed`,
      ref_id: missionId,
      balance_after: newBalance,
    });
  }

  log('INFO', `Mission completed: ${discordId} → ${missionId} (+${rewardPoints} pts)`);
  return true;
}
