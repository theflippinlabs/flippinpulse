import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { setPulse } from '../services/economy.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('setpulse')
  .setDescription('Admin: set a member\'s PULSE balance to an exact value')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Exact PULSE balance').setMinValue(0).setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason (optional)').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Admins only.' : 'Réservé aux admins.')] });
    return;
  }

  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = interaction.options.getString('reason') ?? (en ? 'Admin set balance' : 'Solde défini par admin');

  if (target.bot) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'You cannot set PULSE for a bot.' : 'Tu ne peux pas définir le PULSE d\'un bot.')] });
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
    await interaction.editReply({ embeds: [errorEmbed(res.error ?? (en ? 'Failed to set PULSE.' : 'Échec de la définition du PULSE.'))] });
    return;
  }

  await interaction.editReply({
    embeds: [successEmbed(en
      ? `Set <@${target.id}>'s balance to **${res.newBalance}** PULSE.\nReason: ${reason}`
      : `Solde de <@${target.id}> défini à **${res.newBalance}** PULSE.\nRaison : ${reason}`)],
  });
}
