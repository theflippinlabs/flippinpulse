import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('quizadmin')
  .setDescription('Admin: manage community quiz questions')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s =>
    s.setName('add').setDescription('Add a quiz question')
      .addStringOption(o => o.setName('question').setDescription('The question').setRequired(true))
      .addStringOption(o => o.setName('correct').setDescription('The correct answer').setRequired(true))
      .addStringOption(o => o.setName('wrong1').setDescription('A wrong answer').setRequired(true))
      .addStringOption(o => o.setName('wrong2').setDescription('Another wrong answer').setRequired(true))
      .addStringOption(o => o.setName('wrong3').setDescription('A 3rd wrong answer (optional)').setRequired(false))
      .addStringOption(o => o.setName('category').setDescription('e.g. main_city, kronos, community (default: community)').setRequired(false)))
  .addSubcommand(s =>
    s.setName('list').setDescription('List quiz questions')
      .addStringOption(o => o.setName('category').setDescription('Filter by category').setRequired(false)))
  .addSubcommand(s =>
    s.setName('remove').setDescription('Remove a question (by matching its text)')
      .addStringOption(o => o.setName('contains').setDescription('Part of the question text').setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const question = interaction.options.getString('question', true);
    const correct = interaction.options.getString('correct', true);
    const wrongs = [
      interaction.options.getString('wrong1', true),
      interaction.options.getString('wrong2', true),
      interaction.options.getString('wrong3'),
    ].filter((w): w is string => !!w);
    const category = (interaction.options.getString('category') ?? 'community').toLowerCase().trim();

    // Shuffle answers and record where the correct one landed.
    const choices = [correct, ...wrongs];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    const correctIndex = choices.indexOf(correct);

    const { error } = await supabase.from('quiz_questions').insert({
      question,
      choices_json: choices,
      correct_index: correctIndex,
      category,
      is_active: true,
    });

    if (error) {
      await interaction.editReply({ embeds: [errorEmbed(`Could not add question: ${error.message}`)] });
      return;
    }
    await interaction.editReply({
      embeds: [successEmbed(
        `Added a question to **${category}**:\n\n**${question}**\n` +
        choices.map((c, i) => `${i === correctIndex ? '✅' : '▫️'} ${c}`).join('\n')
      )],
    });
    return;
  }

  if (sub === 'list') {
    const category = interaction.options.getString('category');
    let query = supabase.from('quiz_questions').select('question, category, is_active').order('category', { ascending: true }).limit(50);
    if (category) query = query.eq('category', category.toLowerCase().trim());
    const { data: rows } = await query;

    if (!rows?.length) {
      await interaction.editReply({ embeds: [pulseEmbed('Quiz questions').setDescription('No questions yet. Add some with `/quizadmin add`.')] });
      return;
    }
    const lines = rows.map(r => `${r.is_active ? '🟢' : '⚫'} [${r.category}] ${r.question}`.slice(0, 100));
    await interaction.editReply({ embeds: [pulseEmbed(`Quiz questions (${rows.length})`).setDescription(lines.join('\n').slice(0, 4000))] });
    return;
  }

  // remove
  const contains = interaction.options.getString('contains', true);
  const { data: matches } = await supabase
    .from('quiz_questions')
    .select('id, question')
    .ilike('question', `%${contains}%`)
    .limit(5);

  if (!matches?.length) {
    await interaction.editReply({ embeds: [errorEmbed(`No question matches "${contains}".`)] });
    return;
  }
  if (matches.length > 1) {
    await interaction.editReply({
      embeds: [errorEmbed(
        `That matches **${matches.length}** questions — be more specific:\n` +
        matches.map(m => `• ${m.question}`).join('\n')
      )],
    });
    return;
  }
  await supabase.from('quiz_questions').delete().eq('id', matches[0].id);
  await interaction.editReply({ embeds: [successEmbed(`Removed: **${matches[0].question}**`)] });
}
