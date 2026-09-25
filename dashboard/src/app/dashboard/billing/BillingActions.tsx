'use client';

import { useState } from 'react';
import type { Plan } from '@/lib/stripe';

interface Props {
  currentPlan: Plan;
  hasCustomer: boolean;
}

export default function BillingActions({ currentPlan, hasCustomer }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pick(plan: Plan) {
    setBusy(plan); setErr(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? 'checkout_failed');
      window.location.href = data.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy('portal'); setErr(null);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? 'portal_failed');
      window.location.href = data.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {err && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs">{err}</div>}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => pick('starter')}
          disabled={busy !== null || currentPlan === 'starter'}
          className="rounded-xl bg-pulse-gold text-black font-bold py-2.5 disabled:opacity-60"
        >
          {busy === 'starter' ? '…' : currentPlan === 'starter' ? 'Current' : 'Upgrade to Starter'}
        </button>
        <button
          onClick={() => pick('pro')}
          disabled={busy !== null || currentPlan === 'pro'}
          className="rounded-xl bg-pulse-gold text-black font-bold py-2.5 disabled:opacity-60"
        >
          {busy === 'pro' ? '…' : currentPlan === 'pro' ? 'Current' : 'Upgrade to Pro'}
        </button>
      </div>
      {hasCustomer && (
        <button
          onClick={openPortal}
          disabled={busy !== null}
          className="w-full rounded-xl bg-pulse-card border border-pulse-border py-2.5 text-sm font-semibold"
        >
          {busy === 'portal' ? '…' : 'Manage billing / cancel'}
        </button>
      )}
    </div>
  );
}
