import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { supabase } from '@/lib/supabase';
import { currentGuildId } from '@/lib/guildContext';

export const dynamic = 'force-dynamic';

// Open a Stripe Customer Portal session so the Lord can update card,
// cancel, or change plan without us having to reimplement it.
export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdmin(session.id)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const guildId = currentGuildId();
  const { data } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('guild_id', guildId)
    .maybeSingle();
  const customerId = (data?.stripe_customer_id as string | null) ?? null;
  if (!customerId) return NextResponse.json({ error: 'no_customer' }, { status: 400 });

  const s = stripe();
  const portal = await s.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${req.nextUrl.origin}/dashboard/billing`,
  });
  return NextResponse.json({ url: portal.url });
}
