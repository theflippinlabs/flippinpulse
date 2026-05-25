import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { logAndAnnounce } from '../services/moderation.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('unmute')
  .setDescription('Remove a member\'s timeout')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('Server only.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') ?? 'Manual unmute';

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    await interaction.editReply({ embeds: [errorEmbed('Member not found.')] });
    return;
  }
  if (!member.isCommunicationDisabled()) {
    await interaction.editReply({ embeds: [errorEmbed('Member is not currently muted.')] });
    return;
  }

  await member.timeout(null, reason).catch(err => {
    return interaction.editReply({ embeds: [errorEmbed(`Failed to unmute: ${err.message}`)] });
  });

  await logAndAnnounce(interaction.guild, {
    guildId: interaction.guild.id,
    type: 'unmute',
    targetId: target.id,
    moderatorId: interaction.user.id,
    reason,
  });

  await interaction.editReply({ embeds: [successEmbed(`Unmuted <@${target.id}>.`)] });
}
