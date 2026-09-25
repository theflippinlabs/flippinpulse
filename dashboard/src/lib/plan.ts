import { supabase } from './supabase';
import { planDefinition, type Plan, type PlanDefinition } from './stripe';

// Read the plan for a guild. Falls back to 'free' when no row exists yet.
// This is the ONE function every feature-gating check should call — never
// query the subscriptions table directly, or the gating logic drifts.

export interface Subscription {
  guild_id: string;
  plan: Plan;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

const cache = new Map<string, { sub: Subscription; ts: number }>();
const TTL_MS = 30_000;

export async function getSubscription(guildId: string): Promise<Subscription> {
  const now = Date.now();
  const hit = cache.get(guildId);
  if (hit && now - hit.ts < TTL_MS) return hit.sub;
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('guild_id', guildId)
    .maybeSingle();
  const sub: Subscription = data
    ? {
        guild_id: guildId,
        plan: (data.plan as Plan) ?? 'free',
        status: (data.status as string) ?? 'active',
        current_period_end: data.current_period_end as string | null,
        cancel_at_period_end: Boolean(data.cancel_at_period_end),
        stripe_customer_id: (data.stripe_customer_id as string | null) ?? null,
        stripe_subscription_id: (data.stripe_subscription_id as string | null) ?? null,
      }
    : {
        guild_id: guildId,
        plan: 'free',
        status: 'active',
        current_period_end: null,
        cancel_at_period_end: false,
        stripe_customer_id: null,
        stripe_subscription_id: null,
      };
  cache.set(guildId, { sub, ts: now });
  return sub;
}

export function invalidatePlanCache(guildId?: string): void {
  if (guildId) cache.delete(guildId);
  else cache.clear();
}

// Feature gating helpers — one place that says "does this plan include X".
// Callers use these in server actions and API routes; never gate on the
// raw plan string outside this file.

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
  multi_server:     ['enterprise'],
  priority_support: ['enterprise'],
  // Base features every plan can use (returning true unconditionally).
  economy:          ['free', 'starter', 'pro', 'enterprise'],
  moderation:       ['free', 'starter', 'pro', 'enterprise'],
  basic_games:      ['free', 'starter', 'pro', 'enterprise'],
};

export function planIncludes(plan: Plan, feature: keyof typeof FEATURE_GATES): boolean {
  return FEATURE_GATES[feature]?.includes(plan) ?? false;
}

export async function guildCan(guildId: string, feature: keyof typeof FEATURE_GATES): Promise<boolean> {
  const sub = await getSubscription(guildId);
  if (sub.status !== 'active' && sub.status !== 'trialing') return planIncludes('free', feature);
  return planIncludes(sub.plan, feature);
}

export function definitionForPlan(plan: Plan): PlanDefinition {
  return planDefinition(plan);
}
