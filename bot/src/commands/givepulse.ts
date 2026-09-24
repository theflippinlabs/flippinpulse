import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { grantPulse } from '../services/economy.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('givepulse')
  .setDescription('Admin: give PULSE to a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('Member to credit').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Amount of PULSE to give').setMinValue(1).setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason (optional)').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  // Recheck at execution time — setDefaultMemberPermissions is editable by
  // the Lord in Server Settings → Integrations, so trusting only the slash
  // command bit is not enough for an economy-mutating command.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Admins only.' : 'Réservé aux admins.')] });
    return;
  }

  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = interaction.options.getString('reason') ?? (en ? 'Admin grant' : 'Don admin');

  if (target.bot) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'You cannot give PULSE to a bot.' : 'Tu ne peux pas donner de PULSE à un bot.')] });
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
    await interaction.editReply({ embeds: [errorEmbed(res.error ?? (en ? 'Failed to give PULSE.' : 'Échec du don de PULSE.'))] });
    return;
  }

  await interaction.editReply({
    embeds: [successEmbed(en
      ? `Gave **${amount}** PULSE to <@${target.id}>.\nNew balance: **${res.newBalance}** PULSE.\nReason: ${reason}`
      : `**${amount}** PULSE donnés à <@${target.id}>.\nNouveau solde : **${res.newBalance}** PULSE.\nRaison : ${reason}`
    )],
  });
}
