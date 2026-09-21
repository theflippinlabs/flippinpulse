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
  .setName('ban')
  .setDescription('Ban a member from the server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
  .addIntegerOption(o => o.setName('delete_days').setDescription('Delete message history (0-7 days)').setMinValue(0).setMaxValue(7).setRequired(false));

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
  const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member) {
    if (!member.bannable) {
      await interaction.editReply({ embeds: [errorEmbed(en
        ? 'I cannot ban this member (missing permission or role hierarchy).'
        : 'Je ne peux pas ban ce membre (permission ou hiérarchie de rôles).')] });
      return;
    }
    // DM in the target's locale.
    const targetLocale = await getUserLocale(target.id);
    const ten = targetLocale === 'en';
    await member.send({
      embeds: [errorEmbed(ten
        ? `You were banned from **${interaction.guild.name}**.\nReason: ${reason}`
        : `Tu as été ban de **${interaction.guild.name}**.\nRaison : ${reason}`)],
    }).catch(() => null);
  }

  try {
    await interaction.guild.bans.create(target.id, { reason, deleteMessageSeconds: deleteDays * 86400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await interaction.editReply({ embeds: [errorEmbed(en ? `Failed to ban: ${msg}` : `Échec du ban : ${msg}`)] });
    return;
  }

  await logAndAnnounce(interaction.guild, {
    guildId: interaction.guild.id,
    type: 'ban',
    targetId: target.id,
    moderatorId: interaction.user.id,
    reason,
    metadata: deleteDays ? { delete_days: deleteDays } : undefined,
  });

  await interaction.editReply({ embeds: [successEmbed(en
    ? `Banned <@${target.id}>. Reason: ${reason}`
    : `<@${target.id}> ban. Raison : ${reason}`)] });
}
