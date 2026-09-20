import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { requireLord } from '../services/lord.js';
import { errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('charts')
  .setDescription('Lord-only: community stats and trends of the last 14 days')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const DAYS = 14;
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function isoDay(d: Date): string { return d.toISOString().slice(0, 10); }

function bucketize<T extends { day: string }>(rows: T[]): Map<string, number> {
  const m = new Map<string, number>();
  const now = new Date();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(now.getTime() - (DAYS - 1 - i) * 86_400_000);
    m.set(isoDay(d), 0);
  }
  for (const r of rows) {
    if (m.has(r.day)) m.set(r.day, (m.get(r.day) ?? 0) + 1);
  }
  return m;
}

function sumBuckets<T extends { day: string; amount: number }>(rows: T[]): Map<string, number> {
  const m = new Map<string, number>();
  const now = new Date();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(now.getTime() - (DAYS - 1 - i) * 86_400_000);
    m.set(isoDay(d), 0);
  }
  for (const r of rows) {
    if (m.has(r.day)) m.set(r.day, (m.get(r.day) ?? 0) + r.amount);
  }
  return m;
}

function sparkline(values: number[]): string {
  const max = Math.max(1, ...values);
  return values.map(v => {
    if (v === 0) return SPARK_CHARS[0];
    const idx = Math.min(SPARK_CHARS.length - 1, Math.floor((v / max) * (SPARK_CHARS.length - 1)) + 1);
    return SPARK_CHARS[idx];
  }).join('');
}

const fmt = (n: number) => n.toLocaleString('en-US');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('Server only.')], flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await requireLord(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cutoff = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const [members, msgs, players, pulseIn, top] = await Promise.all([
    supabase.from('discord_users').select('*', { count: 'exact', head: true }),
    supabase.from('activity_events').select('created_at').eq('type', 'message').gte('created_at', cutoff).limit(50_000),
    supabase.from('game_players').select('joined_at').gte('joined_at', cutoff).limit(50_000),
    supabase.from('pulse_transactions').select('created_at, amount').gt('amount', 0).gte('created_at', cutoff).limit(50_000),
    supabase.from('discord_users').select('username, points_week').order('points_week', { ascending: false }).limit(3),
  ]);

  const msgBuckets = bucketize(((msgs.data ?? []) as { created_at: string }[]).map(r => ({ day: r.created_at.slice(0, 10) })));
  const gameBuckets = bucketize(((players.data ?? []) as { joined_at: string }[]).map(r => ({ day: r.joined_at.slice(0, 10) })));
  const pulseBuckets = sumBuckets(((pulseIn.data ?? []) as { created_at: string; amount: number }[]).map(r => ({ day: r.created_at.slice(0, 10), amount: r.amount })));

  const msgVals = [...msgBuckets.values()];
  const gameVals = [...gameBuckets.values()];
  const pulseVals = [...pulseBuckets.values()];

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const peak = (arr: number[]) => Math.max(0, ...arr);

  const topLines = ((top.data ?? []) as { username: string; points_week: number }[])
    .map((u, i) => `${['🥇', '🥈', '🥉'][i]} **${u.username ?? '???'}** — ${fmt(u.points_week ?? 0)} pts`)
    .join('\n') || '_No activity this week._';

  const embed = new EmbedBuilder()
    .setColor(0xF5B62E)
    .setTitle(`📊 Novarys — last ${DAYS} days`)
    .setDescription(
      `**Members tracked:** ${fmt(members.count ?? 0)}\n\n` +
      `💬 **Messages** — total ${fmt(sum(msgVals))} · peak ${fmt(peak(msgVals))}\n` +
      `\`${sparkline(msgVals)}\`\n\n` +
      `🎮 **Games played** — total ${fmt(sum(gameVals))} · peak ${fmt(peak(gameVals))}\n` +
      `\`${sparkline(gameVals)}\`\n\n` +
      `💰 **PULSE minted** — total ${fmt(sum(pulseVals))} · peak ${fmt(peak(pulseVals))}\n` +
      `\`${sparkline(pulseVals)}\`\n\n` +
      `**🏆 Top of the week**\n${topLines}`,
    )
    .setFooter({ text: 'Deeper drilldowns are on the dashboard → Hub → 📊 Charts.' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
