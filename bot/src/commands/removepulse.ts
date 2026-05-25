import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { revokePulse } from '../services/economy.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('removepulse')
  .setDescription('Admin: remove PULSE from a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('Member to debit').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Amount of PULSE to remove').setMinValue(1).setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason (optional)').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = interaction.options.getString('reason') ?? 'Admin revoke';

  const res = await revokePulse(target.id, amount, reason, interaction.user.id);

  if (!res.success) {
    await interaction.editReply({ embeds: [errorEmbed(res.error ?? 'Failed to remove PULSE.')] });
    return;
  }

  await interaction.editReply({
    embeds: [successEmbed(
      `Removed PULSE from <@${target.id}>.\n` +
      `New balance: **${res.newBalance}** PULSE.\n` +
      `Reason: ${reason}`
    )],
  });
}
