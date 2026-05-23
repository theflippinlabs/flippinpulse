import { Client } from 'discord.js';
import { supabase } from '../supabase.js';
import { getDecayConfig } from './settings.js';
import { log } from '../utils/logger.js';

const RUN_INTERVAL_MS = 60 * 60_000;
let decayTimer: ReturnType<typeof setInterval> | null = null;

async function runDecayPass(_client: Client): Promise<void> {
  const config = getDecayConfig();
  if (!config.enabled) return;

  const cutoff = new Date(Date.now() - config.inactive_hours * 3_600_000).toISOString();

  const { data: users, error } = await supabase
    .from('discord_users')
    .select('discord_id, points_total, last_activity_at')
    .lt('last_activity_at', cutoff)
    .gt('points_total', config.min_points);

  if (error) {
    log('ERROR', 'Decay pass: failed to fetch users', error);
    return;
  }

  if (!users?.length) return;

  let affected = 0;
  for (const user of users) {
    const lost = Math.max(1, Math.floor(user.points_total * (config.decay_percent / 100)));
    const newTotal = Math.max(config.min_points, user.points_total - lost);
    if (newTotal === user.points_total) continue;

    await supabase
      .from('discord_users')
      .update({ points_total: newTotal })
      .eq('discord_id', user.discord_id);
    affected++;
  }

  log('INFO', `Decay pass: ${affected} user(s) affected`);
}

export function startDecayScheduler(client: Client): void {
  if (decayTimer) return;
  decayTimer = setInterval(() => {
    runDecayPass(client).catch(err => log('ERROR', 'Decay pass crashed', err));
  }, RUN_INTERVAL_MS);
}

export function stopDecayScheduler(): void {
  if (decayTimer) {
    clearInterval(decayTimer);
    decayTimer = null;
  }
}
