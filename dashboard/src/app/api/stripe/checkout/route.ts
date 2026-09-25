import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { stripe, priceIdForPlan, type Plan } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { currentGuildId } from '@/lib/guildContext';

export const dynamic = 'force-dynamic';

// Start a Stripe Checkout session for the current guild's Lord. The Lord
// picks a plan on the dashboard's /billing page, we look up the price id
// for that plan, and hand Stripe a session that lets them pay + auto-links
// the subscription back to their guild.
export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdmin(session.id)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const plan = String(body.plan ?? '') as Plan;
  if (plan !== 'starter' && plan !== 'pro') {
    return NextResponse.json({ error: 'bad_plan' }, { status: 400 });
  }
  const priceId = priceIdForPlan(plan);
  if (!priceId) return NextResponse.json({ error: 'plan_not_configured' }, { status: 503 });

  const guildId = currentGuildId();
  const origin = req.nextUrl.origin;

  // Reuse an existing Stripe customer if we've already created one for
  // this guild — Stripe complains if we register the same email twice.
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('guild_id', guildId)
    .maybeSingle();

  const s = stripe();
  const checkout = await s.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    // guild_id in metadata is how the webhook links the sub back to us.
    subscription_data: {
      metadata: { guild_id: guildId, plan },
    },
    metadata: { guild_id: guildId, plan },
    success_url: `${origin}/dashboard/billing?success=1`,
    cancel_url: `${origin}/dashboard/billing?canceled=1`,
    customer: existing?.stripe_customer_id ?? undefined,
    customer_email: existing?.stripe_customer_id ? undefined : session.username + '@discord.local',
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: checkout.url });
}
