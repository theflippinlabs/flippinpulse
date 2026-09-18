import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { supabase } from '../supabase.js';
import { getRankForPoints } from '../services/ranks.js';
import { pulseEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View your profile or another user\'s profile')
  .addUserOption(opt => opt.setName('user').setDescription('User to view').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const { data: user } = await supabase
    .from('discord_users')
    .select('*')
    .eq('discord_id', targetUser.id)
    .single();

  if (!user) {
    await interaction.reply({ embeds: [errorEmbed('User not found. They need to be active first!')], ephemeral: true });
    return;
  }

  const points = user.points_total ?? 0;
  const rankNow = getRankForPoints(points);
  const rankNext = getRankForPoints(points + 1);
  const showBar = rankNext && rankNext.threshold > (rankNow?.threshold ?? 0);
  const barWidth = 12;
  let progressLine = '';
  if (showBar) {
    const pct = Math.max(0, Math.min(1, points / rankNext.threshold));
    const filled = Math.round(pct * barWidth);
    progressLine = `\n\`${'\u2593'.repeat(filled)}${'\u2591'.repeat(barWidth - filled)}\` ${points}/${rankNext.threshold} \u2192 **${rankNext.rank_name}**`;
  }

  const embed = pulseEmbed(`${targetUser.username}'s Profile`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
    .setDescription(`\ud83c\udfc6 **Rank:** ${user.rank_name ?? 'Unranked'}${progressLine}`)
    .addFields(
      { name: '\ud83d\udd25 Streak', value: `${user.streak ?? 0} days`, inline: true },
      { name: 'Weekly', value: `${user.points_week ?? 0}`, inline: true },
      { name: 'Monthly', value: `${user.points_month ?? 0}`, inline: true },
      { name: 'PULSE Balance', value: `${user.balance_pulse ?? 0} PULSE`, inline: true },
      { name: 'Lifetime Earned', value: `${user.lifetime_earned_pulse ?? 0}`, inline: true },
      { name: 'Lifetime Spent', value: `${user.lifetime_spent_pulse ?? 0}`, inline: true },
    );

  await interaction.reply({ embeds: [embed] });
}
