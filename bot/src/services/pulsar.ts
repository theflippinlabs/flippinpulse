import { Client, Message, GuildTextBasedChannel } from 'discord.js';
import Anthropic from '@anthropic-ai/sdk';
import { getRawSetting, setSetting } from './settings.js';
import { log } from '../utils/logger.js';

// Pulsar is the AI community manager. Cheap-but-capable model by default;
// override with PULSAR_MODEL, else reuse the quiz model.
const MODEL = process.env.PULSAR_MODEL || process.env.AI_QUIZ_MODEL || 'claude-sonnet-4-6';

export interface PulsarConfig {
  enabled: boolean;
  channel_id: string | null;
  language: string;
  interval_hours: number;
  tag_active_members: boolean;
  reply_to_mentions: boolean;
}

const DEFAULTS: PulsarConfig = {
  enabled: false,
  channel_id: null,
  language: 'English',
  interval_hours: 3.5,
  tag_active_members: true,
  reply_to_mentions: true,
};

export function getPulsarConfig(): PulsarConfig {
  return { ...DEFAULTS, ...(getRawSetting<Partial<PulsarConfig>>('pulsar_config') ?? {}) };
}

function persona(language: string): string {
  return (
    `You are Pulsar, the energetic community manager of "The Flippin' Labs" Discord server — ` +
    `home of the Pulse Engine bot and a crypto/gaming community around Cronos and Loaded Lions Mane City.\n` +
    `Personality: hype, upbeat, motivating and welcoming, like an enthusiastic gaming/crypto host who keeps the vibe positive.\n` +
    `Rules:\n` +
    `- Write in ${language}.\n` +
    `- Keep it SHORT — 1 to 2 sentences, casual Discord style. A couple of emojis are great; don't overdo it.\n` +
    `- Sound natural and human, never corporate or robotic.\n` +
    `- NEVER use @everyone or @here, and never ping roles.\n` +
    `- Don't invent facts, prices, token launches or promises, and never give financial advice.\n` +
    `- Always stay friendly, inclusive and safe-for-work.`
  );
}

// ---- In-memory activity store (per guild), used for context + active members ----
interface Activity { userId: string; name: string; content: string; ts: number; }
const recent = new Map<string, Activity[]>();
const MAX_PER_GUILD = 25;

export function recordActivity(message: Message): void {
  if (!message.guild) return;
  const cfg = getPulsarConfig();
  if (!cfg.enabled || message.channelId !== cfg.channel_id) return;
  const arr = recent.get(message.guild.id) ?? [];
  arr.push({
    userId: message.author.id,
    name: message.member?.displayName ?? message.author.username,
    content: message.content.slice(0, 300),
    ts: Date.now(),
  });
  while (arr.length > MAX_PER_GUILD) arr.shift();
  recent.set(message.guild.id, arr);
}

function activeMembers(guildId: string, withinMs = 45 * 60_000): Activity[] {
  const arr = recent.get(guildId) ?? [];
  const cutoff = Date.now() - withinMs;
  const latest = new Map<string, Activity>();
  for (const a of arr) if (a.ts >= cutoff) latest.set(a.userId, a);
  return [...latest.values()];
}

function contextLines(guildId: string, n = 8): string {
  const arr = recent.get(guildId) ?? [];
  return arr.slice(-n).map(a => `${a.name}: ${a.content}`).join('\n');
}

async function chat(system: string, user: string, maxTokens = 300): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim();
    return text || null;
  } catch (err) {
    log('ERROR', 'Pulsar AI call failed', err);
    return null;
  }
}

const MODES = ['question', 'checkin', 'hype', 'icebreaker'] as const;

async function postSpontaneous(client: Client, guildId: string): Promise<void> {
  const cfg = getPulsarConfig();
  if (!cfg.channel_id) return;
  const channel = await client.channels.fetch(cfg.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || !channel.isSendable()) return;

  // Tag from a wider window (last 3h) so Pulsar can pull recent members back
  // even after a lull, not only people chatting right this second.
  const actives = activeMembers(guildId, 3 * 60 * 60_000);
  const quiet = !activeMembers(guildId, 30 * 60_000).length;

  let mode: typeof MODES[number] = MODES[Math.floor(Math.random() * MODES.length)];
  let target: Activity | undefined;
  if (mode === 'checkin') {
    if (cfg.tag_active_members && actives.length) target = actives[Math.floor(Math.random() * actives.length)];
    else mode = 'question';
  }

  const ctx = contextLines(guildId);
  const ask =
    mode === 'question' ? `Post one fun, open-ended question to ${quiet ? 'revive a quiet channel and get people talking again' : 'spark conversation right now'}.`
    : mode === 'checkin' ? `Warmly greet this member${quiet ? ' (the channel has been quiet — pull them back in)' : ''} and ask how their day is going. Put the token {user} exactly once where their name should appear.`
    : mode === 'hype' ? `Post one short hype, positive message to ${quiet ? 'wake up the community and bring energy back' : 'energize the community right now'}.`
    : 'Post one light icebreaker or "would you rather" style prompt to get people chatting.';

  const userMsg = `${ctx ? `Recent chat for context:\n${ctx}\n\n` : ''}${ask}`;
  let text = await chat(persona(cfg.language), userMsg, 250);
  if (!text) return;

  if (target) {
    text = text.includes('{user}') ? text.replace('{user}', `<@${target.userId}>`) : `<@${target.userId}> ${text}`;
  } else {
    text = text.replace(/\{user\}/g, '').trim();
  }

  await channel.send({
    content: text.slice(0, 1800),
    allowedMentions: { users: target ? [target.userId] : [], parse: [] },
  }).catch(() => {});
}

// ---- Replies when members talk to Pulsar ----
const replyCooldown = new Map<string, number>();
const REPLY_COOLDOWN_MS = 8_000;

export async function maybeReply(message: Message): Promise<void> {
  const cfg = getPulsarConfig();
  if (!cfg.enabled || !cfg.reply_to_mentions || !cfg.channel_id) return;
  if (message.channelId !== cfg.channel_id || !message.guild) return;

  const botId = message.client.user?.id;
  if (!botId) return;
  const addressed = message.mentions.users.has(botId) || message.mentions.repliedUser?.id === botId;
  if (!addressed) return;

  const last = replyCooldown.get(message.channelId) ?? 0;
  if (Date.now() - last < REPLY_COOLDOWN_MS) return;
  replyCooldown.set(message.channelId, Date.now());

  const name = message.member?.displayName ?? message.author.username;
  const ctx = contextLines(message.guild.id);
  const cleaned = message.content.replace(new RegExp(`<@!?${botId}>`, 'g'), 'Pulsar').trim();
  const userMsg =
    `${ctx ? `Recent chat:\n${ctx}\n\n` : ''}` +
    `${name} just said to you: "${cleaned}"\n` +
    `Reply in character — short, warm and helpful. If they asked something you can't truly know (prices, the future, private info), be playful and honest about it rather than making things up.`;

  const text = await chat(persona(cfg.language), userMsg, 300);
  if (!text) return;

  await message.reply({
    content: text.replace(/\{user\}/g, '').trim().slice(0, 1800),
    allowedMentions: { repliedUser: true, parse: [] },
  }).catch(() => {});
}

// ---- Scheduler ----
let interval: ReturnType<typeof setInterval> | null = null;

async function tick(client: Client): Promise<void> {
  const cfg = getPulsarConfig();
  if (!cfg.enabled || !cfg.channel_id) return;

  const channel = await client.channels.fetch(cfg.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  const guildId = (channel as GuildTextBasedChannel).guild.id;

  const state = getRawSetting<{ last?: number }>('pulsar_state') ?? {};
  const intervalMs = Math.max(0.5, cfg.interval_hours) * 3_600_000;
  if (state.last && Date.now() - state.last < intervalMs) return;

  // Pulsar's job is to ENGAGE — it posts on schedule even when the channel is
  // quiet, to revive the conversation and pull people back in.
  await setSetting('pulsar_state', { last: Date.now() });
  await postSpontaneous(client, guildId);
}

export function startPulsar(client: Client, intervalMs = 5 * 60_000): void {
  interval = setInterval(() => {
    tick(client).catch(err => log('ERROR', 'Pulsar scheduler tick failed', err));
  }, intervalMs);
}

export function stopPulsar(): void {
  if (interval) clearInterval(interval);
}

// Manual trigger (used by the admin panel "post now" button).
export async function pulsarPostNow(client: Client, guildId: string): Promise<boolean> {
  const cfg = getPulsarConfig();
  if (!cfg.channel_id || !process.env.ANTHROPIC_API_KEY) return false;
  await postSpontaneous(client, guildId);
  return true;
}
