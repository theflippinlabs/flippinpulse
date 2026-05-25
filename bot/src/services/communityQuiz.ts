import {
  Client,
  GuildTextBasedChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { runWithGuild, currentGuildId } from '../guildContext.js';
import { creditPulse } from './economy.js';
import { getRawSetting, setSetting } from './settings.js';
import { generateQuizQuestions } from './aiQuiz.js';
import { pulseEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { log } from '../utils/logger.js';

export interface AutoQuizConfig {
  enabled: boolean;
  channel_id: string | null;
  questions_per_round: number;
  seconds_per_question: number;
  reward_per_correct: number;
  category: string | null;
  bonus_enabled: boolean;
  auto_generate: boolean;
  language: string;
  daily_times_utc: string[];
  topics: string[];
}

const DEFAULTS: AutoQuizConfig = {
  enabled: false,
  channel_id: null,
  questions_per_round: 5,
  seconds_per_question: 20,
  reward_per_correct: 10,
  category: null,
  bonus_enabled: true,
  auto_generate: true,
  language: 'English',
  daily_times_utc: ['18:00', '00:00'],
  topics: ['cinema', 'music', 'Cronos blockchain', 'Loaded Lions Mane City', 'general knowledge'],
};

export function getAutoQuizConfig(): AutoQuizConfig {
  return { ...DEFAULTS, ...(getRawSetting<Partial<AutoQuizConfig>>('auto_quiz') ?? {}) };
}

const LABELS = ['🅰️', '🅱️', '🅲️', '🅳️'];
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

interface QuizQuestion {
  question: string;
  choices_json: string[];
  correct_index: number;
  category: string;
}

interface RunOptions {
  questions?: QuizQuestion[];
  questionsPerRound: number;
  secondsPerQuestion: number;
  rewardPerCorrect: number;
  category: string | null;
  bonus: boolean;
}

export async function runCommunityQuiz(channel: GuildTextBasedChannel, opts: RunOptions): Promise<void> {
  const wanted = opts.questionsPerRound + (opts.bonus ? 1 : 0);

  let questions = opts.questions;
  if (!questions) {
    let query = supabase.from('quiz_questions')
      .select('question, choices_json, correct_index, category')
      .eq('guild_id', currentGuildId())
      .eq('is_active', true);
    if (opts.category) query = query.eq('category', opts.category);
    const { data: all } = await query;
    if (!all?.length) {
      await channel.send({ embeds: [errorEmbed('No quiz questions available yet. An admin can add some with `/quizadmin add` or `/quizadmin generate`.')] }).catch(() => {});
      return;
    }
    questions = shuffle(all as QuizQuestion[]);
  }

  questions = questions.slice(0, wanted);
  if (!questions.length) return;

  const bonusIndex = opts.bonus ? questions.length - 1 : -1;
  const scores = new Map<string, { name: string; points: number; correct: number }>();

  await channel.send({
    embeds: [pulseEmbed('🧠 Community Quiz — everyone plays!').setDescription(
      `A quiz is starting!\n\n` +
      `📋 **${questions.length}** questions · ⏱️ ${opts.secondsPerQuestion}s each\n` +
      `💰 **+${opts.rewardPerCorrect} PULSE** per correct answer` +
      `${opts.bonus ? ` · 🌟 last question is a **BONUS** (double points)` : ''}\n\n` +
      `Tap an answer — first answer locks in. Good luck! 🍀`
    )],
  }).catch(() => {});
  await delay(4000);

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const choices = q.choices_json;
    const isBonus = i === bonusIndex;
    const points = isBonus ? opts.rewardPerCorrect * 2 : opts.rewardPerCorrect;

    const rowsFor = (revealed: boolean) => {
      const btns = choices.map((choice, idx) =>
        new ButtonBuilder()
          .setCustomId(`cq_${i}_${idx}`)
          .setLabel(`${LABELS[idx]} ${choice}`.slice(0, 80))
          .setStyle(revealed ? (idx === q.correct_index ? ButtonStyle.Success : ButtonStyle.Secondary) : ButtonStyle.Secondary)
          .setDisabled(revealed));
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      for (let r = 0; r < btns.length; r += 2) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btns.slice(r, r + 2)));
      return rows;
    };

    const title = isBonus ? `🌟 BONUS Question — double points!` : `Question ${i + 1}/${questions.length}`;
    const qEmbed = pulseEmbed(title)
      .setDescription(`**${q.question}**`)
      .setFooter({ text: `⏱️ ${opts.secondsPerQuestion}s · +${points} PULSE` });

    const msg = await channel.send({ embeds: [qEmbed], components: rowsFor(false) }).catch(() => null);
    if (!msg) continue;

    const answers = new Map<string, number>();
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: opts.secondsPerQuestion * 1000 });

    await new Promise<void>((resolve) => {
      collector.on('collect', async (btn) => {
        const idx = Number(btn.customId.split('_').pop());
        if (answers.has(btn.user.id)) {
          await btn.reply({ content: 'You already answered this one!', ephemeral: true }).catch(() => {});
          return;
        }
        answers.set(btn.user.id, idx);
        if (!scores.has(btn.user.id)) scores.set(btn.user.id, { name: btn.user.username, points: 0, correct: 0 });
        await btn.reply({ content: `✅ Locked in ${LABELS[idx]}`, ephemeral: true }).catch(() => {});
      });
      collector.on('end', () => resolve());
    });

    for (const [uid, idx] of answers) {
      if (idx === q.correct_index) {
        const s = scores.get(uid)!;
        s.correct++;
        s.points += points;
      }
    }

    await msg.edit({
      embeds: [qEmbed.setFooter({ text: `✅ Correct: ${LABELS[q.correct_index]} ${choices[q.correct_index]} · ${answers.size} answered` })],
      components: rowsFor(true),
    }).catch(() => {});
    await delay(3000);
  }

  const ranked = [...scores.entries()].map(([id, s]) => ({ id, ...s })).sort((a, b) => b.points - a.points);

  for (const r of ranked) {
    if (r.points > 0) await creditPulse(r.id, r.name, null, r.points, 'community_quiz');
  }

  const medals = ['🥇', '🥈', '🥉'];
  const board = ranked.slice(0, 10).map((r, idx) =>
    `${medals[idx] ?? `${idx + 1}.`} **${r.name}** — ${r.correct}/${questions.length} correct · **+${r.points} PULSE**`
  );

  await channel.send({
    embeds: [successEmbed(
      ranked.length === 0
        ? `Nobody answered this time. 😅 Maybe next round!`
        : `🏁 **Quiz over! Winners:**\n\n${board.join('\n')}`
    ).setTitle('🧠 Community Quiz — Leaderboard')],
  }).catch(() => {});
}

async function buildQuestions(cfg: AutoQuizConfig): Promise<QuizQuestion[] | undefined> {
  const count = cfg.questions_per_round + (cfg.bonus_enabled ? 1 : 0);
  if (cfg.auto_generate && cfg.topics.length && process.env.ANTHROPIC_API_KEY) {
    const topic = cfg.topics[Math.floor(Math.random() * cfg.topics.length)];
    try {
      const generated = await generateQuizQuestions(topic, count, cfg.language);
      if (generated.length) {
        return generated.map(g => ({ question: g.question, choices_json: g.choices, correct_index: g.correct_index, category: topic }));
      }
    } catch (err) {
      log('ERROR', 'Auto-quiz: AI generation failed, falling back to question bank', err);
    }
  }
  return undefined;
}

export async function launchQuiz(channel: GuildTextBasedChannel, cfg: AutoQuizConfig): Promise<void> {
  const questions = await buildQuestions(cfg);
  await runCommunityQuiz(channel, {
    questions,
    questionsPerRound: cfg.questions_per_round,
    secondsPerQuestion: cfg.seconds_per_question,
    rewardPerCorrect: cfg.reward_per_correct,
    category: cfg.category,
    bonus: cfg.bonus_enabled,
  });
}

const GRACE_MS = 30 * 60_000;

function dueSlot(cfg: AutoQuizConfig, fired: Record<string, string>): string | null {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  for (const t of cfg.daily_times_utc) {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const sched = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Number(m[1]), Number(m[2]));
    if (now.getTime() >= sched && now.getTime() < sched + GRACE_MS && fired[t] !== today) return t;
  }
  return null;
}

let interval: ReturnType<typeof setInterval> | null = null;

async function tickGuild(client: Client, guildId: string): Promise<void> {
  await runWithGuild(guildId, async () => {
    const cfg = getAutoQuizConfig();
    if (!cfg.enabled || !cfg.channel_id) return;

    const state = getRawSetting<{ fired?: Record<string, string> }>('auto_quiz_state') ?? {};
    const fired = state.fired ?? {};
    const slot = dueSlot(cfg, fired);
    if (!slot) return;

    fired[slot] = new Date().toISOString().slice(0, 10);
    await setSetting('auto_quiz_state', { fired });

    const channel = await client.channels.fetch(cfg.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      log('ERROR', `Auto-quiz channel ${cfg.channel_id} is not a usable text channel.`);
      return;
    }
    log('INFO', `Auto-quiz: launching daily quiz (slot ${slot}) in guild ${guildId}.`);
    await launchQuiz(channel as GuildTextBasedChannel, cfg);
  });
}

export function startAutoQuizScheduler(client: Client, intervalMs = 60_000): void {
  interval = setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      tickGuild(client, guild.id).catch(err => log('ERROR', 'Auto-quiz scheduler tick failed', err));
    }
  }, intervalMs);
}

export function stopAutoQuizScheduler(): void {
  if (interval) clearInterval(interval);
}
