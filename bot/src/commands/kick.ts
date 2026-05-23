import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { logAndAnnounce } from '../services/moderation.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a member from the server')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('Server only.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') ?? 'No reason provided';

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    await interaction.editReply({ embeds: [errorEmbed('Member not found.')] });
    return;
  }
  if (!member.kickable) {
    await interaction.editReply({ embeds: [errorEmbed('I cannot kick this member (missing permission or role hierarchy).')] });
    return;
  }

  await member.send({
    embeds: [errorEmbed(`You were kicked from **${interaction.guild.name}**.\nReason: ${reason}`)],
  }).catch(() => null);

  try {
    await member.kick(reason);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await interaction.editReply({ embeds: [errorEmbed(`Failed to kick: ${msg}`)] });
    return;
  }

  await logAndAnnounce(interaction.guild, {
    guildId: interaction.guild.id,
    type: 'kick',
    targetId: target.id,
    moderatorId: interaction.user.id,
    reason,
  });

  await interaction.editReply({ embeds: [successEmbed(`Kicked <@${target.id}>. Reason: ${reason}`)] });
}
