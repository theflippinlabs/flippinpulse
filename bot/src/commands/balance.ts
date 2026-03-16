import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getBalance } from '../services/economy.js';
import { pulseEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('Check your PULSE balance');

export async function execute(interaction: ChatInputCommandInteraction) {
  const bal = await getBalance(interaction.user.id);

  if (!bal) {
    await interaction.reply({ embeds: [errorEmbed('No account found. Be active to get started!')], ephemeral: true });
    return;
  }

  const embed = pulseEmbed('PULSE Balance')
    .addFields(
      { name: 'Current Balance', value: `**${bal.balance}** PULSE`, inline: true },
      { name: 'Total Earned', value: `${bal.earned}`, inline: true },
      { name: 'Total Spent', value: `${bal.spent}`, inline: true },
    );

  await interaction.reply({ embeds: [embed] });
}
