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

export interface WelcomeConfig {
  enabled: boolean;
  channel_id: string | null;
  embed_color: string;
  title: string;
  description: string;
  show_member_count: boolean;
  ping_user: boolean;
}

export interface RankUpConfig {
  enabled: boolean;
  channel_id: string | null;
  ping_user: boolean;
}

export interface StreakConfig {
  enabled: boolean;
  bonus_percent_per_day: number;
  max_bonus_percent: number;
  reset_after_hours: number;
}

export interface DailyCapConfig {
  enabled: boolean;
  cap_pulse: number;
}

export interface PulseHourConfig {
  enabled: boolean;
  multiplier: number;
  duration_minutes: number;
  schedule: { day: number; hour: number }[];
}

export interface DecayConfig {
  enabled: boolean;
  inactive_hours: number;
  decay_percent: number;
  min_points: number;
  notify: boolean;
}

const defaults = {
  points_config: { message: 1, reaction: 1, voice_per_minute: 2, invite: 5, event: 3 } as PointsConfig,
  anti_spam: { message_cooldown_seconds: 10, reaction_cooldown_seconds: 5 } as AntiSpamConfig,
  economy: { pulse_per_point: 1 } as EconomyConfig,
  welcome_config: {
    enabled: false,
    channel_id: null,
    embed_color: '#38BDF8',
    title: 'Welcome to the pulse, {username}!',
    description: 'You just joined a server where every message, reaction and voice minute earns you PULSE. Type `/profile` to see your stats, `/daily` to claim your first reward, and `/shop` to spend what you earn.',
    show_member_count: true,
    ping_user: true,
  } as WelcomeConfig,
  rank_up_config: { enabled: false, channel_id: null, ping_user: true } as RankUpConfig,
  streak_config: { enabled: true, bonus_percent_per_day: 5, max_bonus_percent: 50, reset_after_hours: 48 } as StreakConfig,
  daily_cap_config: { enabled: false, cap_pulse: 500 } as DailyCapConfig,
  pulse_hour: { enabled: false, multiplier: 2, duration_minutes: 60, schedule: [] } as PulseHourConfig,
  decay: { enabled: false, inactive_hours: 72, decay_percent: 5, min_points: 0, notify: false } as DecayConfig,
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

export function getWelcomeConfig(): WelcomeConfig {
  return { ...defaults.welcome_config, ...(cache.get('welcome_config') as Partial<WelcomeConfig> ?? {}) };
}

export function getRankUpConfig(): RankUpConfig {
  return { ...defaults.rank_up_config, ...(cache.get('rank_up_config') as Partial<RankUpConfig> ?? {}) };
}

export function getStreakConfig(): StreakConfig {
  return { ...defaults.streak_config, ...(cache.get('streak_config') as Partial<StreakConfig> ?? {}) };
}

export function getDailyCapConfig(): DailyCapConfig {
  return { ...defaults.daily_cap_config, ...(cache.get('daily_cap_config') as Partial<DailyCapConfig> ?? {}) };
}

export function getPulseHourConfig(): PulseHourConfig {
  return { ...defaults.pulse_hour, ...(cache.get('pulse_hour') as Partial<PulseHourConfig> ?? {}) };
}

export function getDecayConfig(): DecayConfig {
  return { ...defaults.decay, ...(cache.get('decay') as Partial<DecayConfig> ?? {}) };
}

let refreshInterval: ReturnType<typeof setInterval> | null = null;

export function startSettingsRefresh(intervalMs = 60_000) {
  refreshInterval = setInterval(() => loadSettings(), intervalMs);
}

export function stopSettingsRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
}
