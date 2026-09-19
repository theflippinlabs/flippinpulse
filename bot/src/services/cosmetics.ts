import { Client, Guild, GuildMember } from 'discord.js';
import { supabase } from '../supabase.js';
import { spendPulse } from './economy.js';
import { log } from '../utils/logger.js';

export interface UserCosmetics {
  discord_id: string;
  title: string | null;
  color_hex: string | null;
  name_color_role_id: string | null;
  name_color_hex: string | null;
  name_color_expires_at: string | null;
}

// Public price list — tweak in one place.
export const PRICES = {
  title: 500,          // permanent custom title on /profile
  color: 1000,         // permanent custom /profile embed color
  nameColor30: 5000,   // 30 days of custom Discord nameplate color
} as const;

export const NAME_COLOR_DAYS = 30;

export function parseHex(input: string): number | null {
  const cleaned = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return parseInt(cleaned, 16);
}

export function normalizeHex(input: string): string | null {
  const n = parseHex(input);
  if (n === null) return null;
  return '#' + n.toString(16).padStart(6, '0').toUpperCase();
}

export async function getCosmetics(discordId: string): Promise<UserCosmetics | null> {
  const { data } = await supabase
    .from('user_cosmetics')
    .select('discord_id, title, color_hex, name_color_role_id, name_color_hex, name_color_expires_at')
    .eq('discord_id', discordId)
    .maybeSingle();
  return (data as UserCosmetics | null) ?? null;
}

async function upsertCosmetics(discordId: string, patch: Partial<UserCosmetics>): Promise<void> {
  const { error } = await supabase.from('user_cosmetics').upsert({
    discord_id: discordId,
    ...patch,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'discord_id' });
  if (error) log('ERROR', `Failed to upsert cosmetics for ${discordId}`, error);
}

export async function buyTitle(discordId: string, title: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = title.trim().slice(0, 40);
  if (!trimmed) return { ok: false, error: 'Give a title (1-40 characters).' };
  const spend = await spendPulse(discordId, PRICES.title, 'cosmetic:title');
  if (!spend.success) return { ok: false, error: spend.error ?? 'Not enough PULSE.' };
  await upsertCosmetics(discordId, { title: trimmed });
  return { ok: true };
}

export async function buyProfileColor(discordId: string, hexInput: string): Promise<{ ok: boolean; error?: string; hex?: string }> {
  const hex = normalizeHex(hexInput);
  if (!hex) return { ok: false, error: 'Invalid color. Use a hex like `#38BDF8`.' };
  const spend = await spendPulse(discordId, PRICES.color, 'cosmetic:color');
  if (!spend.success) return { ok: false, error: spend.error ?? 'Not enough PULSE.' };
  await upsertCosmetics(discordId, { color_hex: hex });
  return { ok: true, hex };
}

async function ensurePersonalRole(guild: Guild, member: GuildMember, hex: string): Promise<string | null> {
  const colorNumber = parseHex(hex) ?? 0x38BDF8;
  const roleName = `nc-${member.id}`;
  let role = guild.roles.cache.find(r => r.name === roleName) ?? null;
  if (role) {
    if (role.color !== colorNumber) {
      await role.setColor(colorNumber, 'Cosmetic name color update').catch(() => null);
    }
  } else {
    role = await guild.roles.create({
      name: roleName,
      color: colorNumber,
      reason: `Cosmetic name color for ${member.user.username}`,
      permissions: [],
      hoist: false,
      mentionable: false,
    }).catch(err => { log('ERROR', 'Failed to create name-color role', err); return null; });
    if (!role) return null;
  }
  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role, 'Cosmetic name color').catch(() => null);
  }
  // Hoist it above @everyone so the color takes effect — but keep it below Lord etc.
  const targetPos = Math.min(guild.roles.highest.position - 1, role.position + 5);
  if (role.position < targetPos) await role.setPosition(targetPos).catch(() => null);
  return role.id;
}

export async function buyNameColor(
  guild: Guild,
  member: GuildMember,
  hexInput: string,
): Promise<{ ok: boolean; error?: string; hex?: string; expiresAt?: string }> {
  const hex = normalizeHex(hexInput);
  if (!hex) return { ok: false, error: 'Invalid color. Use a hex like `#E11D48`.' };
  const spend = await spendPulse(member.id, PRICES.nameColor30, 'cosmetic:namecolor:30d');
  if (!spend.success) return { ok: false, error: spend.error ?? 'Not enough PULSE.' };

  const roleId = await ensurePersonalRole(guild, member, hex);
  if (!roleId) return { ok: false, error: 'Could not create your color role. Give me Manage Roles.' };

  const expiresAt = new Date(Date.now() + NAME_COLOR_DAYS * 86_400_000).toISOString();
  await upsertCosmetics(member.id, {
    name_color_role_id: roleId,
    name_color_hex: hex,
    name_color_expires_at: expiresAt,
  });

  return { ok: true, hex, expiresAt };
}

export async function fetchExpiredNameColors(): Promise<UserCosmetics[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('user_cosmetics')
    .select('discord_id, title, color_hex, name_color_role_id, name_color_hex, name_color_expires_at')
    .not('name_color_role_id', 'is', null)
    .not('name_color_expires_at', 'is', null)
    .lte('name_color_expires_at', nowIso);
  if (error) { log('ERROR', 'Failed to fetch expired name colors', error); return []; }
  return (data as UserCosmetics[]) ?? [];
}

export async function clearNameColor(discordId: string): Promise<void> {
  await upsertCosmetics(discordId, {
    name_color_role_id: null,
    name_color_hex: null,
    name_color_expires_at: null,
  });
}

let cosmeticsInterval: ReturnType<typeof setInterval> | null = null;

// Removes expired name-color roles across every guild the bot is in.
export function startCosmeticsScheduler(client: Client, intervalMs = 15 * 60_000): void {
  const tick = async () => {
    try {
      const expired = await fetchExpiredNameColors();
      for (const c of expired) {
        for (const [, guild] of client.guilds.cache) {
          const member = await guild.members.fetch(c.discord_id).catch(() => null);
          if (member && c.name_color_role_id && member.roles.cache.has(c.name_color_role_id)) {
            await member.roles.remove(c.name_color_role_id, 'Cosmetic name color expired').catch(() => null);
          }
          const role = c.name_color_role_id ? guild.roles.cache.get(c.name_color_role_id) : null;
          if (role && role.members.size === 0) {
            await role.delete('Cosmetic role no longer used').catch(() => null);
          }
        }
        await clearNameColor(c.discord_id);
      }
    } catch (err) {
      log('ERROR', 'Cosmetics scheduler tick failed', err);
    }
  };
  void tick();
  cosmeticsInterval = setInterval(() => void tick(), intervalMs);
}

export function stopCosmeticsScheduler(): void {
  if (cosmeticsInterval) clearInterval(cosmeticsInterval);
}
