import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getActiveMissions, hasCompletedMission } from '../services/missions.js';
import { pulseEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('missions')
  .setDescription('View active missions');

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const missions = await getActiveMissions();

  if (!missions.length) {
    await interaction.reply({ content: en
      ? 'No active missions right now. Check back later!'
      : 'Pas de mission active pour l\'instant. Reviens plus tard !', ephemeral: true });
    return;
  }

  const lines: string[] = [];
  for (const m of missions) {
    const completed = await hasCompletedMission(interaction.user.id, m.id);
    const status = completed ? '✅' : '⬜';
    const typeTag = m.type.toUpperCase();
    const ptsLbl = en ? 'pts' : 'pts';
    lines.push(`${status} **[${typeTag}]** ${m.title} — ${m.reward_points} ${ptsLbl}\n${m.description}`);
  }

  const embed = pulseEmbed(en ? 'Active Missions' : 'Missions actives')
    .setDescription(lines.join('\n\n'));

  await interaction.reply({ embeds: [embed] });
}
