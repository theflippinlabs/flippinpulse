import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

export interface PointsConfig {
  message: number;
  reaction: number;
  voice_per_minute: number;
  invite: number;
  event: number;
}

export interface AntiSpamConfig {
  message_cooldown_seconds: number;
  reaction_cooldown_seconds: number;
}

export interface EconomyConfig {
  pulse_per_point: number;
}

const defaults = {
  points_config: { message: 1, reaction: 1, voice_per_minute: 2, invite: 5, event: 3 } as PointsConfig,
  anti_spam: { message_cooldown_seconds: 10, reaction_cooldown_seconds: 5 } as AntiSpamConfig,
  economy: { pulse_per_point: 1 } as EconomyConfig,
};

const cache = new Map<string, unknown>();

export async function loadSettings(): Promise<void> {
  const { data, error } = await supabase.from('settings').select('key, value_json');
  if (error) {
    log('ERROR', 'Failed to load settings', error);
    return;
  }
  for (const row of data ?? []) {
    cache.set(row.key, row.value_json);
  }
  log('INFO', `Loaded ${cache.size} settings from database`);
}

export function getPointsConfig(): PointsConfig {
  return (cache.get('points_config') as PointsConfig) ?? defaults.points_config;
}

export function getAntiSpamConfig(): AntiSpamConfig {
  return (cache.get('anti_spam') as AntiSpamConfig) ?? defaults.anti_spam;
}

export function getEconomyConfig(): EconomyConfig {
  return (cache.get('economy') as EconomyConfig) ?? defaults.economy;
}

let refreshInterval: ReturnType<typeof setInterval> | null = null;

export function startSettingsRefresh(intervalMs = 60_000) {
  refreshInterval = setInterval(() => loadSettings(), intervalMs);
}

export function stopSettingsRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
}
