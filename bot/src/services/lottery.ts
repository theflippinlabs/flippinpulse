import { Client, EmbedBuilder } from 'discord.js';
import { supabase } from '../supabase.js';
import { runWithGuild, currentGuildId } from '../guildContext.js';
import { spendPulse } from './economy.js';
import { earnPulse } from './games.js';
import { getRawSetting } from './settings.js';
import { log } from '../utils/logger.js';

export interface LotteryConfig {
  enabled: boolean;
  ticket_price: number;
  draw_interval_hours: number;
  house_cut_percent: number;
  announce_channel_id: string | null;
  seed_pot: number;
}

const DEFAULTS: LotteryConfig = {
  enabled: true,
  ticket_price: 50,
  draw_interval_hours: 24,
  house_cut_percent: 0,
  announce_channel_id: null,
  seed_pot: 0,
};

export function getLotteryConfig(): LotteryConfig {
  return { ...DEFAULTS, ...(getRawSetting<Partial<LotteryConfig>>('lottery_config') ?? {}) };
}

interface LotteryRound {
  id: string;
  guild_id: string;
  status: string;
  pot_pulse: number;
  ticket_price: number;
  draw_at: string;
  total_tickets: number;
}

export async function getOrCreateActiveRound(): Promise<LotteryRound | null> {
  const guildId = currentGuildId();
  const { data: existing } = await supabase
    .from('lottery_rounds')
    .select('id, guild_id, status, pot_pulse, ticket_price, draw_at, total_tickets')
    .eq('guild_id', guildId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as LotteryRound;

  const cfg = getLotteryConfig();
  const drawAt = new Date(Date.now() + cfg.draw_interval_hours * 3_600_000).toISOString();
  const { data: created, error } = await supabase
    .from('lottery_rounds')
    .insert({
      guild_id: guildId,
      status: 'active',
      pot_pulse: cfg.seed_pot,
      ticket_price: cfg.ticket_price,
      draw_at: drawAt,
      total_tickets: 0,
    })
    .select('id, guild_id, status, pot_pulse, ticket_price, draw_at, total_tickets')
    .single();

  if (error) {
    log('ERROR', 'Failed to create lottery round', error);
    return null;
  }
  return created as LotteryRound;
}

export async function buyTickets(
  discordId: string,
  count: number,
): Promise<{ success: boolean; error?: string; tickets?: number; pot?: number; drawAt?: string }> {
  if (count <= 0) return { success: false, error: 'Buy at least 1 ticket.' };
  const guildId = currentGuildId();

  const round = await getOrCreateActiveRound();
  if (!round) return { success: false, error: 'No active lottery right now.' };

  const cost = round.ticket_price * count;
  const spend = await spendPulse(discordId, cost, `lottery_tickets_x${count}`, round.id);
  if (!spend.success) return { success: false, error: spend.error ?? 'Could not pay for tickets.' };

  const { data: existingEntry } = await supabase
    .from('lottery_tickets')
    .select('tickets')
    .eq('round_id', round.id)
    .eq('discord_id', discordId)
    .maybeSingle();

  const userTickets = (existingEntry?.tickets ?? 0) + count;

  await supabase.from('lottery_tickets').upsert({
    guild_id: guildId,
    round_id: round.id,
    discord_id: discordId,
    tickets: userTickets,
  }, { onConflict: 'round_id,discord_id' });

  const newPot = round.pot_pulse + cost;
  await supabase
    .from('lottery_rounds')
    .update({ pot_pulse: newPot, total_tickets: round.total_tickets + count })
    .eq('id', round.id);

  return { success: true, tickets: userTickets, pot: newPot, drawAt: round.draw_at };
}

export async function getStatus(discordId: string): Promise<{
  pot: number; totalTickets: number; ticketPrice: number; drawAt: string; userTickets: number;
} | null> {
  const round = await getOrCreateActiveRound();
  if (!round) return null;

  const { data: entry } = await supabase
    .from('lottery_tickets')
    .select('tickets')
    .eq('round_id', round.id)
    .eq('discord_id', discordId)
    .maybeSingle();

  return {
    pot: round.pot_pulse,
    totalTickets: round.total_tickets,
    ticketPrice: round.ticket_price,
    drawAt: round.draw_at,
    userTickets: entry?.tickets ?? 0,
  };
}

async function drawRound(client: Client, round: LotteryRound): Promise<void> {
  const cfg = getLotteryConfig();

  const { data: entries } = await supabase
    .from('lottery_tickets')
    .select('discord_id, tickets')
    .eq('round_id', round.id);

  if (!entries?.length || round.total_tickets <= 0) {
    const nextDraw = new Date(Date.now() + cfg.draw_interval_hours * 3_600_000).toISOString();
    await supabase.from('lottery_rounds').update({ status: 'drawn', drawn_at: new Date().toISOString() }).eq('id', round.id);
    await supabase.from('lottery_rounds').insert({
      guild_id: round.guild_id,
      status: 'active',
      pot_pulse: round.pot_pulse,
      ticket_price: cfg.ticket_price,
      draw_at: nextDraw,
      total_tickets: 0,
    });
    log('INFO', `Lottery round ${round.id} had no entries; pot ${round.pot_pulse} rolled over.`);
    return;
  }

  const total = entries.reduce((sum, e) => sum + e.tickets, 0);
  let pick = Math.floor(Math.random() * total);
  let winner = entries[0].discord_id;
  for (const e of entries) {
    if (pick < e.tickets) { winner = e.discord_id; break; }
    pick -= e.tickets;
  }

  const houseCut = Math.floor(round.pot_pulse * cfg.house_cut_percent / 100);
  const prize = round.pot_pulse - houseCut;

  await earnPulse(winner, prize, 'lottery_win', round.id);
  await supabase
    .from('lottery_rounds')
    .update({ status: 'drawn', winner_discord_id: winner, drawn_at: new Date().toISOString() })
    .eq('id', round.id);

  const nextDraw = new Date(Date.now() + cfg.draw_interval_hours * 3_600_000).toISOString();
  await supabase.from('lottery_rounds').insert({
    guild_id: round.guild_id,
    status: 'active',
    pot_pulse: cfg.seed_pot,
    ticket_price: cfg.ticket_price,
    draw_at: nextDraw,
    total_tickets: 0,
  });

  log('INFO', `Lottery round ${round.id} won by ${winner}: ${prize} PULSE.`);

  if (cfg.announce_channel_id) {
    try {
      const channel = await client.channels.fetch(cfg.announce_channel_id);
      if (channel?.isTextBased() && 'send' in channel) {
        const embed = new EmbedBuilder()
          .setColor(0xF59E0B)
          .setTitle('🎰 Lottery Draw!')
          .setDescription(`Congratulations <@${winner}>! 🎉\n\nYou won the jackpot of **${prize}** PULSE with ${total} ticket${total === 1 ? '' : 's'} in play.\n\nA new round has begun — buy in with \`/lottery buy\`.`)
          .setTimestamp();
        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      log('ERROR', 'Failed to announce lottery winner', err);
    }
  }
}

let interval: ReturnType<typeof setInterval> | null = null;

async function tickGuild(client: Client, guildId: string): Promise<void> {
  await runWithGuild(guildId, async () => {
    if (!getLotteryConfig().enabled) return;
    await getOrCreateActiveRound();
    const { data: due } = await supabase
      .from('lottery_rounds')
      .select('id, guild_id, status, pot_pulse, ticket_price, draw_at, total_tickets')
      .eq('guild_id', guildId)
      .eq('status', 'active')
      .lte('draw_at', new Date().toISOString());
    for (const round of due ?? []) {
      await drawRound(client, round as LotteryRound);
    }
  });
}

export function startLotteryScheduler(client: Client, intervalMs = 60_000): void {
  const run = () => {
    for (const guild of client.guilds.cache.values()) {
      tickGuild(client, guild.id).catch(err => log('ERROR', 'Lottery scheduler tick failed', err));
    }
  };
  run();
  interval = setInterval(run, intervalMs);
}

export function stopLotteryScheduler(): void {
  if (interval) clearInterval(interval);
}
