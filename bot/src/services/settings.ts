import { supabase } from '../supabase.js';
import { currentGuildId, currentGuildIdOrNull } from '../guildContext.js';
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

export interface ModConfig {
  mod_log_channel_id: string | null;
  automod_enabled: boolean;
  anti_spam: { enabled: boolean; max_messages: number; window_seconds: number; mute_seconds: number };
  anti_mass_mentions: { enabled: boolean; max_mentions: number; action: 'delete' | 'warn' };
  anti_invites: { enabled: boolean; action: 'delete' | 'warn' };
  anti_links: { enabled: boolean; whitelist_domains: string[] };
  anti_raid: { enabled: boolean; max_joins: number; window_seconds: number; lockdown_minutes: number };
  auto_warn_threshold: number;
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
  mod_config: {
    mod_log_channel_id: null,
    automod_enabled: false,
    anti_spam: { enabled: true, max_messages: 5, window_seconds: 5, mute_seconds: 600 },
    anti_mass_mentions: { enabled: true, max_mentions: 5, action: 'delete' },
    anti_invites: { enabled: false, action: 'delete' },
    anti_links: { enabled: false, whitelist_domains: [] },
    anti_raid: { enabled: false, max_joins: 10, window_seconds: 30, lockdown_minutes: 10 },
    auto_warn_threshold: 3,
  } as ModConfig,
};

// guildId -> (settings key -> value_json)
const cache = new Map<string, Map<string, unknown>>();

export async function loadSettings(): Promise<void> {
  const { data, error } = await supabase.from('settings').select('guild_id, key, value_json');
  if (error) {
    log('ERROR', 'Failed to load settings', error);
    return;
  }
  cache.clear();
  for (const row of data ?? []) {
    const gid = (row as { guild_id: string }).guild_id;
    if (!cache.has(gid)) cache.set(gid, new Map());
    cache.get(gid)!.set(row.key, row.value_json);
  }
  log('INFO', `Loaded settings for ${cache.size} guild(s)`);
}

function read<T>(key: string, fallback: T): T {
  const gid = currentGuildIdOrNull();
  if (!gid) return fallback;
  const value = cache.get(gid)?.get(key);
  return (value as T) ?? fallback;
}

export function getPointsConfig(): PointsConfig {
  return read('points_config', defaults.points_config);
}
export function getAntiSpamConfig(): AntiSpamConfig {
  return read('anti_spam', defaults.anti_spam);
}
export function getEconomyConfig(): EconomyConfig {
  return read('economy', defaults.economy);
}
export function getWelcomeConfig(): WelcomeConfig {
  return { ...defaults.welcome_config, ...(read<Partial<WelcomeConfig>>('welcome_config', {})) };
}
export function getRankUpConfig(): RankUpConfig {
  return { ...defaults.rank_up_config, ...(read<Partial<RankUpConfig>>('rank_up_config', {})) };
}
export function getStreakConfig(): StreakConfig {
  return { ...defaults.streak_config, ...(read<Partial<StreakConfig>>('streak_config', {})) };
}
export function getDailyCapConfig(): DailyCapConfig {
  return { ...defaults.daily_cap_config, ...(read<Partial<DailyCapConfig>>('daily_cap_config', {})) };
}
export function getPulseHourConfig(): PulseHourConfig {
  return { ...defaults.pulse_hour, ...(read<Partial<PulseHourConfig>>('pulse_hour', {})) };
}
export function getDecayConfig(): DecayConfig {
  return { ...defaults.decay, ...(read<Partial<DecayConfig>>('decay', {})) };
}
export function getModConfig(): ModConfig {
  const raw = read<Partial<ModConfig>>('mod_config', {});
  return {
    ...defaults.mod_config,
    ...raw,
    anti_spam: { ...defaults.mod_config.anti_spam, ...(raw.anti_spam ?? {}) },
    anti_mass_mentions: { ...defaults.mod_config.anti_mass_mentions, ...(raw.anti_mass_mentions ?? {}) },
    anti_invites: { ...defaults.mod_config.anti_invites, ...(raw.anti_invites ?? {}) },
    anti_links: { ...defaults.mod_config.anti_links, ...(raw.anti_links ?? {}) },
    anti_raid: { ...defaults.mod_config.anti_raid, ...(raw.anti_raid ?? {}) },
  };
}

export function getRawSetting<T = Record<string, unknown>>(key: string): T | undefined {
  const gid = currentGuildIdOrNull();
  if (!gid) return undefined;
  return cache.get(gid)?.get(key) as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const gid = currentGuildId();
  const { error } = await supabase
    .from('settings')
    .upsert({ guild_id: gid, key, value_json: value }, { onConflict: 'guild_id,key' });
  if (error) {
    log('ERROR', `Failed to save setting ${key}`, error);
    throw error;
  }
  if (!cache.has(gid)) cache.set(gid, new Map());
  cache.get(gid)!.set(key, value);
}

let refreshInterval: ReturnType<typeof setInterval> | null = null;

export function startSettingsRefresh(intervalMs = 60_000) {
  refreshInterval = setInterval(() => loadSettings(), intervalMs);
}

export function stopSettingsRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
}
