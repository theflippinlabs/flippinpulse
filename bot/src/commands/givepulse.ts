import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { grantPulse } from '../services/economy.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('givepulse')
  .setDescription('Admin: give PULSE to a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('Member to credit').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Amount of PULSE to give').setMinValue(1).setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason (optional)').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = interaction.options.getString('reason') ?? 'Admin grant';

  if (target.bot) {
    await interaction.editReply({ embeds: [errorEmbed('You cannot give PULSE to a bot.')] });
    return;
  }

  const res = await grantPulse(
    target.id,
    target.username,
    target.displayAvatarURL(),
    amount,
    reason,
    interaction.user.id
  );

  if (!res.success) {
    await interaction.editReply({ embeds: [errorEmbed(res.error ?? 'Failed to give PULSE.')] });
    return;
  }

  await interaction.editReply({
    embeds: [successEmbed(
      `Gave **${amount}** PULSE to <@${target.id}>.\n` +
      `New balance: **${res.newBalance}** PULSE.\n` +
      `Reason: ${reason}`
    )],
  });
}
