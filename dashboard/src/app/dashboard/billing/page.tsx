import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { PLANS, type Plan } from '@/lib/stripe';
import { getSubscription } from '@/lib/plan';
import { currentGuildId } from '@/lib/guildContext';
import BillingActions from './BillingActions';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const session = getSession();
  if (!session) redirect('/');
  if (!isAdmin(session.id)) redirect('/app');

  const sub = await getSubscription(currentGuildId());
  const currentPlan = sub.plan as Plan;

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">💳 Billing</h1>
      <p className="text-pulse-mute mb-6 text-sm">
        Manage the Novarys subscription for this Discord server.
      </p>

      <div className="rounded-2xl border border-pulse-gold/40 bg-pulse-gold/5 p-4 mb-6">
        <div className="text-xs uppercase tracking-wider text-pulse-mute">Current plan</div>
        <div className="text-2xl font-bold text-pulse-gold mt-1">
          {PLANS.find(p => p.key === currentPlan)?.label ?? 'Free'}
        </div>
        <div className="text-xs text-pulse-mute mt-1 space-y-0.5">
          <div>Status : <span className={sub.status === 'active' ? 'text-emerald-400' : 'text-red-400'}>{sub.status}</span></div>
          {sub.current_period_end && (
            <div>
              Renews on {new Date(sub.current_period_end).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
              {sub.cancel_at_period_end ? ' (cancellation scheduled)' : ''}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map(p => {
          const isCurrent = p.key === currentPlan;
          return (
            <div
              key={p.key}
              className={`rounded-2xl border p-4 relative ${
                isCurrent
                  ? 'border-pulse-gold bg-pulse-gold/10'
                  : 'border-pulse-border bg-pulse-card'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-bold">{p.label}</h3>
                <div className="text-right">
                  {p.price_monthly_eur > 0 ? (
                    <>
                      <span className="text-2xl font-bold">€{p.price_monthly_eur}</span>
                      <span className="text-xs text-pulse-mute"> / mo</span>
                    </>
                  ) : p.key === 'enterprise' ? (
                    <span className="text-sm text-pulse-gold">Custom</span>
                  ) : (
                    <span className="text-sm text-pulse-mute">Free</span>
                  )}
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-pulse-mute">
                {p.features.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
              {isCurrent && (
                <div className="absolute top-3 right-3 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-pulse-gold text-black font-black">
                  Current
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <BillingActions currentPlan={currentPlan} hasCustomer={Boolean(sub.stripe_customer_id)} />
      </div>
    </main>
  );
}
