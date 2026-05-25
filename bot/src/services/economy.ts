import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

interface SpendResult {
  success: boolean;
  newBalance: number;
  error?: string;
}

export async function spendPulse(
  discordId: string,
  amount: number,
  reason: string,
  refId?: string
): Promise<SpendResult> {
  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse, lifetime_spent_pulse')
    .eq('discord_id', discordId)
    .single();

  if (!user) return { success: false, newBalance: 0, error: 'User not found' };
  if (user.balance_pulse < amount) {
    return { success: false, newBalance: user.balance_pulse, error: 'Insufficient PULSE' };
  }

  const newBalance = user.balance_pulse - amount;

  await supabase
    .from('discord_users')
    .update({
      balance_pulse: newBalance,
      lifetime_spent_pulse: (user.lifetime_spent_pulse ?? 0) + amount,
    })
    .eq('discord_id', discordId);

  await supabase.from('pulse_transactions').insert({
    discord_id: discordId,
    type: 'SPEND_SHOP',
    amount: -amount,
    reason,
    ref_id: refId,
    balance_after: newBalance,
  });

  log('INFO', `PULSE spend: ${discordId} -${amount} (${reason})`);
  return { success: true, newBalance };
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
