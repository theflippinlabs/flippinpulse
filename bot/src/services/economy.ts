import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

interface SpendResult {
  success: boolean;
  newBalance: number;
  error?: string;
}

// Atomic spend via the pulse_spend Postgres function. One UPDATE with a
// WHERE balance_pulse >= amount guard means two concurrent spends on the
// same account cannot both succeed on a stale read.
export async function spendPulse(
  discordId: string,
  amount: number,
  reason: string,
  refId?: string
): Promise<SpendResult> {
  const { data, error } = await supabase.rpc('pulse_spend', {
    p_discord_id: discordId,
    p_amount: amount,
    p_reason: reason,
    p_ref_id: refId ?? null,
  });
  if (error) {
    log('ERROR', `pulse_spend rpc failed for ${discordId}`, error);
    return { success: false, newBalance: 0, error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    return {
      success: false,
      newBalance: row?.new_balance ?? 0,
      error: row?.err === 'insufficient_pulse' ? 'Insufficient PULSE'
        : row?.err === 'user_not_found' ? 'User not found'
        : (row?.err ?? 'spend_failed'),
    };
  }
  log('INFO', `PULSE spend: ${discordId} -${amount} (${reason})`);
  return { success: true, newBalance: row.new_balance };
}

export async function grantPulse(
  discordId: string,
  username: string,
  avatarUrl: string | null,
  amount: number,
  reason: string,
  adminId: string
): Promise<SpendResult> {
  if (amount <= 0) return { success: false, newBalance: 0, error: 'Amount must be positive' };

  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse, lifetime_earned_pulse')
    .eq('discord_id', discordId)
    .single();

  const currentBalance = user?.balance_pulse ?? 0;
  const newBalance = currentBalance + amount;

  await supabase.from('discord_users').upsert({
    discord_id: discordId,
    username,
    avatar_url: avatarUrl,
    balance_pulse: newBalance,
    lifetime_earned_pulse: (user?.lifetime_earned_pulse ?? 0) + amount,
  }, { onConflict: 'discord_id' });

  await supabase.from('pulse_transactions').insert({
    discord_id: discordId,
    type: 'ADMIN_GRANT',
    amount,
    reason,
    ref_id: adminId,
    balance_after: newBalance,
  });

  log('INFO', `PULSE admin grant: ${adminId} -> ${discordId} +${amount} (${reason})`);
  return { success: true, newBalance };
}

export async function revokePulse(
  discordId: string,
  amount: number,
  reason: string,
  adminId: string
): Promise<SpendResult> {
  if (amount <= 0) return { success: false, newBalance: 0, error: 'Amount must be positive' };

  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse')
    .eq('discord_id', discordId)
    .single();

  if (!user) return { success: false, newBalance: 0, error: 'User has no account yet' };

  const newBalance = Math.max(0, user.balance_pulse - amount);
  const removed = user.balance_pulse - newBalance;

  await supabase
    .from('discord_users')
    .update({ balance_pulse: newBalance })
    .eq('discord_id', discordId);

  await supabase.from('pulse_transactions').insert({
    discord_id: discordId,
    type: 'ADMIN_REVOKE',
    amount: -removed,
    reason,
    ref_id: adminId,
    balance_after: newBalance,
  });

  log('INFO', `PULSE admin revoke: ${adminId} -> ${discordId} -${removed} (${reason})`);
  return { success: true, newBalance };
}

export async function setPulse(
  discordId: string,
  username: string,
  avatarUrl: string | null,
  amount: number,
  reason: string,
  adminId: string
): Promise<SpendResult> {
  if (amount < 0) return { success: false, newBalance: 0, error: 'Amount cannot be negative' };

  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse')
    .eq('discord_id', discordId)
    .single();

  const delta = amount - (user?.balance_pulse ?? 0);

  await supabase.from('discord_users').upsert({
    discord_id: discordId,
    username,
    avatar_url: avatarUrl,
    balance_pulse: amount,
  }, { onConflict: 'discord_id' });

  await supabase.from('pulse_transactions').insert({
    discord_id: discordId,
    type: delta >= 0 ? 'ADMIN_GRANT' : 'ADMIN_REVOKE',
    amount: delta,
    reason,
    ref_id: adminId,
    balance_after: amount,
  });

  log('INFO', `PULSE admin set: ${adminId} -> ${discordId} = ${amount} (${reason})`);
  return { success: true, newBalance: amount };
}

// Atomic earn — inserts the row if missing (upsert semantics inside the
// RPC) and adds to the balance in one write.
export async function creditPulse(
  discordId: string,
  username: string,
  avatarUrl: string | null,
  amount: number,
  reason: string
): Promise<number> {
  if (amount <= 0) return 0;
  const { data, error } = await supabase.rpc('pulse_earn', {
    p_discord_id: discordId,
    p_amount: amount,
    p_reason: reason,
    p_ref_id: null,
    p_type: 'EARN_EVENT',
    p_username: username,
    p_avatar_url: avatarUrl,
  });
  if (error) {
    log('ERROR', `pulse_earn (credit) rpc failed for ${discordId}`, error);
    return 0;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row?.new_balance ?? 0;
}

export async function getBalance(discordId: string): Promise<{
  balance: number;
  earned: number;
  spent: number;
} | null> {
  const { data } = await supabase
    .from('discord_users')
    .select('balance_pulse, lifetime_earned_pulse, lifetime_spent_pulse')
    .eq('discord_id', discordId)
    .single();

  if (!data) return null;
  return {
    balance: data.balance_pulse ?? 0,
    earned: data.lifetime_earned_pulse ?? 0,
    spent: data.lifetime_spent_pulse ?? 0,
  };
}
