import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { logAndAnnounce } from '../services/moderation.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a member from the server')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
  .addIntegerOption(o => o.setName('delete_days').setDescription('Delete message history (0-7 days)').setMinValue(0).setMaxValue(7).setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('Server only.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') ?? 'No reason provided';
  const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member) {
    if (!member.bannable) {
      await interaction.editReply({ embeds: [errorEmbed('I cannot ban this member (missing permission or role hierarchy).')] });
      return;
    }
    await member.send({
      embeds: [errorEmbed(`You were banned from **${interaction.guild.name}**.\nReason: ${reason}`)],
    }).catch(() => null);
  }

  try {
    await interaction.guild.bans.create(target.id, { reason, deleteMessageSeconds: deleteDays * 86400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await interaction.editReply({ embeds: [errorEmbed(`Failed to ban: ${msg}`)] });
    return;
  }

  await logAndAnnounce(interaction.guild, {
    guildId: interaction.guild.id,
    type: 'ban',
    targetId: target.id,
    moderatorId: interaction.user.id,
    reason,
    metadata: deleteDays ? { delete_days: deleteDays } : undefined,
  });

  await interaction.editReply({ embeds: [successEmbed(`Banned <@${target.id}>. Reason: ${reason}`)] });
}
