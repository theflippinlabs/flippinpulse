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
  .setName('unmute')
  .setDescription('Remove a member\'s timeout')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Server only.' : 'Uniquement en serveur.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason') ?? (en ? 'Manual unmute' : 'Démute manuel');

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Member not found.' : 'Membre introuvable.')] });
    return;
  }
  if (!member.isCommunicationDisabled()) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Member is not currently muted.' : 'Ce membre n\'est pas mute.')] });
    return;
  }

  await member.timeout(null, reason).catch(err => {
    return interaction.editReply({ embeds: [errorEmbed(en ? `Failed to unmute: ${err.message}` : `Échec du démute : ${err.message}`)] });
  });

  await logAndAnnounce(interaction.guild, {
    guildId: interaction.guild.id,
    type: 'unmute',
    targetId: target.id,
    moderatorId: interaction.user.id,
    reason,
  });

  await interaction.editReply({ embeds: [successEmbed(en ? `Unmuted <@${target.id}>.` : `<@${target.id}> démute.`)] });
}
