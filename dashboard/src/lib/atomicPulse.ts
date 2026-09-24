import { supabase } from './supabase';

// Thin wrappers around the atomic pulse_spend / pulse_earn Postgres
// functions. Callers must go through these — never touch discord_users.
// balance_pulse directly, or the concurrency guarantee is gone.

export interface SpendResult {
  ok: boolean;
  newBalance: number;
  error?: string;
}

export async function atomicSpend(
  discordId: string,
  amount: number,
  reason: string,
  refId?: string | null,
  type: string = 'SPEND_SHOP',
): Promise<SpendResult> {
  const { data, error } = await supabase.rpc('pulse_spend', {
    p_discord_id: discordId,
    p_amount: Math.max(0, Math.floor(amount)),
    p_reason: reason,
    p_ref_id: refId ?? null,
    p_type: type,
  });
  if (error) return { ok: false, newBalance: 0, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    return {
      ok: false,
      newBalance: row?.new_balance ?? 0,
      error: row?.err ?? 'spend_failed',
    };
  }
  return { ok: true, newBalance: row.new_balance };
}

export async function atomicEarn(
  discordId: string,
  amount: number,
  reason: string,
  refId?: string | null,
  type: string = 'EARN_EVENT',
): Promise<number> {
  if (amount <= 0) return 0;
  const { data, error } = await supabase.rpc('pulse_earn', {
    p_discord_id: discordId,
    p_amount: Math.floor(amount),
    p_reason: reason,
    p_ref_id: refId ?? null,
    p_type: type,
    p_username: null,
    p_avatar_url: null,
  });
  if (error) return 0;
  const row = Array.isArray(data) ? data[0] : data;
  return row?.new_balance ?? 0;
}
