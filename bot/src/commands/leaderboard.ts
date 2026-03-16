import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { supabase } from '../supabase.js';
import { pulseEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('View the top players')
  .addStringOption(opt =>
    opt.setName('period')
      .setDescription('Time period')
      .setRequired(false)
      .addChoices(
        { name: 'All Time', value: 'total' },
        { name: 'Weekly', value: 'week' },
        { name: 'Monthly', value: 'month' },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const period = interaction.options.getString('period') ?? 'total';
  const column = period === 'week' ? 'points_week' : period === 'month' ? 'points_month' : 'points_total';
  const periodLabel = period === 'week' ? 'Weekly' : period === 'month' ? 'Monthly' : 'All Time';

  const { data: users } = await supabase
    .from('discord_users')
    .select('discord_id, username, rank_name, points_total, points_week, points_month')
    .order(column, { ascending: false })
    .limit(10);

  if (!users?.length) {
    await interaction.reply({ content: 'No users found yet!', ephemeral: true });
    return;
  }

  const lines = users.map((u, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const pts = (u as Record<string, unknown>)[column] ?? 0;
    return `${medal} **${u.username ?? u.discord_id}** — ${pts} pts ${u.rank_name ? `(${u.rank_name})` : ''}`;
  });

  const embed = pulseEmbed(`Leaderboard — ${periodLabel}`)
    .setDescription(lines.join('\n'));

  await interaction.reply({ embeds: [embed] });
}
