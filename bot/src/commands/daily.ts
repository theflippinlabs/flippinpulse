import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getActiveMissions, completeMission, hasCompletedMission } from '../services/missions.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Claim your daily mission reward');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const dailyMissions = await getActiveMissions('daily');
  if (!dailyMissions.length) {
    await interaction.editReply({ embeds: [errorEmbed('No daily mission available right now.')] });
    return;
  }

  const mission = dailyMissions[0];
  const alreadyCompleted = await hasCompletedMission(interaction.user.id, mission.id);
  if (alreadyCompleted) {
    await interaction.editReply({ embeds: [errorEmbed('You already claimed today\'s daily! Come back tomorrow.')] });
    return;
  }

  const success = await completeMission(interaction.user.id, mission.id, mission.reward_points);
  if (success) {
    await interaction.editReply({
      embeds: [successEmbed(`Daily claimed! **+${mission.reward_points} points** for: ${mission.title}`)]
    });
  } else {
    await interaction.editReply({ embeds: [errorEmbed('Failed to claim daily mission.')] });
  }
}
