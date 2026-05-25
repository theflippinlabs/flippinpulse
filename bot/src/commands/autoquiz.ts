import {
  ChannelType,
  ChatInputCommandInteraction,
  GuildTextBasedChannel,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getRawSetting, setSetting } from '../services/settings.js';
import { getAutoQuizConfig, runCommunityQuiz, type AutoQuizConfig } from '../services/communityQuiz.js';
import { successEmbed, errorEmbed, pulseEmbed } from '../utils/embeds.js';

async function saveConfig(patch: Partial<AutoQuizConfig>): Promise<void> {
  const current = { ...getAutoQuizConfig(), ...(getRawSetting('auto_quiz') ?? {}) } as AutoQuizConfig;
  await setSetting('auto_quiz', { ...current, ...patch });
}

export const data = new SlashCommandBuilder()
  .setName('autoquiz')
  .setDescription('Admin: configure the automatic community quiz')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s =>
    s.setName('channel').setDescription('Set the channel where quizzes are posted')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(s =>
    s.setName('interval').setDescription('How often to auto-launch a quiz')
      .addNumberOption(o => o.setName('hours').setDescription('Hours between quizzes').setMinValue(0.1).setRequired(true)))
  .addSubcommand(s =>
    s.setName('settings').setDescription('Tune questions, timer and reward')
      .addIntegerOption(o => o.setName('questions').setDescription('Questions per round').setMinValue(1).setMaxValue(20).setRequired(false))
      .addIntegerOption(o => o.setName('seconds').setDescription('Seconds per question').setMinValue(5).setMaxValue(120).setRequired(false))
      .addIntegerOption(o => o.setName('reward').setDescription('PULSE per correct answer').setMinValue(0).setRequired(false))
      .addStringOption(o => o.setName('category').setDescription('Only use this category (or "all")').setRequired(false)))
  .addSubcommand(s =>
    s.setName('toggle').setDescription('Turn the automatic quiz on or off')
      .addBooleanOption(o => o.setName('enabled').setDescription('On or off').setRequired(true)))
  .addSubcommand(s => s.setName('now').setDescription('Launch a community quiz right now'))
  .addSubcommand(s => s.setName('status').setDescription('Show the current auto-quiz configuration'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();
  const cfg = getAutoQuizConfig();

  if (sub === 'channel') {
    const channel = interaction.options.getChannel('channel', true);
    await saveConfig({ channel_id: channel.id });
    await interaction.editReply({ embeds: [successEmbed(`Community quizzes will be posted in <#${channel.id}>.`)] });
    return;
  }

  if (sub === 'interval') {
    const hours = interaction.options.getNumber('hours', true);
    await saveConfig({ interval_hours: hours });
    await setSetting('auto_quiz_state', { next_run_at: new Date(Date.now() + hours * 3_600_000).toISOString() });
    await interaction.editReply({ embeds: [successEmbed(`A quiz will auto-launch every **${hours}h** (next one in ~${hours}h).`)] });
    return;
  }

  if (sub === 'settings') {
    const patch: Partial<AutoQuizConfig> = {};
    const questions = interaction.options.getInteger('questions');
    const seconds = interaction.options.getInteger('seconds');
    const reward = interaction.options.getInteger('reward');
    const category = interaction.options.getString('category');
    if (questions !== null) patch.questions_per_round = questions;
    if (seconds !== null) patch.seconds_per_question = seconds;
    if (reward !== null) patch.reward_per_correct = reward;
    if (category !== null) patch.category = category.toLowerCase().trim() === 'all' ? null : category.toLowerCase().trim();
    await saveConfig(patch);
    await interaction.editReply({ embeds: [successEmbed('Auto-quiz settings updated. *(Takes effect within a minute.)*')] });
    return;
  }

  if (sub === 'toggle') {
    const enabled = interaction.options.getBoolean('enabled', true);
    await saveConfig({ enabled });
    if (enabled && !cfg.channel_id) {
      await interaction.editReply({ embeds: [errorEmbed('Enabled — but set a channel first with `/autoquiz channel`.')] });
      return;
    }
    await interaction.editReply({ embeds: [successEmbed(`Automatic quiz is now **${enabled ? 'ON ✅' : 'OFF ⛔'}**.`)] });
    return;
  }

  if (sub === 'status') {
    await interaction.editReply({
      embeds: [pulseEmbed('🧠 Auto-Quiz configuration').setDescription(
        `**Status:** ${cfg.enabled ? 'ON ✅' : 'OFF ⛔'}\n` +
        `**Channel:** ${cfg.channel_id ? `<#${cfg.channel_id}>` : '*(not set)*'}\n` +
        `**Every:** ${cfg.interval_hours}h\n` +
        `**Questions/round:** ${cfg.questions_per_round}\n` +
        `**Time/question:** ${cfg.seconds_per_question}s\n` +
        `**Reward/correct:** ${cfg.reward_per_correct} PULSE\n` +
        `**Category:** ${cfg.category ?? 'all'}`
      )],
    });
    return;
  }

  // now
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    await interaction.editReply({ embeds: [errorEmbed('Run this in a text channel.')] });
    return;
  }
  await interaction.editReply({ embeds: [successEmbed('Launching a community quiz here now! 🧠')] });
  void runCommunityQuiz(channel as GuildTextBasedChannel, {
    questionsPerRound: cfg.questions_per_round,
    secondsPerQuestion: cfg.seconds_per_question,
    rewardPerCorrect: cfg.reward_per_correct,
    category: cfg.category,
  });
}
