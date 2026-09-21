import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getModConfig, setSetting } from '../services/settings.js';
import { successEmbed, pulseEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

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
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const sub = interaction.options.getSubcommand();
  const cfg = getModConfig();

  if (sub === 'channel') {
    const channel = interaction.options.getChannel('channel', true);
    await setSetting('mod_config', { ...cfg, mod_log_channel_id: channel.id });
    await interaction.editReply({ embeds: [successEmbed(en
      ? `Moderation actions will be logged in <#${channel.id}>.`
      : `Les actions de modération seront journalisées dans <#${channel.id}>.`)] });
    return;
  }
  if (sub === 'clear') {
    await setSetting('mod_config', { ...cfg, mod_log_channel_id: null });
    await interaction.editReply({ embeds: [successEmbed(en
      ? 'Moderation logging disabled (no channel set).'
      : 'Journal de modération désactivé (aucun salon défini).')] });
    return;
  }
  const notSet = en ? '*(not set)*' : '*(non défini)*';
  const on = en ? 'ON ✅' : 'ACTIF ✅';
  const off = en ? 'OFF ⛔' : 'INACTIF ⛔';
  await interaction.editReply({
    embeds: [pulseEmbed(en ? '🛡️ Moderation log configuration' : '🛡️ Configuration du journal de modération').setDescription(
      `**${en ? 'Log channel' : 'Salon de log'}:** ${cfg.mod_log_channel_id ? `<#${cfg.mod_log_channel_id}>` : notSet}\n` +
      `**${en ? 'Auto-moderation' : 'Auto-modération'}:** ${cfg.automod_enabled ? on : off} *(${en ? 'toggle with /module automod' : 'bascule avec /module automod'})*`
    )],
  });
}
