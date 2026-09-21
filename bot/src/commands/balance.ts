import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getBalance } from '../services/economy.js';
import { pulseEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your PULSE balance');

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const bal = await getBalance(interaction.user.id);

  if (!bal) {
    const msg = locale === 'en'
      ? 'No account found. Be active to get started!'
      : 'Aucun compte trouvé. Sois actif pour commencer !';
    await interaction.reply({ embeds: [errorEmbed(msg)], ephemeral: true });
    return;
  }

  const en = locale === 'en';
  const embed = pulseEmbed(en ? 'PULSE Balance' : 'Solde PULSE')
    .addFields(
      { name: en ? 'Current balance' : 'Solde actuel', value: `**${bal.balance}** PULSE`, inline: true },
      { name: en ? 'Total earned' : 'Total gagné',    value: `${bal.earned}`, inline: true },
      { name: en ? 'Total spent'  : 'Total dépensé',  value: `${bal.spent}`,  inline: true },
    );

  await interaction.reply({ embeds: [embed] });
}
