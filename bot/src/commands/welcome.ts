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
import { getUserLocale } from '../i18n.js';

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
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const sub = interaction.options.getSubcommand();
  const cfg = getWelcomeConfig();

  if (sub === 'channel') {
    const channel = interaction.options.getChannel('channel', true);
    await patchWelcome({ channel_id: channel.id });
    await interaction.editReply({ embeds: [successEmbed(en
      ? `Welcome messages will be posted in <#${channel.id}>.`
      : `Les messages de bienvenue seront postés dans <#${channel.id}>.`)] });
    return;
  }

  if (sub === 'title') {
    await patchWelcome({ title: interaction.options.getString('text', true) });
    await interaction.editReply({ embeds: [successEmbed(en ? 'Welcome title updated.' : 'Titre de bienvenue mis à jour.')] });
    return;
  }

  if (sub === 'message') {
    await patchWelcome({ description: interaction.options.getString('text', true) });
    await interaction.editReply({ embeds: [successEmbed(en ? 'Welcome message updated.' : 'Message de bienvenue mis à jour.')] });
    return;
  }

  if (sub === 'color') {
    const hex = interaction.options.getString('hex', true).trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
      await interaction.editReply({ embeds: [errorEmbed(en ? 'Invalid color. Use a hex value like `#38BDF8`.' : 'Couleur invalide. Utilise une valeur hex comme `#38BDF8`.')] });
      return;
    }
    await patchWelcome({ embed_color: hex.startsWith('#') ? hex : `#${hex}` });
    await interaction.editReply({ embeds: [successEmbed(en ? `Welcome color set to \`${hex}\`.` : `Couleur de bienvenue définie à \`${hex}\`.`)] });
    return;
  }

  if (sub === 'options') {
    const patch: Partial<WelcomeConfig> = {};
    const ping = interaction.options.getBoolean('ping_user');
    const count = interaction.options.getBoolean('member_count');
    if (ping !== null) patch.ping_user = ping;
    if (count !== null) patch.show_member_count = count;
    if (Object.keys(patch).length === 0) {
      await interaction.editReply({ embeds: [errorEmbed(en ? 'Provide at least one option to change.' : 'Fournis au moins une option à modifier.')] });
      return;
    }
    await patchWelcome(patch);
    await interaction.editReply({ embeds: [successEmbed(en ? 'Welcome options updated.' : 'Options de bienvenue mises à jour.')] });
    return;
  }

  if (sub === 'toggle') {
    const enabled = interaction.options.getBoolean('enabled', true);
    await patchWelcome({ enabled });
    const warn = enabled && !cfg.channel_id
      ? (en ? '\n⚠️ Set a channel first with `/welcome channel`.' : '\n⚠️ Définis un salon d\'abord avec `/welcome channel`.')
      : '';
    const stateOn = en ? 'ON ✅' : 'ACTIF ✅';
    const stateOff = en ? 'OFF ⛔' : 'INACTIF ⛔';
    await interaction.editReply({ embeds: [successEmbed(en
      ? `Welcome messages are now **${enabled ? stateOn : stateOff}**.${warn}`
      : `Les messages de bienvenue sont maintenant **${enabled ? stateOn : stateOff}**.${warn}`)] });
    return;
  }

  if (sub === 'status') {
    const stateOn = en ? 'ON ✅' : 'ACTIF ✅';
    const stateOff = en ? 'OFF ⛔' : 'INACTIF ⛔';
    const notSet = en ? '*(not set)*' : '*(non défini)*';
    const yes = en ? 'yes' : 'oui';
    const no = en ? 'no' : 'non';
    await interaction.editReply({
      embeds: [pulseEmbed(en ? '👋 Welcome configuration' : '👋 Configuration bienvenue').setDescription(
        `**${en ? 'Status' : 'État'}:** ${cfg.enabled ? stateOn : stateOff}\n` +
        `**${en ? 'Channel' : 'Salon'}:** ${cfg.channel_id ? `<#${cfg.channel_id}>` : notSet}\n` +
        `**${en ? 'Color' : 'Couleur'}:** ${cfg.embed_color}\n` +
        `**${en ? 'Ping member' : 'Ping du membre'}:** ${cfg.ping_user ? yes : no}\n` +
        `**${en ? 'Show member count' : 'Afficher le compteur'}:** ${cfg.show_member_count ? yes : no}\n\n` +
        `**${en ? 'Title' : 'Titre'}:** ${cfg.title}\n**Message:** ${cfg.description}\n\n` +
        `${en ? 'Placeholders' : 'Variables'}: \`{username}\` \`{mention}\` \`{server}\` \`{member_count}\``
      )],
    });
    return;
  }

  if (!interaction.guild) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Use this in a server.' : 'Utilise cette commande en serveur.')] });
    return;
  }
  if (!cfg.channel_id) {
    await interaction.editReply({ embeds: [errorEmbed(en
      ? 'Set a welcome channel first with `/welcome channel`.'
      : 'Définis un salon de bienvenue d\'abord avec `/welcome channel`.')] });
    return;
  }
  const channel = await interaction.guild.channels.fetch(cfg.channel_id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.editReply({ embeds: [errorEmbed(en
      ? 'The configured welcome channel is missing or not a text channel.'
      : 'Le salon de bienvenue configuré est introuvable ou n\'est pas un salon texte.')] });
    return;
  }
  const member = await interaction.guild.members.fetch(interaction.user.id);
  await channel.send(buildWelcomePayload(member, cfg));
  await interaction.editReply({ embeds: [successEmbed(en
    ? `Sent a test welcome to <#${cfg.channel_id}>.`
    : `Message de test envoyé dans <#${cfg.channel_id}>.`)] });
}
