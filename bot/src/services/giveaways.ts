import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

export const GIVEAWAY_BUTTON_ID = 'giveaway:enter';
const TICK_MS = 30_000;
let scheduler: ReturnType<typeof setInterval> | null = null;

interface Giveaway {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  host_discord_id: string;
  prize: string;
  winners_count: number;
  end_at: string;
  status: 'active' | 'ended' | 'cancelled';
}

export function parseDurationMs(input: string): number | null {
  const match = input.trim().match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return value * mult;
}

export function buildGiveawayEmbed(g: Giveaway, entryCount: number): EmbedBuilder {
  const endsAt = Math.floor(new Date(g.end_at).getTime() / 1000);
  const ended = g.status !== 'active';

  return new EmbedBuilder()
    .setColor(ended ? 0x6B7280 : 0xF59E0B)
    .setTitle(`🎉 Giveaway: ${g.prize}`)
    .setDescription([
      `Hosted by <@${g.host_discord_id}>`,
      `Winners: **${g.winners_count}**`,
      ended ? `Ended <t:${endsAt}:R>` : `Ends <t:${endsAt}:R>`,
      `Entries: **${entryCount}**`,
    ].join('\n'))
    .setTimestamp();
}

export function buildEnterRow(disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(GIVEAWAY_BUTTON_ID)
      .setLabel('Enter')
      .setEmoji('🎉')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );
}

export async function createGiveaway(params: {
  guildId: string;
  channelId: string;
  hostId: string;
  prize: string;
  winnersCount: number;
  durationMs: number;
}): Promise<string | null> {
  const endAt = new Date(Date.now() + params.durationMs).toISOString();
  const { data, error } = await supabase
    .from('giveaways')
    .insert({
      guild_id: params.guildId,
      channel_id: params.channelId,
      host_discord_id: params.hostId,
      prize: params.prize,
      winners_count: params.winnersCount,
      end_at: endAt,
      status: 'active',
    })
    .select('id')
    .single();

  if (error || !data) {
    log('ERROR', 'Failed to create giveaway', error);
    return null;
  }
  return data.id;
}

export async function setGiveawayMessage(giveawayId: string, messageId: string): Promise<void> {
  await supabase.from('giveaways').update({ message_id: messageId }).eq('id', giveawayId);
}

export async function addEntry(giveawayId: string, discordId: string): Promise<boolean> {
  const { error } = await supabase.from('giveaway_entries').insert({
    giveaway_id: giveawayId,
    discord_id: discordId,
  });
  if (error) {
    if (error.code === '23505') return false;
    log('ERROR', 'Failed to add giveaway entry', error);
    return false;
  }
  return true;
}

export async function countEntries(giveawayId: string): Promise<number> {
  const { count } = await supabase
    .from('giveaway_entries')
    .select('*', { count: 'exact', head: true })
    .eq('giveaway_id', giveawayId);
  return count ?? 0;
}

export async function getGiveawayByMessage(messageId: string): Promise<Giveaway | null> {
  const { data } = await supabase
    .from('giveaways')
    .select('*')
    .eq('message_id', messageId)
    .maybeSingle();
  return (data as Giveaway) ?? null;
}

export async function getGiveaway(id: string): Promise<Giveaway | null> {
  const { data } = await supabase.from('giveaways').select('*').eq('id', id).maybeSingle();
  return (data as Giveaway) ?? null;
}

async function fetchEntries(giveawayId: string): Promise<string[]> {
  const { data } = await supabase
    .from('giveaway_entries')
    .select('discord_id')
    .eq('giveaway_id', giveawayId);
  return (data ?? []).map(r => r.discord_id);
}

function pickWinners(entries: string[], count: number): string[] {
  const pool = [...entries];
  const winners: string[] = [];
  while (winners.length < count && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }
  return winners;
}

export async function endGiveaway(client: Client, giveawayId: string): Promise<void> {
  const g = await getGiveaway(giveawayId);
  if (!g || g.status !== 'active') return;

  const entries = await fetchEntries(giveawayId);
  const winners = pickWinners(entries, g.winners_count);

  await supabase
    .from('giveaways')
    .update({
      status: 'ended',
      winner_ids: winners,
      ended_at: new Date().toISOString(),
    })
    .eq('id', giveawayId);

  const channel = await client.channels.fetch(g.channel_id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const text = channel as TextChannel;
  if (g.message_id) {
    const msg = await text.messages.fetch(g.message_id).catch(() => null);
    if (msg) {
      const embed = buildGiveawayEmbed({ ...g, status: 'ended' }, entries.length);
      await msg.edit({ embeds: [embed], components: [buildEnterRow(true)] }).catch(() => null);
    }
  }

  const announce = winners.length
    ? `🎉 Giveaway ended! Winner${winners.length > 1 ? 's' : ''} of **${g.prize}**: ${winners.map(id => `<@${id}>`).join(', ')}`
    : `Giveaway ended: **${g.prize}** — no valid entries.`;
  await text.send(announce).catch(() => null);
}

async function runScheduler(client: Client): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('giveaways')
    .select('id')
    .eq('status', 'active')
    .lte('end_at', nowIso);

  if (error) {
    log('ERROR', 'Giveaway scheduler: query failed', error);
    return;
  }

  for (const row of data ?? []) {
    await endGiveaway(client, row.id).catch(err =>
      log('ERROR', `Failed to end giveaway ${row.id}`, err),
    );
  }
}

export function startGiveawayScheduler(client: Client): void {
  if (scheduler) return;
  scheduler = setInterval(() => {
    runScheduler(client).catch(err => log('ERROR', 'Giveaway scheduler crashed', err));
  }, TICK_MS);
}

export function stopGiveawayScheduler(): void {
  if (scheduler) {
    clearInterval(scheduler);
    scheduler = null;
  }
}
