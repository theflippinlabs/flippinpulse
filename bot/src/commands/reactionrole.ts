import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { saveReactionRole, deleteReactionRole } from '../services/reactionRoles.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

const EMOJI_REGEX = /^(?:<a?:\w+:(\d+)>|(\p{Extended_Pictographic}|\p{Emoji_Presentation}))$/u;

function parseEmoji(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(EMOJI_REGEX);
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

export const data = new SlashCommandBuilder()
  .setName('reactionrole')
  .setDescription('Manage reaction roles (admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('Bind an emoji on a message to a role')
      .addStringOption(o => o.setName('message_id').setDescription('Target message ID').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji to react with').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role to grant').setRequired(true))
      .addChannelOption(o =>
        o.setName('channel')
          .setDescription('Channel containing the message (defaults to current)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('Unbind an emoji from a message')
      .addStringOption(o => o.setName('message_id').setDescription('Target message ID').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji to unbind').setRequired(true)),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed('This command must be used in a server.')], ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const sub = interaction.options.getSubcommand();
  const messageId = interaction.options.getString('message_id', true);
  const emojiInput = interaction.options.getString('emoji', true);
  const emoji = parseEmoji(emojiInput);

  if (!emoji) {
    await interaction.editReply({ embeds: [errorEmbed('Invalid emoji. Use a unicode emoji or a custom server emoji.')] });
    return;
  }

  if (sub === 'add') {
    const role = interaction.options.getRole('role', true);
    const channelOpt = interaction.options.getChannel('channel');
    const channelId = channelOpt?.id ?? interaction.channelId;
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply({ embeds: [errorEmbed('Target channel must be a text channel.')] });
      return;
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
      await interaction.editReply({ embeds: [errorEmbed('Message not found in that channel.')] });
      return;
    }

    await message.react(emojiInput).catch(() => null);

    const ok = await saveReactionRole({
      guildId: interaction.guild.id,
      channelId,
      messageId,
      emoji,
      roleId: role.id,
      createdBy: interaction.user.id,
    });

    if (!ok) {
      await interaction.editReply({ embeds: [errorEmbed('Failed to save reaction role.')] });
      return;
    }

    await interaction.editReply({
      embeds: [successEmbed(`Reaction role added: ${emojiInput} → <@&${role.id}>`)],
    });
    return;
  }

  if (sub === 'remove') {
    const ok = await deleteReactionRole(messageId, emoji);
    await interaction.editReply({
      embeds: ok
        ? [successEmbed(`Reaction role removed for ${emojiInput} on message ${messageId}.`)]
        : [errorEmbed('Failed to remove reaction role.')],
    });
  }
}
