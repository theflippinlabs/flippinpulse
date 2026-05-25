import { supabase } from '../supabase.js';
import { currentGuildId } from '../guildContext.js';
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
  const guildId = currentGuildId();
  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse, lifetime_spent_pulse')
    .eq('guild_id', guildId)
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
    .eq('guild_id', guildId)
    .eq('discord_id', discordId);

  await supabase.from('pulse_transactions').insert({
    guild_id: guildId,
    discord_id: discordId,
    type: 'SPEND_SHOP',
    amount: -amount,
    reason,
    ref_id: refId,
    balance_after: newBalance,
  });

  log('INFO', `PULSE spend: ${guildId}/${discordId} -${amount} (${reason})`);
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
  const guildId = currentGuildId();

  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse, lifetime_earned_pulse')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .single();

  const newBalance = (user?.balance_pulse ?? 0) + amount;

  await supabase.from('discord_users').upsert({
    guild_id: guildId,
    discord_id: discordId,
    username,
    avatar_url: avatarUrl,
    balance_pulse: newBalance,
    lifetime_earned_pulse: (user?.lifetime_earned_pulse ?? 0) + amount,
  }, { onConflict: 'guild_id,discord_id' });

  await supabase.from('pulse_transactions').insert({
    guild_id: guildId,
    discord_id: discordId,
    type: 'ADMIN_GRANT',
    amount,
    reason,
    ref_id: adminId,
    balance_after: newBalance,
  });

  log('INFO', `PULSE admin grant: ${adminId} -> ${guildId}/${discordId} +${amount} (${reason})`);
  return { success: true, newBalance };
}

export async function revokePulse(
  discordId: string,
  amount: number,
  reason: string,
  adminId: string
): Promise<SpendResult> {
  if (amount <= 0) return { success: false, newBalance: 0, error: 'Amount must be positive' };
  const guildId = currentGuildId();

  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .single();

  if (!user) return { success: false, newBalance: 0, error: 'User has no account yet' };

  const newBalance = Math.max(0, user.balance_pulse - amount);
  const removed = user.balance_pulse - newBalance;

  await supabase
    .from('discord_users')
    .update({ balance_pulse: newBalance })
    .eq('guild_id', guildId)
    .eq('discord_id', discordId);

  await supabase.from('pulse_transactions').insert({
    guild_id: guildId,
    discord_id: discordId,
    type: 'ADMIN_REVOKE',
    amount: -removed,
    reason,
    ref_id: adminId,
    balance_after: newBalance,
  });

  log('INFO', `PULSE admin revoke: ${adminId} -> ${guildId}/${discordId} -${removed} (${reason})`);
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
  const guildId = currentGuildId();

  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .single();

  const delta = amount - (user?.balance_pulse ?? 0);

  await supabase.from('discord_users').upsert({
    guild_id: guildId,
    discord_id: discordId,
    username,
    avatar_url: avatarUrl,
    balance_pulse: amount,
  }, { onConflict: 'guild_id,discord_id' });

  await supabase.from('pulse_transactions').insert({
    guild_id: guildId,
    discord_id: discordId,
    type: delta >= 0 ? 'ADMIN_GRANT' : 'ADMIN_REVOKE',
    amount: delta,
    reason,
    ref_id: adminId,
    balance_after: amount,
  });

  log('INFO', `PULSE admin set: ${adminId} -> ${guildId}/${discordId} = ${amount} (${reason})`);
  return { success: true, newBalance: amount };
}

export async function creditPulse(
  discordId: string,
  username: string,
  avatarUrl: string | null,
  amount: number,
  reason: string
): Promise<number> {
  if (amount <= 0) return 0;
  const guildId = currentGuildId();

  const { data: user } = await supabase
    .from('discord_users')
    .select('balance_pulse, lifetime_earned_pulse')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .single();

  const newBalance = (user?.balance_pulse ?? 0) + amount;

  await supabase.from('discord_users').upsert({
    guild_id: guildId,
    discord_id: discordId,
    username,
    avatar_url: avatarUrl,
    balance_pulse: newBalance,
    lifetime_earned_pulse: (user?.lifetime_earned_pulse ?? 0) + amount,
  }, { onConflict: 'guild_id,discord_id' });

  await supabase.from('pulse_transactions').insert({
    guild_id: guildId,
    discord_id: discordId,
    type: 'EARN_EVENT',
    amount,
    reason,
    balance_after: newBalance,
  });

  return newBalance;
}

export async function getBalance(discordId: string): Promise<{
  balance: number;
  earned: number;
  spent: number;
} | null> {
  const { data } = await supabase
    .from('discord_users')
    .select('balance_pulse, lifetime_earned_pulse, lifetime_spent_pulse')
    .eq('guild_id', currentGuildId())
    .eq('discord_id', discordId)
    .single();

  if (!data) return null;
  return {
    balance: data.balance_pulse ?? 0,
    earned: data.lifetime_earned_pulse ?? 0,
    spent: data.lifetime_spent_pulse ?? 0,
  };
}
