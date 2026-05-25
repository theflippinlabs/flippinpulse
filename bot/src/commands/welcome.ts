import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getWelcomeConfig, setSetting, type WelcomeConfig } from '../services/settings.js';
import { buildWelcomePayload } from '../events/guildMemberAdd.js';
import { successEmbed, errorEmbed, pulseEmbed } from '../utils/embeds.js';

async function patchWelcome(patch: Partial<WelcomeConfig>): Promise<void> {
  await setSetting('welcome_config', { ...getWelcomeConfig(), ...patch });
}

export const data = new SlashCommandBuilder()
  .setName('welcome')
  .setDescription('Admin: configure the welcome message')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(s =>
    s.setName('channel').setDescription('Set the channel where welcome messages are posted')
      .addChannelOption(o => o.setName('channel').setDescription('Welcome channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
  .addSubcommand(s =>
    s.setName('title').setDescription('Set the welcome title')
      .addStringOption(o => o.setName('text').setDescription('Title — supports {username} {server} {member_count}').setRequired(true)))
  .addSubcommand(s =>
    s.setName('message').setDescription('Set the welcome description')
      .addStringOption(o => o.setName('text').setDescription('Text — supports {username} {mention} {server} {member_count}').setRequired(true)))
  .addSubcommand(s =>
    s.setName('color').setDescription('Set the embed color')
      .addStringOption(o => o.setName('hex').setDescription('Hex color e.g. #38BDF8').setRequired(true)))
  .addSubcommand(s =>
    s.setName('options').setDescription('Toggle ping and member count')
      .addBooleanOption(o => o.setName('ping_user').setDescription('Ping the new member?').setRequired(false))
      .addBooleanOption(o => o.setName('member_count').setDescription('Show member number in footer?').setRequired(false)))
  .addSubcommand(s =>
    s.setName('toggle').setDescription('Turn welcome messages on or off')
      .addBooleanOption(o => o.setName('enabled').setDescription('On or off').setRequired(true)))
  .addSubcommand(s => s.setName('test').setDescription('Send a test welcome message'))
  .addSubcommand(s => s.setName('status').setDescription('Show the current welcome configuration'));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();
  const cfg = getWelcomeConfig();

  if (sub === 'channel') {
    const channel = interaction.options.getChannel('channel', true);
    await patchWelcome({ channel_id: channel.id });
    await interaction.editReply({ embeds: [successEmbed(`Welcome messages will be posted in <#${channel.id}>.`)] });
    return;
  }

  if (sub === 'title') {
    await patchWelcome({ title: interaction.options.getString('text', true) });
    await interaction.editReply({ embeds: [successEmbed('Welcome title updated.')] });
    return;
  }

  if (sub === 'message') {
    await patchWelcome({ description: interaction.options.getString('text', true) });
    await interaction.editReply({ embeds: [successEmbed('Welcome message updated.')] });
    return;
  }

  if (sub === 'color') {
    const hex = interaction.options.getString('hex', true).trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
      await interaction.editReply({ embeds: [errorEmbed('Invalid color. Use a hex value like `#38BDF8`.')] });
      return;
    }
    await patchWelcome({ embed_color: hex.startsWith('#') ? hex : `#${hex}` });
    await interaction.editReply({ embeds: [successEmbed(`Welcome color set to \`${hex}\`.`)] });
    return;
  }

  if (sub === 'options') {
    const patch: Partial<WelcomeConfig> = {};
    const ping = interaction.options.getBoolean('ping_user');
    const count = interaction.options.getBoolean('member_count');
    if (ping !== null) patch.ping_user = ping;
    if (count !== null) patch.show_member_count = count;
    if (Object.keys(patch).length === 0) {
      await interaction.editReply({ embeds: [errorEmbed('Provide at least one option to change.')] });
      return;
    }
    await patchWelcome(patch);
    await interaction.editReply({ embeds: [successEmbed('Welcome options updated.')] });
    return;
  }

  if (sub === 'toggle') {
    const enabled = interaction.options.getBoolean('enabled', true);
    await patchWelcome({ enabled });
    const warn = enabled && !cfg.channel_id ? '\n⚠️ Set a channel first with `/welcome channel`.' : '';
    await interaction.editReply({ embeds: [successEmbed(`Welcome messages are now **${enabled ? 'ON ✅' : 'OFF ⛔'}**.${warn}`)] });
    return;
  }

  if (sub === 'status') {
    await interaction.editReply({
      embeds: [pulseEmbed('👋 Welcome configuration').setDescription(
        `**Status:** ${cfg.enabled ? 'ON ✅' : 'OFF ⛔'}\n` +
        `**Channel:** ${cfg.channel_id ? `<#${cfg.channel_id}>` : '*(not set)*'}\n` +
        `**Color:** ${cfg.embed_color}\n` +
        `**Ping member:** ${cfg.ping_user ? 'yes' : 'no'}\n` +
        `**Show member count:** ${cfg.show_member_count ? 'yes' : 'no'}\n\n` +
        `**Title:** ${cfg.title}\n**Message:** ${cfg.description}\n\n` +
        `Placeholders: \`{username}\` \`{mention}\` \`{server}\` \`{member_count}\``
      )],
    });
    return;
  }

  // test
  if (!interaction.guild) {
    await interaction.editReply({ embeds: [errorEmbed('Use this in a server.')] });
    return;
  }
  if (!cfg.channel_id) {
    await interaction.editReply({ embeds: [errorEmbed('Set a welcome channel first with `/welcome channel`.')] });
    return;
  }
  const channel = await interaction.guild.channels.fetch(cfg.channel_id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.editReply({ embeds: [errorEmbed('The configured welcome channel is missing or not a text channel.')] });
    return;
  }
  const member = await interaction.guild.members.fetch(interaction.user.id);
  await channel.send(buildWelcomePayload(member, cfg));
  await interaction.editReply({ embeds: [successEmbed(`Sent a test welcome to <#${cfg.channel_id}>.`)] });
}
