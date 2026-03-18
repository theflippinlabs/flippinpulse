import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

export interface GameConfig {
  game_key: string;
  config_json: Record<string, unknown>;
  is_enabled: boolean;
}

const configCache = new Map<string, GameConfig>();

export async function loadGameConfigs(): Promise<void> {
  const { data, error } = await supabase.from('games_config').select('*');
  if (error) {
    log('ERROR', 'Failed to load game configs', error);
    return;
  }
  for (const row of data ?? []) {
    configCache.set(row.game_key, row as GameConfig);
  }
  log('INFO', `Loaded ${configCache.size} game configs`);
}

export function getGameConfig(key: string): GameConfig | null {
  return configCache.get(key) ?? null;
}

export function isGameEnabled(key: string): boolean {
  return configCache.get(key)?.is_enabled ?? false;
}

export async function createGameSession(
  gameKey: string,
  channelId: string,
  stateJson: Record<string, unknown> = {},
): Promise<string | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .insert({
      game_key: gameKey,
      channel_id: channelId,
      status: 'waiting',
      state_json: stateJson,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    log('ERROR', 'Failed to create game session', error);
    return null;
  }
  return data.id;
}

export async function updateGameSession(
  sessionId: string,
  updates: { status?: string; state_json?: Record<string, unknown>; ended_at?: string },
): Promise<void> {
  const { error } = await supabase
    .from('game_sessions')
    .update(updates)
    .eq('id', sessionId);
  if (error) log('ERROR', `Failed to update game session ${sessionId}`, error);
}

export async function addGamePlayer(
  sessionId: string,
  discordId: string,
  betAmount: number,
): Promise<void> {
  await supabase.from('game_players').insert({
    session_id: sessionId,
    discord_id: discordId,
    bet_amount: betAmount,
    payout: 0,
  });
}

export async function setPlayerPayout(
  sessionId: string,
  discordId: string,
  payout: number,
): Promise<void> {
  await supabase
    .from('game_players')
    .update({ payout })
    .eq('session_id', sessionId)
    .eq('discord_id', discordId);
}

export async function saveGameResult(
  sessionId: string,
  outcomeJson: Record<string, unknown>,
): Promise<void> {
  await supabase.from('game_results').insert({
    session_id: sessionId,
    outcome_json: outcomeJson,
  });
}

export async function earnPulse(
  discordId: string,
  amount: number,
  reason: string,
  refId?: string,
): Promise<number> {
  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse, lifetime_earned_pulse')
    .eq('discord_id', discordId)
    .single();

  const currentBalance = user?.balance_pulse ?? 0;
  const currentEarned = user?.lifetime_earned_pulse ?? 0;
  const newBalance = currentBalance + amount;

  await supabase
    .from('discord_users')
    .update({
      balance_pulse: newBalance,
      lifetime_earned_pulse: currentEarned + amount,
    })
    .eq('discord_id', discordId);

  await supabase.from('pulse_transactions').insert({
    discord_id: discordId,
    type: 'EARN_EVENT',
    amount,
    reason,
    ref_id: refId,
    balance_after: newBalance,
  });

  return newBalance;
}

export async function checkGameLimit(
  discordId: string,
  limitKey: string,
  maxCount: number,
): Promise<boolean> {
  const now = new Date();
  const { data } = await supabase
    .from('user_game_limits')
    .select('count, reset_at')
    .eq('discord_id', discordId)
    .eq('limit_key', limitKey)
    .single();

  if (!data) return true; // no record = allowed

  const resetAt = new Date(data.reset_at);
  if (now >= resetAt) return true; // reset period passed

  return data.count < maxCount;
}

export async function incrementGameLimit(
  discordId: string,
  limitKey: string,
): Promise<void> {
  const now = new Date();
  const resetAt = new Date();
  resetAt.setHours(23, 59, 59, 999); // end of today

  const { data: existing } = await supabase
    .from('user_game_limits')
    .select('count, reset_at')
    .eq('discord_id', discordId)
    .eq('limit_key', limitKey)
    .single();

  if (!existing || new Date(existing.reset_at) <= now) {
    await supabase.from('user_game_limits').upsert({
      discord_id: discordId,
      limit_key: limitKey,
      count: 1,
      reset_at: resetAt.toISOString(),
    }, { onConflict: 'discord_id,limit_key' });
  } else {
    await supabase
      .from('user_game_limits')
      .update({ count: existing.count + 1 })
      .eq('discord_id', discordId)
      .eq('limit_key', limitKey);
  }
}
