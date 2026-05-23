import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { countWarnings, logAndAnnounce } from '../services/moderation.js';
import { getModConfig } from '../services/settings.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Issue a warning to a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('Server only.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);

  if (target.bot) {
    await interaction.editReply({ embeds: [errorEmbed('Cannot warn a bot.')] });
    return;
  }
  if (target.id === interaction.user.id) {
    await interaction.editReply({ embeds: [errorEmbed('You cannot warn yourself.')] });
    return;
  }

  await logAndAnnounce(interaction.guild, {
    guildId: interaction.guild.id,
    type: 'warn',
    targetId: target.id,
    moderatorId: interaction.user.id,
    reason,
  });

  const count = await countWarnings(interaction.guild.id, target.id);
  const threshold = getModConfig().auto_warn_threshold;

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member) {
    await member.send({
      embeds: [errorEmbed(`You were warned in **${interaction.guild.name}**.\nReason: ${reason}\nTotal warnings: ${count}`)],
    }).catch(() => null);
  }

  let note = '';
  if (threshold > 0 && count >= threshold) {
    note = `\n⚠️ User has reached **${count}** warnings (threshold: ${threshold}). Consider escalating.`;
  }

  await interaction.editReply({
    embeds: [successEmbed(`Warned <@${target.id}>. Total warnings: **${count}**.${note}`)],
  });
}
