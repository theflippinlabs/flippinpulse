
-- Pulse wallet per discord user
ALTER TABLE public.discord_users
  ADD COLUMN IF NOT EXISTS balance_pulse INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_earned_pulse INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_spent_pulse INTEGER NOT NULL DEFAULT 0;

-- Shop item categories enum
CREATE TYPE public.shop_item_category AS ENUM ('role', 'perk', 'ticket', 'cosmetic', 'irl');

-- Shop items
CREATE TABLE public.shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category shop_item_category NOT NULL DEFAULT 'perk',
  price_pulse INTEGER NOT NULL DEFAULT 0,
  stock_total INTEGER, -- NULL = unlimited
  stock_remaining INTEGER, -- NULL = unlimited
  max_per_user INTEGER DEFAULT 1,
  cooldown_hours INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_limited_drop BOOLEAN NOT NULL DEFAULT false,
  available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ,
  image_url TEXT,
  metadata_json JSONB DEFAULT '{}', -- e.g. discord_role_id, duration_hours, etc.
  auto_apply BOOLEAN NOT NULL DEFAULT true, -- false = manual fulfillment needed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage shop items" ON public.shop_items FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view shop items" ON public.shop_items FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_shop_items_updated_at
  BEFORE UPDATE ON public.shop_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Transaction types enum
CREATE TYPE public.pulse_tx_type AS ENUM (
  'EARN_MISSION', 'EARN_VOICE', 'EARN_EVENT',
  'ADMIN_GRANT', 'ADMIN_REVOKE',
  'SPEND_SHOP', 'REFUND'
);

-- Pulse transactions (immutable ledger)
CREATE TABLE public.pulse_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  type pulse_tx_type NOT NULL,
  amount INTEGER NOT NULL, -- positive = credit, negative = debit
  reason TEXT,
  ref_id TEXT, -- reference to mission_id, item_id, order_id, etc.
  balance_after INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pulse_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage pulse transactions" ON public.pulse_transactions FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view pulse transactions" ON public.pulse_transactions FOR SELECT TO authenticated USING (true);

-- Orders (for manual fulfillment items)
CREATE TYPE public.order_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED');

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  status order_status NOT NULL DEFAULT 'PENDING',
  notes TEXT,
  admin_notes TEXT,
  pulse_spent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage orders" ON public.orders FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view orders" ON public.orders FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User purchases tracking (for max_per_user / cooldown)
CREATE TABLE public.user_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ, -- for temporary perks/roles
  is_active BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage user purchases" ON public.user_purchases FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can view user purchases" ON public.user_purchases FOR SELECT TO authenticated USING (true);

-- Economy settings
INSERT INTO public.settings (key, value_json) VALUES
  ('economy', '{"daily_pulse_cap": 500, "pulse_per_mission_daily": 15, "pulse_per_mission_weekly": 50, "pulse_per_mission_flash": 30, "pulse_per_voice_minute": 0.5, "pulse_hour_multiplier": 2, "refund_enabled": false}')
ON CONFLICT (key) DO NOTHING;
