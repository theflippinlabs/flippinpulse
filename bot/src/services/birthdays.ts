import { Client } from 'discord.js';
import { supabase } from '../supabase.js';
import { earnPulse } from './games.js';
import { log } from '../utils/logger.js';

export interface Birthday {
  discord_id: string;
  birth_month: number;
  birth_day: number;
  last_celebrated_year: number | null;
}

const BIRTHDAY_REWARD = 500;

export async function setBirthday(discordId: string, month: number, day: number): Promise<{ ok: boolean; error?: string }> {
  if (month < 1 || month > 12) return { ok: false, error: 'invalid_month' };
  const maxDay = daysInMonth(month);
  if (day < 1 || day > maxDay) return { ok: false, error: 'invalid_day' };
  const { error } = await supabase.from('member_birthdays').upsert({
    discord_id: discordId, birth_month: month, birth_day: day,
  }, { onConflict: 'discord_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getBirthday(discordId: string): Promise<Birthday | null> {
  const { data } = await supabase.from('member_birthdays').select('*').eq('discord_id', discordId).maybeSingle();
  return (data as Birthday) ?? null;
}

export async function deleteBirthday(discordId: string): Promise<void> {
  await supabase.from('member_birthdays').delete().eq('discord_id', discordId);
}

function daysInMonth(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/**
 * Sweep once (called by a scheduler): find every member whose birthday is today
 * and who hasn't been celebrated yet this year, credit the reward and DM.
 * Also posts a public message in the welcome channel if set.
 */
export async function runDailyBirthdaySweep(client: Client): Promise<void> {
  const today = new Date();
  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();
  const year = today.getUTCFullYear();

  const { data } = await supabase
    .from('member_birthdays')
    .select('*')
    .eq('birth_month', month)
    .eq('birth_day', day);
  const rows = (data ?? []) as Birthday[];

  const { getWelcomeConfig } = await import('./settings.js');
  const cfg = getWelcomeConfig();
  const announceChannelId = cfg.channel_id;
  const announceChannel = announceChannelId
    ? await client.channels.fetch(announceChannelId).catch(() => null)
    : null;

  for (const b of rows) {
    if (b.last_celebrated_year === year) continue;

    try {
      const user = await client.users.fetch(b.discord_id).catch(() => null);
      if (!user) continue;

      await earnPulse(b.discord_id, BIRTHDAY_REWARD, 'Birthday gift', `bday:${year}`);

      // Public celebration
      if (announceChannel && announceChannel.isTextBased() && !announceChannel.isDMBased() && announceChannel.isSendable()) {
        await announceChannel.send(`🎂 Joyeux anniversaire à <@${b.discord_id}> ! 🥳🎉 (+${BIRTHDAY_REWARD} PULSE)`).catch(() => null);
      }

      // Personal DM
      await user.send(`🎂 Joyeux anniversaire ! Tu reçois **+${BIRTHDAY_REWARD} PULSE** pour fêter ça. 🎁`).catch(() => null);

      await supabase.from('member_birthdays').update({ last_celebrated_year: year }).eq('discord_id', b.discord_id);
    } catch (err) {
      log('ERROR', `Birthday sweep failed for ${b.discord_id}`, err);
    }
  }
}
