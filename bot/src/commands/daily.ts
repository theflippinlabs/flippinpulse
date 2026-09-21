import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { getActiveMissions, completeMission } from '../services/missions.js';
import { applyDailyStreak } from '../services/streak.js';
import { earnPulse } from '../services/games.js';
import { getEconomyConfig } from '../services/settings.js';
import { supabase } from '../supabase.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Claim your daily mission reward');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  const dailyMissions = await getActiveMissions('daily');
  if (!dailyMissions.length) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'No daily mission available right now.' : 'Pas de mission daily disponible pour l\'instant.')] });
    return;
  }

  const mission = dailyMissions[0];
  const { data: userRow } = await supabase
    .from('discord_users')
    .select('last_daily_at')
    .eq('discord_id', interaction.user.id)
    .maybeSingle();
  const lastClaim = userRow?.last_daily_at ? new Date(userRow.last_daily_at).getTime() : 0;
  const hoursSince = lastClaim ? (Date.now() - lastClaim) / 3_600_000 : Infinity;
  if (hoursSince < 24) {
    const remain = Math.ceil(24 - hoursSince);
    await interaction.editReply({ embeds: [errorEmbed(en ? `Already claimed — come back in ${remain}h.` : `Déjà réclamé — reviens dans ${remain}h.`)] });
    return;
  }

  const success = await completeMission(interaction.user.id, mission.id, mission.reward_points, { allowRepeat: true });
  if (!success) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Failed to claim daily mission.' : 'Échec de la réclamation du daily.')] });
    return;
  }

  const economy = getEconomyConfig();
  const basePulse = mission.reward_points * economy.pulse_per_point;
  const streak = await applyDailyStreak(interaction.user.id, basePulse);

  if (streak.bonusPulse > 0) {
    await earnPulse(interaction.user.id, streak.bonusPulse, `Daily streak bonus (${streak.streak}d, +${streak.bonusPercent}%)`, mission.id);
  }

  const lines = en ? [
    `Daily claimed! **+${mission.reward_points} points** for: ${mission.title}`,
    `🔥 Streak: **${streak.streak} day${streak.streak > 1 ? 's' : ''}**`,
  ] : [
    `Daily réclamé ! **+${mission.reward_points} points** pour : ${mission.title}`,
    `🔥 Streak : **${streak.streak} jour${streak.streak > 1 ? 's' : ''}**`,
  ];
  if (streak.bonusPulse > 0) {
    lines.push(en
      ? `💎 Streak bonus: **+${streak.bonusPulse} PULSE** (+${streak.bonusPercent}%)`
      : `💎 Bonus de série : **+${streak.bonusPulse} PULSE** (+${streak.bonusPercent}%)`);
  }

  await interaction.editReply({ embeds: [successEmbed(lines.join('\n'))] });
}
