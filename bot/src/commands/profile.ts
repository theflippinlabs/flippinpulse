import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { supabase } from '../supabase.js';
import { getRankForPoints } from '../services/ranks.js';
import { listAllAchievements, listUnlocked } from '../services/achievements.js';
import { getCosmetics, parseHex } from '../services/cosmetics.js';
import { pulseEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View your profile or another user\'s profile')
  .addUserOption(opt => opt.setName('user').setDescription('User to view').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const { data: user } = await supabase
    .from('discord_users')
    .select('*')
    .eq('discord_id', targetUser.id)
    .single();

  if (!user) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'User not found. They need to be active first!' : 'Utilisateur introuvable. Il doit être actif d\'abord !')], ephemeral: true });
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

  // Latest 6 achievements (badges shelf on the profile).
  const [all, unlockedKeys, cosmetics] = await Promise.all([
    listAllAchievements(),
    listUnlocked(targetUser.id),
    getCosmetics(targetUser.id),
  ]);
  const unlockedSet = new Set(unlockedKeys);
  const badges = all.filter(a => unlockedSet.has(a.achievement_key));
  const badgeLine = badges.length
    ? badges.slice(-8).map(a => `${a.emoji} ${a.name}`).join(' \u00b7 ')
    : (en ? '_None yet \u2014 play games, chat, claim daily\u2026_' : '_Aucun encore \u2014 joue, discute, r\u00e9clame le daily\u2026_');

  const titlePrefix = cosmetics?.title ? `_${cosmetics.title}_\n` : '';
  const rankLabel = en ? 'Rank' : 'Rang';
  const unrankedLabel = en ? 'Unranked' : 'Non class\u00e9';
  const embed = pulseEmbed(en ? `${targetUser.username}'s Profile` : `Profil de ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
    .setDescription(`${titlePrefix}\ud83c\udfc6 **${rankLabel}:** ${user.rank_name ?? unrankedLabel}${progressLine}`)
    .addFields(
      { name: `\ud83d\udd25 ${en ? 'Streak' : 'Streak'}`, value: en ? `${user.streak ?? 0} days` : `${user.streak ?? 0} jours`, inline: true },
      { name: en ? 'Weekly'  : 'Semaine', value: `${user.points_week ?? 0}`, inline: true },
      { name: en ? 'Monthly' : 'Mois',    value: `${user.points_month ?? 0}`, inline: true },
      { name: en ? 'PULSE Balance'   : 'Solde PULSE',       value: `${user.balance_pulse ?? 0} PULSE`, inline: true },
      { name: en ? 'Lifetime Earned' : 'Gagn\u00e9 en tout',     value: `${user.lifetime_earned_pulse ?? 0}`, inline: true },
      { name: en ? 'Lifetime Spent'  : 'D\u00e9pens\u00e9 en tout',   value: `${user.lifetime_spent_pulse ?? 0}`, inline: true },
      { name: `\ud83c\udfc5 ${en ? 'Badges' : 'Badges'} (${badges.length}/${all.length})`, value: badgeLine.slice(0, 1024), inline: false },
    );

  // Custom profile color overrides the brand color.
  if (cosmetics?.color_hex) {
    const n = parseHex(cosmetics.color_hex);
    if (n !== null) embed.setColor(n);
  }

  await interaction.reply({ embeds: [embed] });
}
