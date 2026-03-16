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

  const nextRank = getRankForPoints((user.points_total ?? 0) + 1);
  const embed = pulseEmbed(`${targetUser.username}'s Profile`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: 'Rank', value: user.rank_name ?? 'Unranked', inline: true },
      { name: 'Streak', value: `${user.streak ?? 0} days`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Total Points', value: `${user.points_total ?? 0}`, inline: true },
      { name: 'Weekly', value: `${user.points_week ?? 0}`, inline: true },
      { name: 'Monthly', value: `${user.points_month ?? 0}`, inline: true },
      { name: 'PULSE Balance', value: `${user.balance_pulse ?? 0} PULSE`, inline: true },
      { name: 'Lifetime Earned', value: `${user.lifetime_earned_pulse ?? 0}`, inline: true },
      { name: 'Lifetime Spent', value: `${user.lifetime_spent_pulse ?? 0}`, inline: true },
    );

  await interaction.reply({ embeds: [embed] });
}
