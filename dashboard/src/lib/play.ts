import { supabase } from './supabase';

// Fetch balance for a member.
export async function getBalance(discordId: string): Promise<number> {
  const { data } = await supabase
    .from('discord_users')
    .select('balance_pulse')
    .eq('discord_id', discordId)
    .maybeSingle();
  return (data as { balance_pulse?: number } | null)?.balance_pulse ?? 0;
}

// Apply a bet atomically via the pulse_settle_bet Postgres function. One
// UPDATE with `balance_pulse >= bet` guard collapses the whole flow into
// a single write — two concurrent HTTP bets on the same account cannot
// both succeed on a stale read (previous JS implementation was race-y).
export async function settleBet(
  discordId: string,
  gameKey: string,
  bet: number,
  payout: number,
): Promise<{ ok: true; newBalance: number } | { ok: false; error: string; balance: number }> {
  const { data, error } = await supabase.rpc('pulse_settle_bet', {
    p_discord_id: discordId,
    p_game_key: gameKey,
    p_bet: Math.max(0, Math.floor(bet)),
    p_payout: Math.max(0, Math.floor(payout)),
  });
  if (error) {
    return { ok: false, error: error.message, balance: 0 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    const err = row?.err;
    const msg = err === 'insufficient_pulse' ? 'Not enough PULSE.'
      : err === 'user_not_found' ? 'Member not tracked yet — send a message in Discord first.'
      : err === 'bad_amount' ? 'Invalid bet.'
      : (err ?? 'settle_failed');
    return { ok: false, error: msg, balance: row?.new_balance ?? 0 };
  }
  return { ok: true, newBalance: row.new_balance };
}

export function pickWeighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
