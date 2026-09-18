import {
  Client,
  Guild,
  GuildBasedChannel,
  GuildMember,
  PermissionFlagsBits,
  Role,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { getRawSetting, setSetting } from './settings.js';
import { log } from '../utils/logger.js';

export interface JailConfig {
  channel_id: string | null;
  role_id: string | null;
}

export function getJailConfig(): JailConfig {
  const raw = (getRawSetting<Partial<JailConfig>>('jail_config') ?? {}) as Partial<JailConfig>;
  return { channel_id: raw.channel_id ?? null, role_id: raw.role_id ?? null };
}

export async function setJailChannel(channelId: string): Promise<void> {
  const cur = getJailConfig();
  await setSetting('jail_config', { ...cur, channel_id: channelId });
}

export async function setJailRole(roleId: string): Promise<void> {
  const cur = getJailConfig();
  await setSetting('jail_config', { ...cur, role_id: roleId });
}

// Ensures a "Jailed" role exists and is denied ViewChannel on every channel except the jail.
export async function ensureJailRole(guild: Guild, jailChannelId: string): Promise<Role | null> {
  const cfg = getJailConfig();
  let role: Role | null = null;

  if (cfg.role_id) {
    role = await guild.roles.fetch(cfg.role_id).catch(() => null);
  }
  if (!role) {
    role = guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed') ?? null;
  }
  if (!role) {
    role = await guild.roles.create({
      name: 'Jailed',
      color: 0x4B5563,
      reason: 'Novus jail feature — restricts a member to the jail channel',
      permissions: [],
      hoist: false,
      mentionable: false,
    }).catch(err => {
      log('ERROR', 'Failed to create Jailed role', err);
      return null;
    });
    if (!role) return null;
  }

  await setJailRole(role.id);

  // Deny ViewChannel on every channel except the jail. Skip channels we cannot edit.
  const channels = guild.channels.cache;
  for (const [, channel] of channels) {
    if (!('permissionOverwrites' in channel)) continue;
    if (channel.id === jailChannelId) continue;
    // Only touch channels the bot can manage.
    const me = guild.members.me;
    if (!me) continue;
    if (!channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) continue;
    try {
      await channel.permissionOverwrites.edit(role.id, {
        ViewChannel: false,
        SendMessages: false,
        AddReactions: false,
        Speak: false,
        Connect: false,
      }, { reason: 'Novus jail: isolate jailed role' });
    } catch (err) {
      // Non-fatal — some channels may be locked to us.
      log('WARN', `Could not overwrite jail role on channel ${channel.id}`, err);
    }
  }

  // Grant view + send on the jail channel itself.
  const jailChan = await guild.channels.fetch(jailChannelId).catch(() => null) as GuildBasedChannel | null;
  if (jailChan && 'permissionOverwrites' in jailChan) {
    await jailChan.permissionOverwrites.edit(role.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    }, { reason: 'Novus jail: allow view of jail channel' }).catch(err =>
      log('ERROR', 'Failed to unlock jail channel for jailed role', err),
    );
  }

  return role;
}

export interface ActiveJail {
  discord_id: string;
  guild_id: string;
  jailed_at: string;
  expires_at: string | null;
  reason: string | null;
  moderator_id: string | null;
  previous_roles_json: string[];
}

export async function recordJail(input: {
  guildId: string;
  discordId: string;
  moderatorId: string;
  reason: string | null;
  expiresAt: string | null;
  previousRoles: string[];
}): Promise<void> {
  const { error } = await supabase.from('jailed_members').upsert({
    guild_id: input.guildId,
    discord_id: input.discordId,
    moderator_id: input.moderatorId,
    reason: input.reason,
    jailed_at: new Date().toISOString(),
    expires_at: input.expiresAt,
    previous_roles_json: input.previousRoles,
  }, { onConflict: 'guild_id,discord_id' });
  if (error) log('ERROR', 'Failed to record jail', error);
}

export async function fetchActiveJail(guildId: string, discordId: string): Promise<ActiveJail | null> {
  const { data } = await supabase
    .from('jailed_members')
    .select('discord_id, guild_id, jailed_at, expires_at, reason, moderator_id, previous_roles_json')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .maybeSingle();
  return (data as ActiveJail | null) ?? null;
}

export async function clearJail(guildId: string, discordId: string): Promise<void> {
  const { error } = await supabase
    .from('jailed_members')
    .delete()
    .eq('guild_id', guildId)
    .eq('discord_id', discordId);
  if (error) log('ERROR', 'Failed to clear jail', error);
}

export async function fetchExpiredJails(): Promise<ActiveJail[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('jailed_members')
    .select('discord_id, guild_id, jailed_at, expires_at, reason, moderator_id, previous_roles_json')
    .not('expires_at', 'is', null)
    .lte('expires_at', nowIso);
  if (error) {
    log('ERROR', 'Failed to fetch expired jails', error);
    return [];
  }
  return (data as ActiveJail[] | null) ?? [];
}

export async function applyJail(
  guild: Guild,
  member: GuildMember,
  role: Role,
): Promise<{ previousRoles: string[] }> {
  const previous = member.roles.cache
    .filter(r => r.id !== guild.roles.everyone.id && r.editable && !r.managed)
    .map(r => r.id);

  // Remove editable roles, then add the jailed role.
  for (const roleId of previous) {
    await member.roles.remove(roleId, 'Novus jail: stripping roles').catch(() => null);
  }
  await member.roles.add(role, 'Novus jail: applying jailed role').catch(err =>
    log('ERROR', 'Failed to add jailed role', err),
  );

  // If they're in voice, boot them so they can't hide in a call.
  if (member.voice?.channelId) {
    await member.voice.disconnect('Novus jail: kicked from voice').catch(() => null);
  }

  return { previousRoles: previous };
}

// Extended duration parser for /jail: accepts s/m/h/d/w/mo/y and treats
// life / forever / perma / permanent / à vie / ∞ as an indefinite sentence.
// Returns { seconds: null } for indefinite so the DB expires_at stays NULL.
export interface JailDuration {
  seconds: number | null;
  label: string;
  forLife: boolean;
}

const LIFE_KEYWORDS = new Set([
  'life', 'forlife', 'for-life', 'for_life', 'lifetime',
  'forever', 'perma', 'permanent',
  'vie', 'avie', 'à-vie', 'a-vie',
  '∞', 'inf', 'infinity', 'infinite',
]);

export function parseJailDuration(input: string | null | undefined): JailDuration | null {
  if (!input) return { seconds: null, label: 'indefinite', forLife: false };
  const raw = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) return { seconds: null, label: 'indefinite', forLife: false };
  if (LIFE_KEYWORDS.has(raw.replace(/[^a-z∞]/g, ''))) {
    return { seconds: null, label: 'FOR LIFE 🔒', forLife: true };
  }

  const m = raw.match(/^(\d+)(s|min|m|mo|mon|month|months|mth|h|hr|hour|hours|d|day|days|w|wk|week|weeks|y|yr|year|years)$/);
  if (!m) return null;
  const value = parseInt(m[1], 10);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = m[2];
  const secondsPer: Record<string, number> = {
    s: 1,
    m: 60, min: 60,
    h: 3600, hr: 3600, hour: 3600, hours: 3600,
    d: 86_400, day: 86_400, days: 86_400,
    w: 604_800, wk: 604_800, week: 604_800, weeks: 604_800,
    mo: 2_592_000, mon: 2_592_000, month: 2_592_000, months: 2_592_000, mth: 2_592_000, // 30 days
    y: 31_536_000, yr: 31_536_000, year: 31_536_000, years: 31_536_000, // 365 days
  };
  const per = secondsPer[unit];
  if (!per) return null;
  const seconds = value * per;

  // Cap ordinary durations at ~100 years to keep timestamps sane; longer → treat as life.
  if (seconds > 100 * 31_536_000) return { seconds: null, label: 'FOR LIFE 🔒', forLife: true };

  return { seconds, label: `${value}${unit}`, forLife: false };
}

export async function releaseJail(
  guild: Guild,
  member: GuildMember,
  jailedRoleId: string,
  previousRoles: string[],
): Promise<void> {
  await member.roles.remove(jailedRoleId, 'Novus jail: released').catch(() => null);
  for (const roleId of previousRoles) {
    const r = guild.roles.cache.get(roleId);
    if (!r) continue;
    if (!r.editable) continue;
    await member.roles.add(roleId, 'Novus jail: restoring role').catch(() => null);
  }
}

let jailInterval: ReturnType<typeof setInterval> | null = null;

export function startJailScheduler(client: Client, intervalMs = 60_000): void {
  const tick = async () => {
    try {
      const expired = await fetchExpiredJails();
      for (const j of expired) {
        const guild = await client.guilds.fetch(j.guild_id).catch(() => null);
        if (!guild) continue;
        const cfg = getJailConfig();
        if (!cfg.role_id) continue;
        const member = await guild.members.fetch(j.discord_id).catch(() => null);
        if (member) {
          await releaseJail(guild, member, cfg.role_id, j.previous_roles_json ?? []);
        }
        await clearJail(j.guild_id, j.discord_id);
        log('INFO', `Auto-released ${j.discord_id} from jail in guild ${j.guild_id}`);
      }
    } catch (err) {
      log('ERROR', 'Jail scheduler tick failed', err);
    }
  };
  void tick();
  jailInterval = setInterval(() => void tick(), intervalMs);
}

export function stopJailScheduler(): void {
  if (jailInterval) clearInterval(jailInterval);
}
