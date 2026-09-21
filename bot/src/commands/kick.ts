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
  .setName('kick')
  .setDescription('Kick a member from the server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
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
  const reason = interaction.options.getString('reason') ?? (en ? 'No reason provided' : 'Aucune raison donnée');

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Member not found.' : 'Membre introuvable.')] });
    return;
  }
  if (!member.kickable) {
    await interaction.editReply({ embeds: [errorEmbed(en
      ? 'I cannot kick this member (missing permission or role hierarchy).'
      : 'Je ne peux pas kick ce membre (permission ou hiérarchie de rôles).')] });
    return;
  }

  // DM the kicked user in THEIR locale.
  const targetLocale = await getUserLocale(target.id);
  const ten = targetLocale === 'en';
  await member.send({
    embeds: [errorEmbed(ten
      ? `You were kicked from **${interaction.guild.name}**.\nReason: ${reason}`
      : `Tu as été kick de **${interaction.guild.name}**.\nRaison : ${reason}`)],
  }).catch(() => null);

  try {
    await member.kick(reason);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await interaction.editReply({ embeds: [errorEmbed(en ? `Failed to kick: ${msg}` : `Échec du kick : ${msg}`)] });
    return;
  }

  await logAndAnnounce(interaction.guild, {
    guildId: interaction.guild.id,
    type: 'kick',
    targetId: target.id,
    moderatorId: interaction.user.id,
    reason,
  });

  await interaction.editReply({ embeds: [successEmbed(en
    ? `Kicked <@${target.id}>. Reason: ${reason}`
    : `<@${target.id}> kick. Raison : ${reason}`)] });
}
