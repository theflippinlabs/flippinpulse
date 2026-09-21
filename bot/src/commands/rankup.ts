import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getRankUpConfig, setSetting, type RankUpConfig } from '../services/settings.js';
import { successEmbed, pulseEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

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
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const sub = interaction.options.getSubcommand();
  const cfg = getRankUpConfig();

  if (sub === 'channel') {
    const channel = interaction.options.getChannel('channel', true);
    await patch({ channel_id: channel.id });
    await interaction.editReply({ embeds: [successEmbed(en
      ? `Rank-up announcements will be posted in <#${channel.id}>.`
      : `Les annonces de niveau seront postées dans <#${channel.id}>.`)] });
    return;
  }
  if (sub === 'toggle') {
    const enabled = interaction.options.getBoolean('enabled', true);
    await patch({ enabled });
    const warn = enabled && !cfg.channel_id
      ? (en ? '\n⚠️ Set a channel first with `/rankup channel`.' : '\n⚠️ Définis un salon d\'abord avec `/rankup channel`.')
      : '';
    const stateOn = en ? 'ON ✅' : 'ACTIF ✅';
    const stateOff = en ? 'OFF ⛔' : 'INACTIF ⛔';
    await interaction.editReply({ embeds: [successEmbed(en
      ? `Rank-up announcements are now **${enabled ? stateOn : stateOff}**.${warn}`
      : `Les annonces de niveau sont maintenant **${enabled ? stateOn : stateOff}**.${warn}`)] });
    return;
  }
  if (sub === 'pinguser') {
    const enabled = interaction.options.getBoolean('enabled', true);
    await patch({ ping_user: enabled });
    await interaction.editReply({ embeds: [successEmbed(en
      ? `Members will ${enabled ? 'now' : 'no longer'} be pinged on rank up.`
      : `Les membres ${enabled ? 'seront désormais' : 'ne seront plus'} pingués lors d'un passage de rang.`)] });
    return;
  }
  const notSet = en ? '*(not set)*' : '*(non défini)*';
  const stateOn = en ? 'ON ✅' : 'ACTIF ✅';
  const stateOff = en ? 'OFF ⛔' : 'INACTIF ⛔';
  await interaction.editReply({
    embeds: [pulseEmbed(en ? '🚀 Rank-up configuration' : '🚀 Configuration passage de rang').setDescription(
      `**${en ? 'Status' : 'État'}:** ${cfg.enabled ? stateOn : stateOff}\n` +
      `**${en ? 'Channel' : 'Salon'}:** ${cfg.channel_id ? `<#${cfg.channel_id}>` : notSet}\n` +
      `**${en ? 'Ping member' : 'Ping du membre'}:** ${cfg.ping_user ? (en ? 'yes' : 'oui') : (en ? 'no' : 'non')}`
    )],
  });
}
