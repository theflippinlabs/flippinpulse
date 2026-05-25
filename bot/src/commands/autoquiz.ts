import {
  ChannelType,
  ChatInputCommandInteraction,
  GuildTextBasedChannel,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { setSetting } from '../services/settings.js';
import { getAutoQuizConfig, launchQuiz, type AutoQuizConfig } from '../services/communityQuiz.js';
import { successEmbed, errorEmbed, pulseEmbed } from '../utils/embeds.js';

async function saveConfig(patch: Partial<AutoQuizConfig>): Promise<void> {
  await setSetting('auto_quiz', { ...getAutoQuizConfig(), ...patch });
}

const TIME_RE = /^\d{1,2}:\d{2}$/;

export const data = new SlashCommandBuilder()
  .setName('autoquiz')
  .setDescription('Admin: configure the automatic daily community quiz')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s =>
    s.setName('channel').setDescription('Set the channel where quizzes are posted')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(s =>
    s.setName('times').setDescription('Set the daily quiz times in UTC (covers your active timezones)')
      .addStringOption(o => o.setName('utc_times').setDescription('Comma-separated, e.g. 18:00,00:00').setRequired(true)))
  .addSubcommand(s =>
    s.setName('topics').setDescription('Set the AI topics to rotate through')
      .addStringOption(o => o.setName('list').setDescription('Comma-separated, e.g. cinema, music, Cronos, MainCity').setRequired(true)))
  .addSubcommand(s =>
    s.setName('settings').setDescription('Tune questions, timer, reward, bonus, language')
      .addIntegerOption(o => o.setName('questions').setDescription('Normal questions per round').setMinValue(1).setMaxValue(15).setRequired(false))
      .addIntegerOption(o => o.setName('seconds').setDescription('Seconds per question').setMinValue(5).setMaxValue(120).setRequired(false))
      .addIntegerOption(o => o.setName('reward').setDescription('PULSE per correct answer').setMinValue(0).setRequired(false))
      .addBooleanOption(o => o.setName('bonus').setDescription('Add a double-points bonus question?').setRequired(false))
      .addBooleanOption(o => o.setName('ai_generate').setDescription('Generate fresh questions with AI each time?').setRequired(false))
      .addStringOption(o => o.setName('language').setDescription('Question language, e.g. English, French').setRequired(false)))
  .addSubcommand(s =>
    s.setName('toggle').setDescription('Turn the automatic quiz on or off')
      .addBooleanOption(o => o.setName('enabled').setDescription('On or off').setRequired(true)))
  .addSubcommand(s => s.setName('now').setDescription('Launch a quiz right now (uses current settings)'))
  .addSubcommand(s => s.setName('status').setDescription('Show the current auto-quiz configuration'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();
  const cfg = getAutoQuizConfig();

  if (sub === 'channel') {
    const channel = interaction.options.getChannel('channel', true);
    await saveConfig({ channel_id: channel.id });
    await interaction.editReply({ embeds: [successEmbed(`Daily quizzes will be posted in <#${channel.id}>.`)] });
    return;
  }

  if (sub === 'times') {
    const times = interaction.options.getString('utc_times', true)
      .split(',').map(t => t.trim()).filter(Boolean);
    const invalid = times.filter(t => !TIME_RE.test(t));
    if (invalid.length || !times.length) {
      await interaction.editReply({ embeds: [errorEmbed(`Use 24h UTC times like \`18:00,00:00\`. Invalid: ${invalid.join(', ') || '(none)'}`)] });
      return;
    }
    await saveConfig({ daily_times_utc: times });
    await setSetting('auto_quiz_state', { fired: {} });
    await interaction.editReply({ embeds: [successEmbed(`Daily quiz times set to **${times.join(', ')} UTC**.`)] });
    return;
  }

  if (sub === 'topics') {
    const topics = interaction.options.getString('list', true).split(',').map(t => t.trim()).filter(Boolean);
    if (!topics.length) {
      await interaction.editReply({ embeds: [errorEmbed('Give at least one topic.')] });
      return;
    }
    await saveConfig({ topics });
    await interaction.editReply({ embeds: [successEmbed(`AI quiz topics: ${topics.join(', ')}.`)] });
    return;
  }

  if (sub === 'settings') {
    const patch: Partial<AutoQuizConfig> = {};
    const questions = interaction.options.getInteger('questions');
    const seconds = interaction.options.getInteger('seconds');
    const reward = interaction.options.getInteger('reward');
    const bonus = interaction.options.getBoolean('bonus');
    const ai = interaction.options.getBoolean('ai_generate');
    const language = interaction.options.getString('language');
    if (questions !== null) patch.questions_per_round = questions;
    if (seconds !== null) patch.seconds_per_question = seconds;
    if (reward !== null) patch.reward_per_correct = reward;
    if (bonus !== null) patch.bonus_enabled = bonus;
    if (ai !== null) patch.auto_generate = ai;
    if (language !== null) patch.language = language.trim();
    if (Object.keys(patch).length === 0) {
      await interaction.editReply({ embeds: [errorEmbed('Provide at least one setting to change.')] });
      return;
    }
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
    await interaction.editReply({ embeds: [successEmbed(`Automatic daily quiz is now **${enabled ? 'ON ✅' : 'OFF ⛔'}**.`)] });
    return;
  }

  if (sub === 'status') {
    await interaction.editReply({
      embeds: [pulseEmbed('🧠 Auto-Quiz configuration').setDescription(
        `**Status:** ${cfg.enabled ? 'ON ✅' : 'OFF ⛔'}\n` +
        `**Channel:** ${cfg.channel_id ? `<#${cfg.channel_id}>` : '*(not set)*'}\n` +
        `**Daily times (UTC):** ${cfg.daily_times_utc.join(', ')}\n` +
        `**Questions:** ${cfg.questions_per_round}${cfg.bonus_enabled ? ' + 1 bonus (×2)' : ''}\n` +
        `**Time/question:** ${cfg.seconds_per_question}s\n` +
        `**Reward/correct:** ${cfg.reward_per_correct} PULSE\n` +
        `**AI generation:** ${cfg.auto_generate ? `ON (${cfg.language})` : 'OFF (uses question bank)'}\n` +
        `**Topics:** ${cfg.topics.join(', ')}`
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
  await interaction.editReply({ embeds: [successEmbed('Launching a quiz here now! 🧠 (generating questions…)')] });
  void launchQuiz(channel as GuildTextBasedChannel, cfg);
}
