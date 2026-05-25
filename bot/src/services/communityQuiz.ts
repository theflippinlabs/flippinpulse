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
import { pulseEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { log } from '../utils/logger.js';

export interface AutoQuizConfig {
  enabled: boolean;
  channel_id: string | null;
  interval_hours: number;
  questions_per_round: number;
  seconds_per_question: number;
  reward_per_correct: number;
  category: string | null;
}

const DEFAULTS: AutoQuizConfig = {
  enabled: false,
  channel_id: null,
  interval_hours: 6,
  questions_per_round: 5,
  seconds_per_question: 20,
  reward_per_correct: 10,
  category: null,
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

export async function runCommunityQuiz(
  channel: GuildTextBasedChannel,
  opts: { questionsPerRound: number; secondsPerQuestion: number; rewardPerCorrect: number; category: string | null },
): Promise<void> {
  let query = supabase
    .from('quiz_questions')
    .select('question, choices_json, correct_index, category')
    .eq('guild_id', currentGuildId())
    .eq('is_active', true);
  if (opts.category) query = query.eq('category', opts.category);
  const { data: all } = await query;

  if (!all?.length) {
    await channel.send({ embeds: [errorEmbed('No quiz questions are configured yet. An admin can add some with `/quizadmin add`.')] }).catch(() => {});
    return;
  }

  const questions = shuffle(all as QuizQuestion[]).slice(0, opts.questionsPerRound);
  const scores = new Map<string, { name: string; correct: number }>();

  await channel.send({
    embeds: [pulseEmbed('🧠 Community Quiz — everyone plays!').setDescription(
      `A quiz is starting!\n\n` +
      `📋 **${questions.length}** questions · ⏱️ ${opts.secondsPerQuestion}s each\n` +
      `💰 **+${opts.rewardPerCorrect} PULSE** per correct answer\n\n` +
      `Tap an answer button — first answer locks in. Good luck! 🍀`
    )],
  }).catch(() => {});
  await delay(4000);

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const choices = q.choices_json;

    const rowsFor = (revealed: boolean) => {
      const btns = choices.map((choice, idx) =>
        new ButtonBuilder()
          .setCustomId(`cq_${i}_${idx}`)
          .setLabel(`${LABELS[idx]} ${choice}`.slice(0, 80))
          .setStyle(revealed
            ? (idx === q.correct_index ? ButtonStyle.Success : ButtonStyle.Secondary)
            : ButtonStyle.Secondary)
          .setDisabled(revealed));
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      for (let r = 0; r < btns.length; r += 2) {
        rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(btns.slice(r, r + 2)));
      }
      return rows;
    };

    const qEmbed = pulseEmbed(`Question ${i + 1}/${questions.length}`)
      .setDescription(`**${q.question}**`)
      .setFooter({ text: `⏱️ ${opts.secondsPerQuestion}s to answer` });

    const msg = await channel.send({ embeds: [qEmbed], components: rowsFor(false) }).catch(() => null);
    if (!msg) continue;

    const answers = new Map<string, number>();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: opts.secondsPerQuestion * 1000,
    });

    await new Promise<void>((resolve) => {
      collector.on('collect', async (btn) => {
        const idx = Number(btn.customId.split('_').pop());
        if (answers.has(btn.user.id)) {
          await btn.reply({ content: 'You already answered this one!', ephemeral: true }).catch(() => {});
          return;
        }
        answers.set(btn.user.id, idx);
        if (!scores.has(btn.user.id)) scores.set(btn.user.id, { name: btn.user.username, correct: 0 });
        await btn.reply({ content: `✅ Locked in ${LABELS[idx]}`, ephemeral: true }).catch(() => {});
      });
      collector.on('end', () => resolve());
    });

    for (const [uid, idx] of answers) {
      if (idx === q.correct_index) scores.get(uid)!.correct++;
    }

    await msg.edit({
      embeds: [qEmbed.setFooter({ text: `✅ Correct answer: ${LABELS[q.correct_index]} ${choices[q.correct_index]} · ${answers.size} answered` })],
      components: rowsFor(true),
    }).catch(() => {});
    await delay(3000);
  }

  const ranked = [...scores.entries()]
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.correct - a.correct);

  for (const r of ranked) {
    const reward = r.correct * opts.rewardPerCorrect;
    if (reward > 0) await creditPulse(r.id, r.name, null, reward, 'community_quiz');
  }

  const medals = ['🥇', '🥈', '🥉'];
  const board = ranked.slice(0, 10).map((r, idx) =>
    `${medals[idx] ?? `${idx + 1}.`} **${r.name}** — ${r.correct}/${questions.length} (+${r.correct * opts.rewardPerCorrect} PULSE)`
  );

  await channel.send({
    embeds: [successEmbed(
      ranked.length === 0
        ? `Nobody answered this time. 😅 Maybe next round!`
        : `🏁 **Quiz over!** Here are the results:\n\n${board.join('\n')}`
    ).setTitle('🧠 Community Quiz — Results')],
  }).catch(() => {});
}

async function getNextRun(): Promise<number> {
  const state = getRawSetting<{ next_run_at?: string }>('auto_quiz_state');
  if (state?.next_run_at) return new Date(state.next_run_at).getTime();
  const cfg = getAutoQuizConfig();
  const next = Date.now() + cfg.interval_hours * 3_600_000;
  await setSetting('auto_quiz_state', { next_run_at: new Date(next).toISOString() });
  return next;
}

let interval: ReturnType<typeof setInterval> | null = null;

async function tickGuild(client: Client, guildId: string): Promise<void> {
  await runWithGuild(guildId, async () => {
    const cfg = getAutoQuizConfig();
    if (!cfg.enabled || !cfg.channel_id) return;

    const nextRun = await getNextRun();
    if (Date.now() < nextRun) return;

    await setSetting('auto_quiz_state', {
      next_run_at: new Date(Date.now() + cfg.interval_hours * 3_600_000).toISOString(),
    });

    const channel = await client.channels.fetch(cfg.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      log('ERROR', `Auto-quiz channel ${cfg.channel_id} is not a usable text channel.`);
      return;
    }
    log('INFO', `Auto-quiz: launching a community quiz in guild ${guildId}.`);
    await runCommunityQuiz(channel as GuildTextBasedChannel, {
      questionsPerRound: cfg.questions_per_round,
      secondsPerQuestion: cfg.seconds_per_question,
      rewardPerCorrect: cfg.reward_per_correct,
      category: cfg.category,
    });
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
