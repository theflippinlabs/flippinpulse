import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { listWarnings } from '../services/moderation.js';
import { errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('List warnings for a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('User to inspect').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('Server only.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const warnings = await listWarnings(interaction.guild.id, target.id);

  if (!warnings.length) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`Warnings — ${target.username}`).setDescription('No warnings on record.').setColor(0x22C55E)] });
    return;
  }

  const lines = warnings.map((w, i) => {
    const ts = Math.floor(new Date(w.created_at).getTime() / 1000);
    return `**${i + 1}.** <t:${ts}:R> — by <@${w.moderator_discord_id ?? 'unknown'}>\n  ${w.reason ?? '_no reason_'}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xFACC15)
    .setTitle(`Warnings — ${target.username}`)
    .setDescription(`Total: **${warnings.length}**\n\n${lines.join('\n\n')}`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
