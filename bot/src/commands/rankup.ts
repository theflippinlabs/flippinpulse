import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getRankUpConfig, setSetting, type RankUpConfig } from '../services/settings.js';
import { successEmbed, pulseEmbed } from '../utils/embeds.js';

async function patch(p: Partial<RankUpConfig>): Promise<void> {
  await setSetting('rank_up_config', { ...getRankUpConfig(), ...p });
}

export const data = new SlashCommandBuilder()
  .setName('rankup')
  .setDescription('Admin: configure rank-up announcements')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s =>
    s.setName('channel').setDescription('Set the channel for rank-up announcements')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(s =>
    s.setName('toggle').setDescription('Turn rank-up announcements on or off')
      .addBooleanOption(o => o.setName('enabled').setDescription('On or off').setRequired(true)))
  .addSubcommand(s =>
    s.setName('pinguser').setDescription('Ping the member when they rank up?')
      .addBooleanOption(o => o.setName('enabled').setDescription('Ping?').setRequired(true)))
  .addSubcommand(s => s.setName('status').setDescription('Show rank-up configuration'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();
  const cfg = getRankUpConfig();

  if (sub === 'channel') {
    const channel = interaction.options.getChannel('channel', true);
    await patch({ channel_id: channel.id });
    await interaction.editReply({ embeds: [successEmbed(`Rank-up announcements will be posted in <#${channel.id}>.`)] });
    return;
  }
  if (sub === 'toggle') {
    const enabled = interaction.options.getBoolean('enabled', true);
    await patch({ enabled });
    const warn = enabled && !cfg.channel_id ? '\n⚠️ Set a channel first with `/rankup channel`.' : '';
    await interaction.editReply({ embeds: [successEmbed(`Rank-up announcements are now **${enabled ? 'ON ✅' : 'OFF ⛔'}**.${warn}`)] });
    return;
  }
  if (sub === 'pinguser') {
    const enabled = interaction.options.getBoolean('enabled', true);
    await patch({ ping_user: enabled });
    await interaction.editReply({ embeds: [successEmbed(`Members will ${enabled ? 'now' : 'no longer'} be pinged on rank up.`)] });
    return;
  }
  // status
  await interaction.editReply({
    embeds: [pulseEmbed('🚀 Rank-up configuration').setDescription(
      `**Status:** ${cfg.enabled ? 'ON ✅' : 'OFF ⛔'}\n` +
      `**Channel:** ${cfg.channel_id ? `<#${cfg.channel_id}>` : '*(not set)*'}\n` +
      `**Ping member:** ${cfg.ping_user ? 'yes' : 'no'}`
    )],
  });
}
