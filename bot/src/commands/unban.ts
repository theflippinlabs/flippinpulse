import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { logAndAnnounce } from '../services/moderation.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Unban a user by ID')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o => o.setName('user_id').setDescription('Discord user ID to unban').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Server only.' : 'Uniquement en serveur.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const userId = interaction.options.getString('user_id', true).trim();
  const reason = interaction.options.getString('reason') ?? (en ? 'Manual unban' : 'Déban manuel');

  if (!/^\d{17,20}$/.test(userId)) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Invalid user ID.' : 'ID utilisateur invalide.')] });
    return;
  }

  try {
    await interaction.guild.bans.remove(userId, reason);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await interaction.editReply({ embeds: [errorEmbed(en ? `Failed to unban: ${msg}` : `Échec du déban : ${msg}`)] });
    return;
  }

  await logAndAnnounce(interaction.guild, {
    guildId: interaction.guild.id,
    type: 'unban',
    targetId: userId,
    moderatorId: interaction.user.id,
    reason,
  });

  await interaction.editReply({ embeds: [successEmbed(en ? `Unbanned <@${userId}>.` : `<@${userId}> déban.`)] });
}
