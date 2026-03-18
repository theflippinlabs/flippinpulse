import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  Message,
} from 'discord.js';
import { supabase } from '../supabase.js';
import {
  getGameConfig,
  isGameEnabled,
  createGameSession,
  updateGameSession,
  saveGameResult,
  earnPulse,
} from '../services/games.js';
import { pulseEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';

interface QuizQuestion {
  id: string;
  question: string;
  choices_json: string[];
  correct_index: number;
  difficulty: string;
  category: string;
}

export const data = new SlashCommandBuilder()
  .setName('quiz')
  .setDescription('Start a Quiz Blitz — answer questions to earn PULSE!')
  .addStringOption(opt =>
    opt.setName('difficulty')
      .setDescription('Question difficulty')
      .setRequired(false)
      .addChoices(
        { name: 'Easy', value: 'easy' },
        { name: 'Medium', value: 'medium' },
        { name: 'Hard', value: 'hard' },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isGameEnabled('quiz')) {
    await interaction.reply({ embeds: [errorEmbed('Quiz Blitz is currently disabled.')], ephemeral: true });
    return;
  }

  const cfg = getGameConfig('quiz');
  const conf = (cfg?.config_json ?? {}) as {
    questions_per_round: number;
    time_per_question_seconds: number;
    cooldown_seconds: number;
    rewards: number[];
  };
  const questionsPerRound = conf.questions_per_round ?? 5;
  const timePerQuestion = (conf.time_per_question_seconds ?? 15) * 1000;
  const rewards = conf.rewards ?? [20, 15, 10, 5, 5];

  const difficulty = interaction.options.getString('difficulty');

  // Fetch random questions
  let query = supabase
    .from('quiz_questions')
    .select('*')
    .eq('is_active', true);

  if (difficulty) query = query.eq('difficulty', difficulty);

  const { data: allQuestions } = await query;

  if (!allQuestions || allQuestions.length === 0) {
    await interaction.reply({ embeds: [errorEmbed('No quiz questions available.')], ephemeral: true });
    return;
  }

  // Shuffle and pick
  const shuffled = allQuestions.sort(() => Math.random() - 0.5);
  const questions = shuffled.slice(0, questionsPerRound) as QuizQuestion[];

  const sessionId = await createGameSession('quiz', interaction.channelId, {
    questionsCount: questions.length,
    difficulty: difficulty ?? 'mixed',
  });

  if (!sessionId) {
    await interaction.reply({ embeds: [errorEmbed('Failed to start quiz.')], ephemeral: true });
    return;
  }

  await interaction.reply({
    embeds: [pulseEmbed('🧠 Quiz Blitz').setDescription(
      `Starting **${questions.length}** questions!\n⏱️ ${conf.time_per_question_seconds ?? 15}s per question\n\nGet ready...`
    )],
  });

  let score = 0;
  const results: { question: string; correct: boolean; answer: string | null }[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const choices = q.choices_json;
    const labels = ['🅰️', '🅱️', '🅲️', '🅳️'];

    const buttons = choices.map((choice, idx) =>
      new ButtonBuilder()
        .setCustomId(`quiz_${sessionId}_${i}_${idx}`)
        .setLabel(`${labels[idx]} ${choice}`)
        .setStyle(ButtonStyle.Secondary)
    );

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    // Put 2 buttons per row
    for (let r = 0; r < buttons.length; r += 2) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(r, r + 2)));
    }

    const qEmbed = pulseEmbed(`Question ${i + 1}/${questions.length}`)
      .setDescription(`**${q.question}**\n\n${q.difficulty ? `Difficulty: ${q.difficulty}` : ''}`)
      .setFooter({ text: `⏱️ ${conf.time_per_question_seconds ?? 15}s to answer` });

    const msg = await interaction.followUp({ embeds: [qEmbed], components: rows, fetchReply: true }) as Message;

    // Wait for answer
    const answered = await new Promise<boolean>((resolve) => {
      const qCollector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: timePerQuestion,
        filter: (btnI) => btnI.user.id === interaction.user.id,
        max: 1,
      });

      qCollector.on('collect', async (btnI) => {
        const selectedIdx = parseInt(btnI.customId.split('_').pop()!);
        const isCorrect = selectedIdx === q.correct_index;

        if (isCorrect) score++;
        results.push({ question: q.question, correct: isCorrect, answer: choices[selectedIdx] });

        // Color buttons
        const newButtons = choices.map((choice, idx) =>
          new ButtonBuilder()
            .setCustomId(`quiz_${sessionId}_${i}_${idx}_done`)
            .setLabel(`${labels[idx]} ${choice}`)
            .setStyle(
              idx === q.correct_index ? ButtonStyle.Success :
              idx === selectedIdx && !isCorrect ? ButtonStyle.Danger :
              ButtonStyle.Secondary
            )
            .setDisabled(true)
        );

        const newRows: ActionRowBuilder<ButtonBuilder>[] = [];
        for (let r = 0; r < newButtons.length; r += 2) {
          newRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(newButtons.slice(r, r + 2)));
        }

        const resultText = isCorrect ? '✅ Correct!' : `❌ Wrong! Answer: **${choices[q.correct_index]}**`;
        await btnI.update({
          embeds: [qEmbed.setFooter({ text: resultText })],
          components: newRows,
        });
        resolve(true);
      });

      qCollector.on('end', (collected) => {
        if (collected.size === 0) {
          results.push({ question: q.question, correct: false, answer: null });
          resolve(false);
        }
      });
    });

    // Brief pause between questions
    if (i < questions.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // Calculate reward
  const rewardAmount = rewards.slice(0, score).reduce((a, b) => a + b, 0);

  if (rewardAmount > 0) {
    await earnPulse(interaction.user.id, rewardAmount, `quiz_${score}/${questions.length}`, sessionId);
  }

  await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
  await saveGameResult(sessionId, { score, total: questions.length, reward: rewardAmount, results });

  const percentage = Math.round((score / questions.length) * 100);
  const emoji = percentage >= 80 ? '🏆' : percentage >= 60 ? '👏' : percentage >= 40 ? '🤔' : '😅';

  const finalEmbed = pulseEmbed(`${emoji} Quiz Complete!`)
    .setDescription(
      `**Score: ${score}/${questions.length}** (${percentage}%)\n\n` +
      `💰 Earned: **${rewardAmount}** PULSE\n\n` +
      results.map((r, idx) => `${r.correct ? '✅' : '❌'} Q${idx + 1}`).join(' ')
    );

  await interaction.followUp({ embeds: [finalEmbed] });
}
