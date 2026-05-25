import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { setPulse } from '../services/economy.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('setpulse')
  .setDescription('Admin: set a member\'s PULSE balance to an exact value')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Exact PULSE balance').setMinValue(0).setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason (optional)').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = interaction.options.getString('reason') ?? 'Admin set balance';

  if (target.bot) {
    await interaction.editReply({ embeds: [errorEmbed('You cannot set PULSE for a bot.')] });
    return;
  }

  const res = await setPulse(
    target.id,
    target.username,
    target.displayAvatarURL(),
    amount,
    reason,
    interaction.user.id
  );

  if (!res.success) {
    await interaction.editReply({ embeds: [errorEmbed(res.error ?? 'Failed to set PULSE.')] });
    return;
  }

  await interaction.editReply({
    embeds: [successEmbed(`Set <@${target.id}>'s balance to **${res.newBalance}** PULSE.\nReason: ${reason}`)],
  });
}
