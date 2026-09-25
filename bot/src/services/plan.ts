import { supabase } from '../supabase.js';
import { config } from '../config.js';

// Bot-side counterpart of dashboard/src/lib/plan.ts. Every feature that
// should be plan-gated (Pets, Cards, Sagas, AI companion, Streaming alerts,
// Weekly analytics) calls guildCan(guildId, feature) before running.

export type Plan = 'free' | 'starter' | 'pro' | 'enterprise';

const FEATURE_GATES: Record<string, Plan[]> = {
  battle_pass:      ['starter', 'pro', 'enterprise'],
  shop:             ['starter', 'pro', 'enterprise'],
  ai_automod:       ['starter', 'pro', 'enterprise'],
  pets:             ['pro', 'enterprise'],
  trading_cards:    ['pro', 'enterprise'],
  sagas:            ['pro', 'enterprise'],
  ai_companion:     ['pro', 'enterprise'],
  weekly_analytics: ['pro', 'enterprise'],
  streaming_alerts: ['pro', 'enterprise'],
  white_label:      ['enterprise'],
  economy:          ['free', 'starter', 'pro', 'enterprise'],
  moderation:       ['free', 'starter', 'pro', 'enterprise'],
  basic_games:      ['free', 'starter', 'pro', 'enterprise'],
};

const cache = new Map<string, { plan: Plan; status: string; ts: number }>();
const TTL_MS = 30_000;

export async function getPlan(guildId?: string | null): Promise<{ plan: Plan; status: string }> {
  const g = guildId || config.GUILD_ID || 'default';
  const now = Date.now();
  const hit = cache.get(g);
  if (hit && now - hit.ts < TTL_MS) return { plan: hit.plan, status: hit.status };
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('guild_id', g)
    .maybeSingle();
  const plan = ((data?.plan as Plan | undefined) ?? 'free') as Plan;
  const status = (data?.status as string | undefined) ?? 'active';
  cache.set(g, { plan, status, ts: now });
  return { plan, status };
}

export async function guildCan(guildId: string | null | undefined, feature: keyof typeof FEATURE_GATES): Promise<boolean> {
  const { plan, status } = await getPlan(guildId);
  if (status !== 'active' && status !== 'trialing') return FEATURE_GATES[feature]?.includes('free') ?? false;
  return FEATURE_GATES[feature]?.includes(plan) ?? false;
}

export function invalidatePlanCache(guildId?: string): void {
  if (guildId) cache.delete(guildId);
  else cache.clear();
}
