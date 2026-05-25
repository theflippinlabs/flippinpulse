import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { logAndAnnounce, parseDurationSeconds } from '../services/moderation.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60_000;

export const data = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Time out a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
  .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 10m, 2h, 1d (max 28d)').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('Server only.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const durationStr = interaction.options.getString('duration', true);
  const reason = interaction.options.getString('reason') ?? 'No reason provided';

  const seconds = parseDurationSeconds(durationStr);
  if (!seconds || seconds <= 0) {
    await interaction.editReply({ embeds: [errorEmbed('Invalid duration. Use formats like `30s`, `10m`, `2h`, `1d`.')] });
    return;
  }
  const ms = seconds * 1000;
  if (ms > MAX_TIMEOUT_MS) {
    await interaction.editReply({ embeds: [errorEmbed('Discord caps timeouts at 28 days.')] });
    return;
  }

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) {
    await interaction.editReply({ embeds: [errorEmbed('Member not found.')] });
    return;
  }
  if (!member.moderatable) {
    await interaction.editReply({ embeds: [errorEmbed('I cannot moderate this member (missing permission or role hierarchy).')] });
    return;
  }

  await member.timeout(ms, reason).catch(err => {
    return interaction.editReply({ embeds: [errorEmbed(`Failed to mute: ${err.message}`)] });
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
    embeds: [successEmbed(`Muted <@${target.id}> for ${durationStr}. Reason: ${reason}`)],
  });
}
