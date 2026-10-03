-- ============================================================
-- Fix: cast p_type / literal transaction kinds to pulse_tx_type
-- inside the atomic PULSE RPCs.
--
-- The 20260924120000 migration inserted p_type (declared TEXT) directly
-- into pulse_transactions.type (enum pulse_tx_type). Postgres does not
-- implicitly cast a text VARIABLE to an enum on INSERT — only a text
-- LITERAL — so any call to pulse_spend / pulse_earn / pulse_settle_bet
-- failed with:
--   column "type" is of type pulse_tx_type but expression is of type text
--
-- This migration replaces the three functions with an explicit
-- ::pulse_tx_type cast on every insert, and adds a friendlier error
-- if the caller sends an unknown enum value.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pulse_spend(
  p_discord_id TEXT,
  p_amount INT,
  p_reason TEXT,
  p_ref_id TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'SPEND_SHOP'
) RETURNS TABLE(ok BOOLEAN, new_balance INT, err TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new  INT;
  v_type public.pulse_tx_type;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0, 'bad_amount'::TEXT;
    RETURN;
  END IF;

  BEGIN
    v_type := p_type::public.pulse_tx_type;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN QUERY SELECT false, 0, 'bad_type'::TEXT;
    RETURN;
  END;

  UPDATE public.discord_users
     SET balance_pulse = balance_pulse - p_amount,
         lifetime_spent_pulse = COALESCE(lifetime_spent_pulse, 0) + p_amount
   WHERE discord_id = p_discord_id
     AND balance_pulse >= p_amount
  RETURNING balance_pulse INTO v_new;

  IF v_new IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.discord_users WHERE discord_id = p_discord_id) THEN
      RETURN QUERY SELECT false, 0, 'user_not_found'::TEXT;
    ELSE
      RETURN QUERY SELECT false,
        COALESCE((SELECT balance_pulse FROM public.discord_users WHERE discord_id = p_discord_id), 0),
        'insufficient_pulse'::TEXT;
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.pulse_transactions(discord_id, type, amount, reason, ref_id, balance_after)
  VALUES (p_discord_id, v_type, -p_amount, p_reason, p_ref_id, v_new);

  RETURN QUERY SELECT true, v_new, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.pulse_earn(
  p_discord_id TEXT,
  p_amount INT,
  p_reason TEXT,
  p_ref_id TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'EARN_EVENT',
  p_username TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL
) RETURNS TABLE(new_balance INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new  INT;
  v_type public.pulse_tx_type;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT COALESCE(
      (SELECT balance_pulse FROM public.discord_users WHERE discord_id = p_discord_id),
      0);
    RETURN;
  END IF;

  BEGIN
    v_type := p_type::public.pulse_tx_type;
  EXCEPTION WHEN invalid_text_representation THEN
    -- Fall back to a safe default rather than losing the credit.
    v_type := 'EARN_EVENT'::public.pulse_tx_type;
  END;

  INSERT INTO public.discord_users(discord_id, username, avatar_url, balance_pulse, lifetime_earned_pulse)
  VALUES (p_discord_id, p_username, p_avatar_url, p_amount, p_amount)
  ON CONFLICT (discord_id) DO UPDATE
     SET balance_pulse = public.discord_users.balance_pulse + p_amount,
         lifetime_earned_pulse = COALESCE(public.discord_users.lifetime_earned_pulse, 0) + p_amount,
         username = COALESCE(EXCLUDED.username, public.discord_users.username),
         avatar_url = COALESCE(EXCLUDED.avatar_url, public.discord_users.avatar_url)
  RETURNING public.discord_users.balance_pulse INTO v_new;

  INSERT INTO public.pulse_transactions(discord_id, type, amount, reason, ref_id, balance_after)
  VALUES (p_discord_id, v_type, p_amount, p_reason, p_ref_id, v_new);

  RETURN QUERY SELECT v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.pulse_settle_bet(
  p_discord_id TEXT,
  p_game_key TEXT,
  p_bet INT,
  p_payout INT
) RETURNS TABLE(ok BOOLEAN, new_balance INT, err TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_before INT;
  v_new    INT;
BEGIN
  IF p_bet IS NULL OR p_bet < 0 OR p_payout IS NULL OR p_payout < 0 THEN
    RETURN QUERY SELECT false, 0, 'bad_amount'::TEXT;
    RETURN;
  END IF;

  UPDATE public.discord_users
     SET balance_pulse = balance_pulse - p_bet + p_payout,
         lifetime_spent_pulse = COALESCE(lifetime_spent_pulse, 0) + p_bet,
         lifetime_earned_pulse = COALESCE(lifetime_earned_pulse, 0) + p_payout
   WHERE discord_id = p_discord_id
     AND balance_pulse >= p_bet
  RETURNING balance_pulse - p_payout, balance_pulse INTO v_before, v_new;

  IF v_new IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.discord_users WHERE discord_id = p_discord_id) THEN
      RETURN QUERY SELECT false, 0, 'user_not_found'::TEXT;
    ELSE
      RETURN QUERY SELECT false,
        COALESCE((SELECT balance_pulse FROM public.discord_users WHERE discord_id = p_discord_id), 0),
        'insufficient_pulse'::TEXT;
    END IF;
    RETURN;
  END IF;

  IF p_bet > 0 THEN
    INSERT INTO public.pulse_transactions(discord_id, type, amount, reason, balance_after)
    VALUES (p_discord_id, 'SPEND_SHOP'::public.pulse_tx_type, -p_bet, 'Dashboard play: ' || p_game_key, v_before);
  END IF;
  IF p_payout > 0 THEN
    INSERT INTO public.pulse_transactions(discord_id, type, amount, reason, balance_after)
    VALUES (p_discord_id, 'EARN_EVENT'::public.pulse_tx_type, p_payout, 'Dashboard win: ' || p_game_key, v_new);
  END IF;

  RETURN QUERY SELECT true, v_new, NULL::TEXT;
END;
$$;
