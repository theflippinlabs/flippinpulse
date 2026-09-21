import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { supabase } from '../supabase.js';
import { pulseEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

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
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const period = interaction.options.getString('period') ?? 'total';
  const column = period === 'week' ? 'points_week' : period === 'month' ? 'points_month' : 'points_total';
  const periodLabel = period === 'week'  ? (en ? 'Weekly'   : 'Semaine')
                   : period === 'month'  ? (en ? 'Monthly'  : 'Mois')
                   :                       (en ? 'All Time' : 'Total');

  const { data: users } = await supabase
    .from('discord_users')
    .select('discord_id, username, rank_name, points_total, points_week, points_month')
    .order(column, { ascending: false })
    .limit(10);

  if (!users?.length) {
    await interaction.reply({ content: en ? 'No users found yet!' : 'Aucun membre pour l\'instant !', ephemeral: true });
    return;
  }

  const lines = users.map((u: Record<string, unknown>, i: number) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const pts = (u[column] as number) ?? 0;
    const username = (u.username as string) ?? (u.discord_id as string);
    const rankName = u.rank_name as string | null;
    return `${medal} **${username}** — ${pts} pts ${rankName ? `(${rankName})` : ''}`;
  });

  const embed = pulseEmbed(`${en ? 'Leaderboard' : 'Classement'} — ${periodLabel}`)
    .setDescription(lines.join('\n'));

  await interaction.reply({ embeds: [embed] });
}
