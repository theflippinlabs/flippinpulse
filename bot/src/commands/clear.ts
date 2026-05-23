import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { logAndAnnounce } from '../services/moderation.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Bulk delete recent messages in this channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption(o => o.setName('count').setDescription('How many messages (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
  .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ embeds: [errorEmbed('This command must be used in a text channel.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const count = interaction.options.getInteger('count', true);
  const filterUser = interaction.options.getUser('user');

  const fetched = await interaction.channel.messages.fetch({ limit: 100 });
  const candidates = filterUser
    ? fetched.filter(m => m.author.id === filterUser.id)
    : fetched;
  const toDelete = candidates.first(count);

  if (!toDelete.length) {
    await interaction.editReply({ embeds: [errorEmbed('No matching messages found.')] });
    return;
  }

  try {
    const deleted = await interaction.channel.bulkDelete(toDelete, true);
    await logAndAnnounce(interaction.guild, {
      guildId: interaction.guild.id,
      type: 'clear',
      moderatorId: interaction.user.id,
      reason: filterUser ? `Cleared ${deleted.size} message(s) from <@${filterUser.id}>` : `Cleared ${deleted.size} message(s)`,
      metadata: { channel_id: interaction.channel.id, count: deleted.size, filter_user: filterUser?.id ?? null },
    });
    await interaction.editReply({ embeds: [successEmbed(`Deleted **${deleted.size}** message(s).`)] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await interaction.editReply({ embeds: [errorEmbed(`Failed to bulk delete: ${msg}. (Messages older than 14 days cannot be bulk-deleted.)`)] });
  }
}
