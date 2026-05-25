import {
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type GuildTextBasedChannel,
} from 'discord.js';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase.js';
import { creditPulse } from './economy.js';
import { getPulsarConfig, pulsarCompose } from './pulsar.js';
import { pulseEmbed, successEmbed } from '../utils/embeds.js';
import { log } from '../utils/logger.js';

const MODEL = process.env.PULSAR_MODEL || process.env.AI_QUIZ_MODEL || 'claude-sonnet-4-6';

export type ChallengeKind = 'flash' | 'riddle' | 'daily' | 'weekly';
export type Metric = 'messages' | 'reactions' | 'quiz_correct' | 'lottery_tickets';

interface Challenge {
  id: string;
  kind: ChallengeKind;
  title: string;
  description: string;
  metric: Metric | null;
  goal: number | null;
  reward: number;
  max_winners: number | null;
  answer: string | null;
  channel_id: string | null;
  message_id: string | null;
  status: string;
  winners_count: number;
  expires_at: string | null;
}

const METRIC_LABEL: Record<Metric, string> = {
  messages: 'send {n} messages',
  reactions: 'add {n} reactions',
  quiz_correct: 'answer {n} quiz questions correctly',
  lottery_tickets: 'buy {n} lottery tickets',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

async function sendableChannel(client: Client, channelId: string | null): Promise<GuildTextBasedChannel | null> {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || !channel.isSendable()) return null;
  return channel as GuildTextBasedChannel;
}

// ---- Active objective cache (keeps per-message tracking cheap) ----
let objCache: Challenge[] = [];
let objCacheAt = 0;

async function activeObjectives(): Promise<Challenge[]> {
  if (Date.now() - objCacheAt < 30_000) return objCache;
  const { data } = await supabase.from('pulse_challenges').select('*').eq('status', 'active').in('kind', ['daily', 'weekly']);
  objCache = (data ?? []) as Challenge[];
  objCacheAt = Date.now();
  return objCache;
}
function invalidateCache() { objCacheAt = 0; }

// ---- Progress tracking for objective missions ----
export async function recordChallengeMetric(client: Client, discordId: string, username: string, metric: Metric, amount = 1): Promise<void> {
  const objs = (await activeObjectives()).filter(c => c.metric === metric);
  if (!objs.length) return;
  for (const c of objs) {
    try {
      const { data: row } = await supabase
        .from('challenge_claims')
        .select('progress, completed')
        .eq('challenge_id', c.id)
        .eq('discord_id', discordId)
        .maybeSingle();
      if (row?.completed) continue;
      const progress = (row?.progress ?? 0) + amount;
      const completed = progress >= (c.goal ?? 1);
      await supabase.from('challenge_claims').upsert({
        challenge_id: c.id, discord_id: discordId, progress, completed, updated_at: new Date().toISOString(),
      }, { onConflict: 'challenge_id,discord_id' });
      if (completed) {
        await creditPulse(discordId, username, null, c.reward, `mission_${c.kind}`);
        const channel = await sendableChannel(client, c.channel_id);
        if (channel) {
          await channel.send({ content: `🎯 <@${discordId}> completed **${c.title}** and earned **${c.reward}** PULSE! 🎉`, allowedMentions: { users: [discordId], parse: [] } }).catch(() => {});
        }
      }
    } catch (err) {
      log('ERROR', 'recordChallengeMetric failed', err);
    }
  }
}

// ---- Launching ----
function endOfTodayUtc(): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 23, 59, 59)).toISOString();
}
function inDaysUtc(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export async function launchFlash(client: Client, channelId: string, opts: { reward: number; maxWinners: number; durationMin: number }): Promise<boolean> {
  const channel = await sendableChannel(client, channelId);
  if (!channel) return false;
  const flavor = await pulsarCompose(
    `Announce a flash mission: the first ${opts.maxWinners} members to tap the Claim button win ${opts.reward} PULSE. ` +
    `Write a punchy title and a one-line hype description. Reply as "TITLE | DESCRIPTION".`).catch(() => null);
  let title = '⚡ Flash Mission!';
  let description = `The first **${opts.maxWinners}** to claim win **${opts.reward} PULSE**! Tap below — fast! 🏃`;
  if (flavor && flavor.includes('|')) {
    const [t, d] = flavor.split('|');
    title = t.trim().slice(0, 240) || title;
    description = `${d.trim().slice(0, 1500)}\n\n🏆 First **${opts.maxWinners}** to claim win **${opts.reward} PULSE**!`;
  }
  const expires = new Date(Date.now() + opts.durationMin * 60_000).toISOString();
  const { data: row, error } = await supabase.from('pulse_challenges').insert({
    kind: 'flash', title, description, reward: opts.reward, max_winners: opts.maxWinners,
    channel_id: channelId, status: 'active', expires_at: expires,
  }).select('id').single();
  if (error || !row) { log('ERROR', 'launchFlash insert failed', error); return false; }

  const msg = await channel.send({
    embeds: [pulseEmbed(title).setDescription(description).setFooter({ text: `Claim before it expires!` })],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`challenge:claim:${row.id}`).setLabel('Claim').setEmoji('⚡').setStyle(ButtonStyle.Success))],
  }).catch(() => null);
  if (msg) await supabase.from('pulse_challenges').update({ message_id: msg.id }).eq('id', row.id);
  return true;
}

async function generateRiddle(language: string): Promise<{ riddle: string; answer: string } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      output_config: { format: { type: 'json_schema', schema: {
        type: 'object', additionalProperties: false,
        properties: { riddle: { type: 'string' }, answer: { type: 'string' } },
        required: ['riddle', 'answer'],
      } } },
      messages: [{ role: 'user', content:
        `Create one fun, solvable riddle for a Discord community in ${language}. ` +
        `The answer must be a single common word or short phrase. Keep the riddle to 1-3 lines.` }],
    });
    const raw = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(raw) as { riddle?: string; answer?: string };
    if (parsed.riddle && parsed.answer) return { riddle: parsed.riddle, answer: parsed.answer };
  } catch (err) {
    log('ERROR', 'generateRiddle failed', err);
  }
  return null;
}

export async function launchRiddle(client: Client, channelId: string, opts: { reward: number; durationMin: number }): Promise<boolean> {
  const channel = await sendableChannel(client, channelId);
  if (!channel) return false;
  const r = await generateRiddle(getPulsarConfig().language);
  if (!r) return false; // riddles need AI
  const expires = new Date(Date.now() + opts.durationMin * 60_000).toISOString();
  const { data: row, error } = await supabase.from('pulse_challenges').insert({
    kind: 'riddle', title: '🧩 Riddle Mission', description: r.riddle, answer: norm(r.answer),
    reward: opts.reward, max_winners: 1, channel_id: channelId, status: 'active', expires_at: expires,
  }).select('id').single();
  if (error || !row) { log('ERROR', 'launchRiddle insert failed', error); return false; }

  const msg = await channel.send({
    embeds: [pulseEmbed('🧩 Riddle Mission').setDescription(`${r.riddle}\n\n🏆 First to solve it wins **${opts.reward} PULSE**!`)],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`challenge:answer:${row.id}`).setLabel('Answer').setEmoji('🧠').setStyle(ButtonStyle.Primary))],
  }).catch(() => null);
  if (msg) await supabase.from('pulse_challenges').update({ message_id: msg.id }).eq('id', row.id);
  return true;
}

export async function launchObjective(client: Client, channelId: string, opts: { kind: 'daily' | 'weekly'; metric: Metric; goal: number; reward: number }): Promise<boolean> {
  const channel = await sendableChannel(client, channelId);
  if (!channel) return false;
  const what = METRIC_LABEL[opts.metric].replace('{n}', String(opts.goal));
  const flavor = await pulsarCompose(
    `Announce a ${opts.kind} community mission: ${what} to earn ${opts.reward} PULSE. One short hype line.`).catch(() => null);
  const title = `${opts.kind === 'daily' ? '📅 Daily' : '🗓️ Weekly'} Mission`;
  const description = `${flavor ? flavor.trim().slice(0, 1200) + '\n\n' : ''}🎯 **Goal:** ${what}\n💰 **Reward:** ${opts.reward} PULSE — credited automatically when you hit the goal!`;
  const expires = opts.kind === 'daily' ? endOfTodayUtc() : inDaysUtc(7);
  const { error } = await supabase.from('pulse_challenges').insert({
    kind: opts.kind, title, description, metric: opts.metric, goal: opts.goal, reward: opts.reward,
    channel_id: channelId, status: 'active', expires_at: expires,
  });
  if (error) { log('ERROR', 'launchObjective insert failed', error); return false; }
  invalidateCache();
  await channel.send({ embeds: [pulseEmbed(title).setDescription(description)] }).catch(() => {});
  return true;
}

// ---- Interaction handling (persistent buttons) ----
export async function handleChallengeInteraction(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
  const parts = interaction.customId.split(':'); // challenge:<action>:<id>
  const action = parts[1];
  const id = parts[2];

  if (interaction.isButton() && action === 'claim') {
    const { data: c } = await supabase.from('pulse_challenges').select('*').eq('id', id).maybeSingle();
    const ch = c as Challenge | null;
    if (!ch || ch.status !== 'active' || (ch.expires_at && new Date(ch.expires_at).getTime() < Date.now())) {
      await interaction.reply({ embeds: [successEmbed('This mission has ended. ⏰')], flags: MessageFlags.Ephemeral }); return;
    }
    const { data: existing } = await supabase.from('challenge_claims').select('id').eq('challenge_id', ch.id).eq('discord_id', interaction.user.id).maybeSingle();
    if (existing) { await interaction.reply({ embeds: [successEmbed('You already claimed this one! ✅')], flags: MessageFlags.Ephemeral }); return; }
    if (ch.max_winners && ch.winners_count >= ch.max_winners) {
      await interaction.reply({ embeds: [successEmbed('All spots are taken — better luck next time! 🏁')], flags: MessageFlags.Ephemeral }); return;
    }
    await supabase.from('challenge_claims').insert({ challenge_id: ch.id, discord_id: interaction.user.id, completed: true });
    const newCount = ch.winners_count + 1;
    await supabase.from('pulse_challenges').update({ winners_count: newCount }).eq('id', ch.id);
    await creditPulse(interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL(), ch.reward, 'mission_flash');
    await interaction.reply({ embeds: [successEmbed(`⚡ You claimed **${ch.reward} PULSE**! 🎉`)], flags: MessageFlags.Ephemeral });
    if (ch.max_winners && newCount >= ch.max_winners) await endChallenge(interaction.client, ch, 'All spots claimed! 🏁');
    return;
  }

  if (interaction.isButton() && action === 'answer') {
    const modal = new ModalBuilder().setCustomId(`challenge:ans:${id}`).setTitle('Your answer').addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('a').setLabel('Answer to the riddle').setStyle(TextInputStyle.Short).setRequired(true)));
    await interaction.showModal(modal);
    return;
  }

  if (interaction.isModalSubmit() && action === 'ans') {
    const { data: c } = await supabase.from('pulse_challenges').select('*').eq('id', id).maybeSingle();
    const ch = c as Challenge | null;
    if (!ch || ch.status !== 'active' || (ch.expires_at && new Date(ch.expires_at).getTime() < Date.now())) {
      await interaction.reply({ embeds: [successEmbed('This riddle has ended. ⏰')], flags: MessageFlags.Ephemeral }); return;
    }
    const guess = norm(interaction.fields.getTextInputValue('a'));
    if (guess !== ch.answer) {
      await interaction.reply({ embeds: [successEmbed('Not quite — try again! 🤔')], flags: MessageFlags.Ephemeral }); return;
    }
    await supabase.from('challenge_claims').insert({ challenge_id: ch.id, discord_id: interaction.user.id, completed: true }).select();
    await supabase.from('pulse_challenges').update({ winners_count: ch.winners_count + 1 }).eq('id', ch.id);
    await creditPulse(interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL(), ch.reward, 'mission_riddle');
    await interaction.reply({ embeds: [successEmbed(`🧩 Correct! You won **${ch.reward} PULSE**! 🎉`)], flags: MessageFlags.Ephemeral });
    await endChallenge(interaction.client, ch, `Solved by ${interaction.user.username}! 🧠`);
    return;
  }
}

async function endChallenge(client: Client, ch: Challenge, note: string): Promise<void> {
  await supabase.from('pulse_challenges').update({ status: 'ended' }).eq('id', ch.id);
  invalidateCache();
  if (!ch.channel_id || !ch.message_id) return;
  const channel = await sendableChannel(client, ch.channel_id);
  if (!channel) return;
  const msg = await channel.messages.fetch(ch.message_id).catch(() => null);
  if (msg) await msg.edit({ embeds: [pulseEmbed(`${ch.title} — Closed`).setDescription(`${ch.description}\n\n**${note}**`)], components: [] }).catch(() => {});
}

// ---- Admin / panel helpers ----
export async function listActiveChallenges(): Promise<Challenge[]> {
  const { data } = await supabase.from('pulse_challenges').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(15);
  return (data ?? []) as Challenge[];
}
export async function endAllChallenges(client: Client): Promise<number> {
  const active = await listActiveChallenges();
  for (const ch of active) await endChallenge(client, ch, 'Closed by an admin.');
  return active.length;
}

// ---- Scheduler: expiry + autonomous launches ----
let interval: ReturnType<typeof setInterval> | null = null;

const AUTO_KINDS: ChallengeKind[] = ['flash', 'riddle', 'daily', 'weekly'];

async function autoLaunch(client: Client, channelId: string): Promise<void> {
  const kind = AUTO_KINDS[Math.floor(Math.random() * AUTO_KINDS.length)];
  if (kind === 'flash') return void launchFlash(client, channelId, { reward: 50, maxWinners: 3, durationMin: 30 });
  if (kind === 'riddle') return void launchRiddle(client, channelId, { reward: 100, durationMin: 60 });
  const metrics: Metric[] = ['messages', 'reactions', 'quiz_correct', 'lottery_tickets'];
  const metric = metrics[Math.floor(Math.random() * metrics.length)];
  const daily = kind === 'daily';
  const goal = metric === 'messages' ? (daily ? 20 : 100) : metric === 'reactions' ? (daily ? 10 : 50) : (daily ? 2 : 8);
  await launchObjective(client, channelId, { kind: daily ? 'daily' : 'weekly', metric, goal, reward: daily ? 60 : 250 });
}

async function tick(client: Client): Promise<void> {
  // Expire due missions.
  const { data: due } = await supabase.from('pulse_challenges').select('*').eq('status', 'active').lte('expires_at', new Date().toISOString());
  for (const ch of (due ?? []) as Challenge[]) await endChallenge(client, ch, 'Time’s up! ⏰');

  // Autonomous launches, gated by Pulsar config.
  const cfg = getPulsarConfig();
  if (!cfg.enabled || !cfg.missions || !cfg.channel_id) return;
  const state = getStateLast();
  const intervalMs = Math.max(0.5, cfg.mission_interval_hours) * 3_600_000;
  if (state && Date.now() - state < intervalMs) return;
  setStateLast(Date.now());
  await autoLaunch(client, cfg.channel_id);
}

// Lightweight in-memory throttle for auto-launch (persists for process lifetime).
let lastAuto = 0;
function getStateLast(): number { return lastAuto; }
function setStateLast(v: number) { lastAuto = v; }

export function startChallengeScheduler(client: Client, intervalMs = 5 * 60_000): void {
  interval = setInterval(() => { tick(client).catch(err => log('ERROR', 'Challenge scheduler tick failed', err)); }, intervalMs);
}
export function stopChallengeScheduler(): void { if (interval) clearInterval(interval); }
