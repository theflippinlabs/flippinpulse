import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { listAllAchievements, listUnlocked } from '../services/achievements.js';
import { pulseEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

const CATEGORY_LABEL_FR: Record<string, string> = {
  economy: '💰 Économie',
  games: '🎲 Jeux',
  streak: '🔥 Séries',
  social: '💬 Social',
  quiz: '🧠 Quiz',
  missions: '🎯 Missions',
  lottery: '🎫 Loterie',
  rank: '🌟 Rang',
  special: '⚜️ Spécial',
};

export const data = new SlashCommandBuilder()
  .setName('achievements')
  .setDescription('Show your unlocked achievements and the ones left to earn')
  .addUserOption(o => o.setName('user').setDescription('Whose achievements to show (default: you)').setRequired(false));

const CATEGORY_LABEL: Record<string, string> = {
  economy: '💰 Economy',
  games: '🎲 Games',
  streak: '🔥 Streaks',
  social: '💬 Social',
  quiz: '🧠 Quiz',
  missions: '🎯 Missions',
  lottery: '🎫 Lottery',
  rank: '🌟 Rank',
  special: '⚜️ Special',
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const target = interaction.options.getUser('user') ?? interaction.user;

  const [all, unlockedKeys] = await Promise.all([
    listAllAchievements(),
    listUnlocked(target.id),
  ]);
  const unlockedSet = new Set(unlockedKeys);
  const total = all.filter(a => !a.is_hidden || unlockedSet.has(a.achievement_key));
  const done = total.filter(a => unlockedSet.has(a.achievement_key)).length;

  const grouped = new Map<string, typeof all>();
  for (const a of total) {
    if (!grouped.has(a.category)) grouped.set(a.category, []);
    grouped.get(a.category)!.push(a);
  }

  const catLabels = en ? CATEGORY_LABEL : CATEGORY_LABEL_FR;
  const lines: string[] = [];
  for (const [cat, items] of grouped) {
    lines.push(`\n**${catLabels[cat] ?? cat}**`);
    for (const a of items) {
      const got = unlockedSet.has(a.achievement_key);
      const mark = got ? '✅' : '🔒';
      const reward = a.reward_pulse > 0 ? ` · +${a.reward_pulse} PULSE` : '';
      const name = got ? `**${a.name}**` : a.name;
      lines.push(`${mark} ${a.emoji} ${name} — _${a.description}_${reward}`);
    }
  }

  const unlockedLbl = en ? 'unlocked' : 'débloqués';
  const header = target.id === interaction.user.id
    ? `**${done} / ${total.length}** ${unlockedLbl}.`
    : `<@${target.id}> — **${done} / ${total.length}** ${unlockedLbl}.`;

  const body = (header + '\n' + lines.join('\n')).slice(0, 4090);
  await interaction.editReply({
    embeds: [pulseEmbed(en ? '🏆 Achievements' : '🏆 Succès').setDescription(body)],
  });
}
