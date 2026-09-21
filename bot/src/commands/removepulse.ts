import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { revokePulse } from '../services/economy.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('removepulse')
  .setDescription('Admin: remove PULSE from a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('Member to debit').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Amount of PULSE to remove').setMinValue(1).setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason (optional)').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = interaction.options.getString('reason') ?? (en ? 'Admin revoke' : 'Retrait admin');

  const res = await revokePulse(target.id, amount, reason, interaction.user.id);

  if (!res.success) {
    await interaction.editReply({ embeds: [errorEmbed(res.error ?? (en ? 'Failed to remove PULSE.' : 'Échec du retrait de PULSE.'))] });
    return;
  }

  await interaction.editReply({
    embeds: [successEmbed(en
      ? `Removed PULSE from <@${target.id}>.\nNew balance: **${res.newBalance}** PULSE.\nReason: ${reason}`
      : `PULSE retirés à <@${target.id}>.\nNouveau solde : **${res.newBalance}** PULSE.\nRaison : ${reason}`
    )],
  });
}
