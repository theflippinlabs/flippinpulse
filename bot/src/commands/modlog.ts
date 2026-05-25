import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getModConfig, setSetting } from '../services/settings.js';
import { successEmbed, pulseEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('modlog')
  .setDescription('Admin: configure the moderation log channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s =>
    s.setName('channel').setDescription('Set the channel where moderation actions are logged')
      .addChannelOption(o => o.setName('channel').setDescription('Mod-log channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(s => s.setName('clear').setDescription('Stop logging moderation actions'))
  .addSubcommand(s => s.setName('status').setDescription('Show the moderation log configuration'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();
  const cfg = getModConfig();

  if (sub === 'channel') {
    const channel = interaction.options.getChannel('channel', true);
    await setSetting('mod_config', { ...cfg, mod_log_channel_id: channel.id });
    await interaction.editReply({ embeds: [successEmbed(`Moderation actions will be logged in <#${channel.id}>.`)] });
    return;
  }
  if (sub === 'clear') {
    await setSetting('mod_config', { ...cfg, mod_log_channel_id: null });
    await interaction.editReply({ embeds: [successEmbed('Moderation logging disabled (no channel set).')] });
    return;
  }
  // status
  await interaction.editReply({
    embeds: [pulseEmbed('🛡️ Moderation log configuration').setDescription(
      `**Log channel:** ${cfg.mod_log_channel_id ? `<#${cfg.mod_log_channel_id}>` : '*(not set)*'}\n` +
      `**Auto-moderation:** ${cfg.automod_enabled ? 'ON ✅' : 'OFF ⛔'} *(toggle with /module automod)*`
    )],
  });
}
