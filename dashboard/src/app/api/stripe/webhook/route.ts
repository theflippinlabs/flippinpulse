import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { invalidatePlanCache } from '@/lib/plan';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Stripe webhook receiver. Signature is verified with STRIPE_WEBHOOK_SECRET
// (obtained from the Stripe Dashboard → Developers → Webhooks after adding
// this endpoint URL). Events we care about:
//   checkout.session.completed          — first payment landed, insert row
//   customer.subscription.updated       — plan change, renew, cancel-at-end
//   customer.subscription.deleted       — sub really canceled → downgrade
//   invoice.payment_failed              — mark status past_due
//
// Every raw event is logged into stripe_events (event_id primary key) so a
// duplicate delivery is a no-op and we have an audit trail.

async function upsertSubscription(guildId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('subscriptions').upsert({
    guild_id: guildId,
    ...patch,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'guild_id' });
  if (error) throw error;
  invalidatePlanCache(guildId);
}

function guildIdFromSubscription(sub: Stripe.Subscription): string | null {
  const meta = sub.metadata ?? {};
  return meta.guild_id ?? null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'webhook_not_configured' }, { status: 503 });

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'missing_signature' }, { status: 400 });

  const raw = await req.text();
  const s = stripe();
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }

  // Dedupe: skip if we've already processed this event id.
  const { data: prior } = await supabase
    .from('stripe_events').select('event_id').eq('event_id', event.id).maybeSingle();
  if (prior) return NextResponse.json({ ok: true, deduped: true });
  await supabase.from('stripe_events').insert({
    event_id: event.id, type: event.type, payload_json: event as unknown as object,
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const cs = event.data.object as Stripe.Checkout.Session;
        const guildId = cs.metadata?.guild_id;
        const plan = cs.metadata?.plan ?? 'starter';
        if (!guildId) break;
        const subId = typeof cs.subscription === 'string' ? cs.subscription : cs.subscription?.id ?? null;
        const customerId = typeof cs.customer === 'string' ? cs.customer : cs.customer?.id ?? null;
        await upsertSubscription(guildId, {
          plan, status: 'active',
          stripe_customer_id: customerId,
          stripe_subscription_id: subId,
        });
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        const guildId = guildIdFromSubscription(sub);
        if (!guildId) break;
        const plan = (sub.metadata?.plan as string | undefined) ?? 'starter';
        // The current_period_end lives on the Subscription per Stripe schema.
        const cpe = (sub as unknown as { current_period_end?: number }).current_period_end;
        const trialEnd = (sub as unknown as { trial_end?: number | null }).trial_end;
        await upsertSubscription(guildId, {
          plan,
          status: sub.status,
          current_period_end: cpe ? new Date(cpe * 1000).toISOString() : null,
          trial_end: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
          cancel_at_period_end: sub.cancel_at_period_end,
          stripe_subscription_id: sub.id,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const guildId = guildIdFromSubscription(sub);
        if (!guildId) break;
        await upsertSubscription(guildId, {
          plan: 'free', status: 'canceled', cancel_at_period_end: false,
        });
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const subId = (inv as unknown as { subscription?: string | Stripe.Subscription }).subscription;
        if (!subId) break;
        const sub = await s.subscriptions.retrieve(typeof subId === 'string' ? subId : subId.id);
        const guildId = guildIdFromSubscription(sub);
        if (!guildId) break;
        await upsertSubscription(guildId, { status: 'past_due' });
        break;
      }
      default:
        // No-op — event stored for audit, nothing to do.
        break;
    }
  } catch (err) {
    return NextResponse.json({ error: 'handler_failed', detail: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
