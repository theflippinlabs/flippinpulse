import { supabase } from '../supabase.js';
import { currentGuildId } from '../guildContext.js';
import { getDailyCapConfig } from './settings.js';

const EARN_TYPES = ['EARN_MISSION', 'EARN_VOICE', 'EARN_EVENT'];

export async function applyDailyCap(discordId: string, requestedPulse: number): Promise<number> {
  const config = getDailyCapConfig();
  if (!config.enabled || requestedPulse <= 0) return requestedPulse;

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data } = await supabase
    .from('pulse_transactions')
    .select('amount')
    .eq('guild_id', currentGuildId())
    .eq('discord_id', discordId)
    .in('type', EARN_TYPES)
    .gte('created_at', since);

  const earned = (data ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const remaining = Math.max(0, config.cap_pulse - earned);
  return Math.min(requestedPulse, remaining);
}
