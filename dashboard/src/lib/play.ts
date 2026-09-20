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

// Apply a bet: deduct bet from balance, credit payout. Returns new balance.
// Records the transaction line for auditability.
export async function settleBet(
  discordId: string,
  gameKey: string,
  bet: number,
  payout: number,
): Promise<{ ok: true; newBalance: number } | { ok: false; error: string; balance: number }> {
  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse, lifetime_earned_pulse, lifetime_spent_pulse')
    .eq('discord_id', discordId)
    .maybeSingle();

  if (!user) return { ok: false, error: 'Member not tracked yet — send a message in Discord first.', balance: 0 };

  const cur = (user as { balance_pulse?: number }).balance_pulse ?? 0;
  if (cur < bet) return { ok: false, error: 'Not enough PULSE.', balance: cur };

  const newBalance = cur - bet + payout;
  const lifetimeSpent = ((user as { lifetime_spent_pulse?: number }).lifetime_spent_pulse ?? 0) + bet;
  const lifetimeEarned = ((user as { lifetime_earned_pulse?: number }).lifetime_earned_pulse ?? 0) + payout;

  await supabase.from('discord_users').update({
    balance_pulse: newBalance,
    lifetime_spent_pulse: lifetimeSpent,
    lifetime_earned_pulse: lifetimeEarned,
  }).eq('discord_id', discordId);

  // Debit + credit as two lines for a clean transaction history.
  if (bet > 0) {
    await supabase.from('pulse_transactions').insert({
      discord_id: discordId,
      type: 'SPEND_SHOP',
      amount: -bet,
      reason: `Dashboard play: ${gameKey}`,
      balance_after: cur - bet,
    });
  }
  if (payout > 0) {
    await supabase.from('pulse_transactions').insert({
      discord_id: discordId,
      type: 'EARN_EVENT',
      amount: payout,
      reason: `Dashboard win: ${gameKey}`,
      balance_after: newBalance,
    });
  }

  return { ok: true, newBalance };
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
