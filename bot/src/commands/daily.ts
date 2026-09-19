import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getActiveMissions, completeMission } from '../services/missions.js';
import { applyDailyStreak } from '../services/streak.js';
import { earnPulse } from '../services/games.js';
import { getEconomyConfig } from '../services/settings.js';
import { supabase } from '../supabase.js';
import { currentGuildId } from '../guildContext.js';
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
  const { data: userRow } = await supabase
    .from('discord_users')
    .select('last_daily_at')
    .eq('guild_id', currentGuildId())
    .eq('discord_id', interaction.user.id)
    .maybeSingle();
  const lastClaim = userRow?.last_daily_at ? new Date(userRow.last_daily_at).getTime() : 0;
  const hoursSince = lastClaim ? (Date.now() - lastClaim) / 3_600_000 : Infinity;
  if (hoursSince < 24) {
    const remain = Math.ceil(24 - hoursSince);
    await interaction.editReply({ embeds: [errorEmbed(`Already claimed — come back in ${remain}h.`)] });
    return;
  }

  const success = await completeMission(interaction.user.id, mission.id, mission.reward_points, { allowRepeat: true });
  if (!success) {
    await interaction.editReply({ embeds: [errorEmbed('Failed to claim daily mission.')] });
    return;
  }

  const economy = getEconomyConfig();
  const basePulse = mission.reward_points * economy.pulse_per_point;
  const streak = await applyDailyStreak(interaction.user.id, basePulse);

  if (streak.bonusPulse > 0) {
    await earnPulse(interaction.user.id, streak.bonusPulse, `Daily streak bonus (${streak.streak}d, +${streak.bonusPercent}%)`, mission.id);
  }

  const lines = [
    `Daily claimed! **+${mission.reward_points} points** for: ${mission.title}`,
    `🔥 Streak: **${streak.streak} day${streak.streak > 1 ? 's' : ''}**`,
  ];
  if (streak.bonusPulse > 0) {
    lines.push(`💎 Streak bonus: **+${streak.bonusPulse} PULSE** (+${streak.bonusPercent}%)`);
  }

  await interaction.editReply({ embeds: [successEmbed(lines.join('\n'))] });
}
