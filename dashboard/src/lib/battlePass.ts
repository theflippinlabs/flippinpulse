import { supabase } from './supabase';

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

export function tierFromXP(xp: number, season: Season): number {
  return Math.min(season.tier_count, Math.floor(xp / season.xp_per_tier));
}

export async function loadSeasonWithTiersAndProgress(discordId: string) {
  const { data: season } = await supabase
    .from('battle_pass_seasons')
    .select('*')
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!season) return null;
  const [{ data: tiers }, { data: prog }] = await Promise.all([
    supabase.from('battle_pass_tiers').select('*').eq('season_id', season.id).order('tier_number', { ascending: true }),
    supabase.from('battle_pass_progress').select('*').eq('discord_id', discordId).eq('season_id', season.id).maybeSingle(),
  ]);
  return {
    season: season as Season,
    tiers: (tiers ?? []) as Tier[],
    progress: (prog as Progress) ?? {
      discord_id: discordId, season_id: season.id, xp: 0, is_premium: false, claimed_free: [], claimed_premium: [],
    },
  };
}

async function upsertProgress(p: Progress): Promise<void> {
  await supabase
    .from('battle_pass_progress')
    .upsert({ ...p, updated_at: new Date().toISOString() }, { onConflict: 'discord_id,season_id' });
}

export interface ClaimSummary { tier: number; track: 'free' | 'premium'; label: string; pulseAwarded: number; }

async function creditPulse(discordId: string, amount: number, reason: string, refId: string): Promise<void> {
  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse, lifetime_earned_pulse')
    .eq('discord_id', discordId)
    .single();
  const bal = (user?.balance_pulse ?? 0) + amount;
  await supabase.from('discord_users').update({
    balance_pulse: bal,
    lifetime_earned_pulse: (user?.lifetime_earned_pulse ?? 0) + amount,
  }).eq('discord_id', discordId);
  await supabase.from('pulse_transactions').insert({
    discord_id: discordId, type: 'EARN_EVENT', amount, reason, ref_id: refId, balance_after: bal,
  });
}

export async function claimPending(discordId: string): Promise<{ claimed: ClaimSummary[]; error?: string }> {
  const bundle = await loadSeasonWithTiersAndProgress(discordId);
  if (!bundle) return { claimed: [], error: 'No active season.' };
  const { season, tiers, progress } = bundle;
  const currentTier = tierFromXP(progress.xp, season);

  const claimed: ClaimSummary[] = [];
  for (const t of tiers) {
    if (t.tier_number > currentTier) break;
    if (!progress.claimed_free.includes(t.tier_number)) {
      const amt = await grantNonPulseOrPulse(discordId, t.free_reward_kind, t.free_reward_value, `Battle Pass S${season.id} T${t.tier_number} free`, `bp:${season.id}:${t.tier_number}:free`);
      claimed.push({ tier: t.tier_number, track: 'free', label: t.free_reward_label, pulseAwarded: amt });
      progress.claimed_free.push(t.tier_number);
    }
    if (progress.is_premium && !progress.claimed_premium.includes(t.tier_number)) {
      const amt = await grantNonPulseOrPulse(discordId, t.premium_reward_kind, t.premium_reward_value, `Battle Pass S${season.id} T${t.tier_number} premium`, `bp:${season.id}:${t.tier_number}:premium`);
      claimed.push({ tier: t.tier_number, track: 'premium', label: t.premium_reward_label, pulseAwarded: amt });
      progress.claimed_premium.push(t.tier_number);
    }
  }
  await upsertProgress(progress);
  return { claimed };
}

async function grantNonPulseOrPulse(
  discordId: string,
  kind: RewardKind,
  value: Record<string, unknown>,
  reason: string,
  refId: string,
): Promise<number> {
  if (kind === 'pulse') {
    const amt = Number(value.amount ?? 0);
    if (amt > 0) await creditPulse(discordId, amt, reason, refId);
    return amt;
  }
  if (kind === 'cosmetic') {
    const cosmeticKey = String(value.key ?? '');
    const label = String(value.label ?? cosmeticKey);
    if (cosmeticKey) {
      await supabase.from('member_owned_cosmetics').upsert({
        discord_id: discordId, cosmetic_key: cosmeticKey, label, source: 'battle_pass',
      }, { onConflict: 'discord_id,cosmetic_key' });
    }
    await supabase.from('reward_grants_ledger').insert({
      discord_id: discordId, source: 'battle_pass', kind: 'cosmetic',
      payload_json: { key: cosmeticKey, label, reason, ref: refId },
    });
    return 0;
  }
  // role / shop_item / xp_boost — the web has no Discord client, so we queue
  // the intent in the ledger. The bot process reconciles.
  await supabase.from('reward_grants_ledger').insert({
    discord_id: discordId, source: 'battle_pass', kind,
    payload_json: { value, reason, ref: refId, fulfillment: kind === 'shop_item' ? 'pending' : 'web_queued' },
  });
  return 0;
}

export async function buyPremium(discordId: string): Promise<{ ok: boolean; error?: string; alreadyOwned?: boolean }> {
  const bundle = await loadSeasonWithTiersAndProgress(discordId);
  if (!bundle) return { ok: false, error: 'No active season.' };
  const { season, progress } = bundle;
  if (progress.is_premium) return { ok: false, alreadyOwned: true };
  const { data: user } = await supabase.from('discord_users').select('balance_pulse, lifetime_spent_pulse').eq('discord_id', discordId).single();
  const bal = user?.balance_pulse ?? 0;
  if (bal < season.premium_price_pulse) return { ok: false, error: 'Insufficient PULSE' };
  const newBal = bal - season.premium_price_pulse;
  await supabase.from('discord_users').update({
    balance_pulse: newBal,
    lifetime_spent_pulse: (user?.lifetime_spent_pulse ?? 0) + season.premium_price_pulse,
  }).eq('discord_id', discordId);
  await supabase.from('pulse_transactions').insert({
    discord_id: discordId, type: 'SPEND_SHOP', amount: -season.premium_price_pulse,
    reason: `Battle Pass ${season.name} premium`, balance_after: newBal,
  });
  progress.is_premium = true;
  await upsertProgress(progress);
  return { ok: true };
}
