import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { spendPulse } from '../services/economy.js';
import { earnPulse } from '../services/games.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';
import { log } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('gift')
  .setDescription('Send PULSE to another member / Envoyer du PULSE à un membre')
  .addUserOption(o => o.setName('user').setDescription('Recipient / Destinataire').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Amount 1-50000').setMinValue(1).setMaxValue(50_000).setRequired(true))
  .addStringOption(o => o.setName('note').setDescription('Optional note (max 100 chars)').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const recipient = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const note = interaction.options.getString('note')?.slice(0, 100) ?? '';

  if (recipient.id === interaction.user.id) {
    await interaction.reply({ embeds: [errorEmbed(fr ? 'Tu ne peux pas te faire un cadeau à toi-même.' : "You can't gift yourself.")], flags: MessageFlags.Ephemeral });
    return;
  }
  if (recipient.bot) {
    await interaction.reply({ embeds: [errorEmbed(fr ? 'Impossible d\'offrir à un bot.' : "You can't gift a bot.")], flags: MessageFlags.Ephemeral });
    return;
  }

  const debit = await spendPulse(interaction.user.id, amount, `Gift to ${recipient.username}${note ? ` — ${note}` : ''}`);
  if (!debit.success) {
    await interaction.reply({ embeds: [errorEmbed(debit.error ?? (fr ? 'Débit impossible.' : 'Debit failed.'))], flags: MessageFlags.Ephemeral });
    return;
  }
  await earnPulse(recipient.id, amount, `Gift from ${interaction.user.username}${note ? ` — ${note}` : ''}`, `gift:${interaction.user.id}`);

  // Notify recipient in DM (best effort, ignore if DMs closed).
  try {
    const recipientLocale = await getUserLocale(recipient.id);
    const recFr = recipientLocale === 'fr';
    await recipient.send({
      embeds: [pulseEmbed(recFr ? '🎁 Cadeau reçu !' : '🎁 Gift received!').setDescription(
        (recFr
          ? `**${interaction.user.username}** t'a offert **${amount} PULSE**.`
          : `**${interaction.user.username}** sent you **${amount} PULSE**.`) +
        (note ? `\n\n> ${note}` : '')
      )],
    });
  } catch (err) { log('INFO', 'Gift DM failed (recipient DMs closed?)', err); }

  await interaction.reply({
    embeds: [successEmbed(fr
      ? `🎁 Tu offres **${amount} PULSE** à <@${recipient.id}>${note ? `\n> "${note}"` : ''}\n\nTon nouveau solde : **${debit.newBalance}** PULSE.`
      : `🎁 You gifted **${amount} PULSE** to <@${recipient.id}>${note ? `\n> "${note}"` : ''}\n\nYour new balance: **${debit.newBalance}** PULSE.`)],
    flags: MessageFlags.Ephemeral,
  });
}
