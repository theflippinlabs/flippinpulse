import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  MessageActionRowComponentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { pulseEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('setupaccueil')
  .setDescription('Admin: post a persistent Novarys hub message in a channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(o => o.setName('channel').setDescription('Where to post the hub').setRequired(true).addChannelTypes(ChannelType.GuildText));

export async function execute(interaction: ChatInputCommandInteraction) {
  const channel = interaction.options.getChannel('channel', true);
  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({ embeds: [errorEmbed('Pick a text channel.')], flags: MessageFlags.Ephemeral });
    return;
  }
  const target = await interaction.guild?.channels.fetch(channel.id).catch(() => null);
  if (!target || target.type !== ChannelType.GuildText) {
    await interaction.reply({ embeds: [errorEmbed('Channel not accessible.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = pulseEmbed('🏠 Bienvenue dans Novarys')
    .setDescription(
      'Ton hub d\'accueil — clique un bouton pour naviguer 👇\n\n' +
      '💰 **Profil** — solde, rang, série 🔥\n' +
      '🎮 **Jeux** — toute la salle des jeux\n' +
      '🎯 **Missions** — défis en cours\n' +
      '🎁 **Boutique** — dépense tes PULSE\n' +
      '🎫 **Loterie** — jackpot en direct\n' +
      '🏆 **Classement** — top joueurs\n' +
      '🎁 **Daily** — réclame ta récompense quotidienne\n\n' +
      '_Chaque bouton t\'ouvre une fenêtre privée (visible uniquement par toi)._'
    );

  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('hub:profil').setLabel('Profil').setEmoji('💰').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('hub:jeux').setLabel('Jeux').setEmoji('🎮').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('hub:missions').setLabel('Missions').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hub:shop').setLabel('Boutique').setEmoji('🎁').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('hub:lottery').setLabel('Loterie').setEmoji('🎫').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hub:leaderboard').setLabel('Classement').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hub:daily').setLabel('Daily').setEmoji('🎁').setStyle(ButtonStyle.Success),
  );

  const msg = await target.send({ embeds: [embed], components: [row1, row2] }).catch(() => null);
  if (!msg) {
    await interaction.reply({ embeds: [errorEmbed('Failed to send message — check my permissions.')], flags: MessageFlags.Ephemeral });
    return;
  }
  await msg.pin().catch(() => null);
  await interaction.reply({ embeds: [successEmbed(`✅ Hub d'accueil posté et épinglé dans ${target}.`)], flags: MessageFlags.Ephemeral });
}
