-- ============================================================
-- Sprint 3.2 (Stripe): billing subscriptions.
--
-- One row per Discord guild that has a Stripe customer. The bot and
-- the dashboard read this to gate premium features (Battle Pass
-- premium tracks, AI companion depth, Weekly analytics, streaming
-- alerts limits, etc).
--
-- Plans (stored as text, not enum, so we can add tiers without a
-- migration):
--   free       — no Stripe customer, default fallback
--   starter    — €29 / mo, up to 500 members
--   pro        — €79 / mo, unlimited members + full economy
--   enterprise — custom, white-label
--
-- Stripe webhook writes this table via the service_role client on
-- checkout.session.completed / customer.subscription.updated /
-- customer.subscription.deleted.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  guild_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON public.subscriptions(plan);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'subscriptions_service_all') THEN
    CREATE POLICY subscriptions_service_all ON public.subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;

-- Audit trail — every raw Stripe webhook we receive (deduped by event_id).
CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stripe_events' AND policyname = 'stripe_events_service_all') THEN
    CREATE POLICY stripe_events_service_all ON public.stripe_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END$$;
