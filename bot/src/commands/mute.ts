import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { logAndAnnounce, parseDurationSeconds } from '../services/moderation.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60_000;

export const data = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Time out a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
  .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 10m, 2h, 1d (max 28d)').setRequired(true))
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
  const durationStr = interaction.options.getString('duration', true);
  const reason = interaction.options.getString('reason') ?? (en ? 'No reason provided' : 'Aucune raison donnée');

  const seconds = parseDurationSeconds(durationStr);
  if (!seconds || seconds <= 0) {
    await interaction.editReply({ embeds: [errorEmbed(en
      ? 'Invalid duration. Use formats like `30s`, `10m`, `2h`, `1d`.'
      : 'Durée invalide. Utilise `30s`, `10m`, `2h`, `1d`.')] });
    return;
  }
  const ms = seconds * 1000;
  if (ms > MAX_TIMEOUT_MS) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Discord caps timeouts at 28 days.' : 'Discord plafonne les mute à 28 jours.')] });
    return;
  }

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Member not found.' : 'Membre introuvable.')] });
    return;
  }
  if (!member.moderatable) {
    await interaction.editReply({ embeds: [errorEmbed(en
      ? 'I cannot moderate this member (missing permission or role hierarchy).'
      : 'Je ne peux pas modérer ce membre (permission ou hiérarchie de rôles).')] });
    return;
  }

  await member.timeout(ms, reason).catch(err => {
    return interaction.editReply({ embeds: [errorEmbed(en ? `Failed to mute: ${err.message}` : `Échec du mute : ${err.message}`)] });
  });

  await logAndAnnounce(interaction.guild, {
    guildId: interaction.guild.id,
    type: 'mute',
    targetId: target.id,
    moderatorId: interaction.user.id,
    reason,
    durationSeconds: seconds,
  });

  await interaction.editReply({
    embeds: [successEmbed(en
      ? `Muted <@${target.id}> for ${durationStr}. Reason: ${reason}`
      : `<@${target.id}> mute pendant ${durationStr}. Raison : ${reason}`)],
  });
}
