import { Client } from 'discord.js';
import { supabase } from '../supabase.js';
import { earnPulse } from './games.js';
import { spendPulse } from './economy.js';
import { log } from '../utils/logger.js';

export interface Season {
  id: number;
  name: string;
  emoji: string;
  color: number;
  xp_per_tier: number;
  tier_count: number;
  premium_price_pulse: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export type RewardKind = 'pulse' | 'role' | 'shop_item' | 'cosmetic' | 'xp_boost' | 'nothing';

export interface Tier {
  id: number;
  season_id: number;
  tier_number: number;
  free_reward_kind: RewardKind;
  free_reward_value: Record<string, unknown>;
  free_reward_label: string;
  premium_reward_kind: RewardKind;
  premium_reward_value: Record<string, unknown>;
  premium_reward_label: string;
}

export interface Progress {
  discord_id: string;
  season_id: number;
  xp: number;
  is_premium: boolean;
  claimed_free: number[];
  claimed_premium: number[];
}

let activeSeasonCache: { season: Season | null; ts: number } = { season: null, ts: 0 };
const SEASON_TTL_MS = 60_000;

export async function getActiveSeason(): Promise<Season | null> {
  if (activeSeasonCache.season && Date.now() - activeSeasonCache.ts < SEASON_TTL_MS) return activeSeasonCache.season;
  const { data } = await supabase.from('battle_pass_seasons').select('*').eq('is_active', true).order('id', { ascending: false }).limit(1).maybeSingle();
  const season = (data as Season) ?? null;
  activeSeasonCache = { season, ts: Date.now() };
  return season;
}

export function invalidateSeasonCache(): void { activeSeasonCache = { season: null, ts: 0 }; }

export async function getTiers(seasonId: number): Promise<Tier[]> {
  const { data } = await supabase.from('battle_pass_tiers').select('*').eq('season_id', seasonId).order('tier_number', { ascending: true });
  return (data ?? []) as Tier[];
}

export async function getProgress(discordId: string, seasonId: number): Promise<Progress> {
  const { data } = await supabase.from('battle_pass_progress').select('*').eq('discord_id', discordId).eq('season_id', seasonId).maybeSingle();
  if (data) return data as Progress;
  return { discord_id: discordId, season_id: seasonId, xp: 0, is_premium: false, claimed_free: [], claimed_premium: [] };
}

async function upsertProgress(p: Progress): Promise<void> {
  await supabase.from('battle_pass_progress').upsert({ ...p, updated_at: new Date().toISOString() }, { onConflict: 'discord_id,season_id' });
}

export function tierFromXP(xp: number, season: Season): number {
  return Math.min(season.tier_count, Math.floor(xp / season.xp_per_tier));
}

/**
 * Grant Battle Pass XP for an activity. Called from award hooks —
 * fail-soft: never throws, never blocks the caller.
 */
export async function grantXP(discordId: string, xp: number): Promise<void> {
  if (xp <= 0) return;
  try {
    const season = await getActiveSeason();
    if (!season) return;
    const now = new Date();
    if (new Date(season.ends_at).getTime() < now.getTime()) return;
    const cur = await getProgress(discordId, season.id);
    cur.xp += xp;
    await upsertProgress(cur);
  } catch (err) {
    log('ERROR', 'Battle Pass grantXP failed', err);
  }
}

export interface ClaimResult {
  claimed: { tier: number; track: 'free' | 'premium'; label: string; pulseAwarded: number }[];
  error?: string;
}

export async function claimPending(discordId: string, client?: Client, guildId?: string): Promise<ClaimResult> {
  const season = await getActiveSeason();
  if (!season) return { claimed: [], error: 'No active season.' };
  const [tiers, progress] = await Promise.all([getTiers(season.id), getProgress(discordId, season.id)]);
  const currentTier = tierFromXP(progress.xp, season);

  const claimed: ClaimResult['claimed'] = [];
  for (const t of tiers) {
    if (t.tier_number > currentTier) break;
    if (!progress.claimed_free.includes(t.tier_number)) {
      const awarded = await grantReward(discordId, t.free_reward_kind, t.free_reward_value, `Battle Pass S${season.id} T${t.tier_number} free`, `bp:${season.id}:${t.tier_number}:free`, client, guildId);
      progress.claimed_free.push(t.tier_number);
      claimed.push({ tier: t.tier_number, track: 'free', label: t.free_reward_label, pulseAwarded: awarded });
    }
    if (progress.is_premium && !progress.claimed_premium.includes(t.tier_number)) {
      const awarded = await grantReward(discordId, t.premium_reward_kind, t.premium_reward_value, `Battle Pass S${season.id} T${t.tier_number} premium`, `bp:${season.id}:${t.tier_number}:premium`, client, guildId);
      progress.claimed_premium.push(t.tier_number);
      claimed.push({ tier: t.tier_number, track: 'premium', label: t.premium_reward_label, pulseAwarded: awarded });
    }
  }
  await upsertProgress(progress);
  return { claimed };
}

async function grantReward(
  discordId: string,
  kind: RewardKind,
  value: Record<string, unknown>,
  reason: string,
  refId: string,
  client?: Client,
  guildId?: string,
): Promise<number> {
  if (kind === 'pulse') {
    const amount = Number(value.amount ?? 0);
    if (amount > 0) await earnPulse(discordId, amount, reason, refId);
    return amount;
  }
  if (kind === 'role') {
    const roleId = String(value.role_id ?? '');
    if (roleId && client && guildId) {
      try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        const member = guild ? await guild.members.fetch(discordId).catch(() => null) : null;
        if (member) await member.roles.add(roleId, `Battle Pass reward — ${reason}`).catch(err => log('ERROR', 'BP role grant failed', err));
      } catch (err) { log('ERROR', 'BP role grant crashed', err); }
    }
    return 0;
  }
  if (kind === 'cosmetic') {
    // Cosmetics live in member_owned_cosmetics — one row per (member, key).
    // Idempotent via upsert so re-claiming after a rollback stays clean.
    const cosmeticKey = String(value.key ?? '');
    const label = String(value.label ?? cosmeticKey);
    if (cosmeticKey) {
      try {
        await supabase.from('member_owned_cosmetics').upsert({
          discord_id: discordId,
          cosmetic_key: cosmeticKey,
          label,
          source: 'battle_pass',
        }, { onConflict: 'discord_id,cosmetic_key' });
        await supabase.from('reward_grants_ledger').insert({
          discord_id: discordId,
          source: 'battle_pass',
          kind: 'cosmetic',
          payload_json: { key: cosmeticKey, label, reason, ref: refId },
        });
      } catch (err) { log('ERROR', 'BP cosmetic grant failed', err); }
    }
    return 0;
  }
  if (kind === 'shop_item') {
    // Shop items granted via BP go straight into the reward ledger with a
    // manual-fulfillment flag. No shop_purchases table today — a Lord fulfills
    // these from the ledger view.
    const itemName = String(value.name ?? '');
    try {
      await supabase.from('reward_grants_ledger').insert({
        discord_id: discordId,
        source: 'battle_pass',
        kind: 'shop_item',
        payload_json: { name: itemName, reason, ref: refId, fulfillment: 'pending' },
      });
    } catch (err) { log('ERROR', 'BP shop_item grant failed', err); }
    return 0;
  }
  if (kind === 'xp_boost') {
    try {
      await supabase.from('reward_grants_ledger').insert({
        discord_id: discordId,
        source: 'battle_pass',
        kind: 'xp_boost',
        payload_json: { value, reason, ref: refId },
      });
    } catch (err) { log('ERROR', 'BP xp_boost grant failed', err); }
    return 0;
  }
  return 0;
}

export async function buyPremium(discordId: string): Promise<{ ok: boolean; error?: string; alreadyOwned?: boolean }> {
  const season = await getActiveSeason();
  if (!season) return { ok: false, error: 'No active season.' };
  const progress = await getProgress(discordId, season.id);
  if (progress.is_premium) return { ok: false, alreadyOwned: true };
  const debit = await spendPulse(discordId, season.premium_price_pulse, `Battle Pass ${season.name} premium`);
  if (!debit.success) return { ok: false, error: debit.error };
  progress.is_premium = true;
  await upsertProgress(progress);
  return { ok: true };
}
