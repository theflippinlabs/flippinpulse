import Stripe from 'stripe';

// Server-only. Never import from a 'use client' file.
// STRIPE_SECRET_KEY comes from Vercel env vars.

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set — add it to Vercel env vars before hitting billing endpoints.');
  cached = new Stripe(key, {
    apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
    typescript: true,
  });
  return cached;
}

// The four plans map to Stripe Price IDs stored in env vars. A missing
// price id means the plan is not sellable yet — the /billing page hides it.
export type Plan = 'free' | 'starter' | 'pro' | 'enterprise';

export interface PlanDefinition {
  key: Plan;
  label: string;
  price_monthly_eur: number;
  price_env: string | null;
  features: string[];
  member_cap: number | null;
}

export const PLANS: PlanDefinition[] = [
  {
    key: 'free',
    label: 'Free',
    price_monthly_eur: 0,
    price_env: null,
    features: ['PULSE economy', '3 games', 'Basic moderation', 'Up to 50 members'],
    member_cap: 50,
  },
  {
    key: 'starter',
    label: 'Starter',
    price_monthly_eur: 29,
    price_env: 'STRIPE_PRICE_STARTER',
    features: ['Everything in Free', 'All 13 games', 'Battle Pass', 'Shop', 'AI Automod', 'Up to 500 members'],
    member_cap: 500,
  },
  {
    key: 'pro',
    label: 'Pro',
    price_monthly_eur: 79,
    price_env: 'STRIPE_PRICE_PRO',
    features: [
      'Everything in Starter',
      'Unlimited members',
      'Pets · Trading Cards · Sagas',
      'AI Companion per member',
      'Weekly AI analytics',
      'Streaming alerts (Twitch/YouTube/X)',
    ],
    member_cap: null,
  },
  {
    key: 'enterprise',
    label: 'Enterprise',
    price_monthly_eur: 0,
    price_env: 'STRIPE_PRICE_ENTERPRISE',
    features: ['Everything in Pro', 'White-label branding', 'Multi-server', 'Priority support', 'Dedicated onboarding'],
    member_cap: null,
  },
];

export function planDefinition(plan: Plan): PlanDefinition {
  return PLANS.find(p => p.key === plan) ?? PLANS[0];
}

export function priceIdForPlan(plan: Plan): string | null {
  const def = planDefinition(plan);
  if (!def.price_env) return null;
  return process.env[def.price_env] ?? null;
}
