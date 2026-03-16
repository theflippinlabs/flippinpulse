import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getActiveMissions, hasCompletedMission } from '../services/missions.js';
import { pulseEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('missions')
  .setDescription('View active missions');

export async function execute(interaction: ChatInputCommandInteraction) {
  const missions = await getActiveMissions();

  if (!missions.length) {
    await interaction.reply({ content: 'No active missions right now. Check back later!', ephemeral: true });
    return;
  }

  const lines: string[] = [];
  for (const m of missions) {
    const completed = await hasCompletedMission(interaction.user.id, m.id);
    const status = completed ? '✅' : '⬜';
    const typeTag = m.type.toUpperCase();
    lines.push(`${status} **[${typeTag}]** ${m.title} — ${m.reward_points} pts\n${m.description}`);
  }

  const embed = pulseEmbed('Active Missions')
    .setDescription(lines.join('\n\n'));

  await interaction.reply({ embeds: [embed] });
}
