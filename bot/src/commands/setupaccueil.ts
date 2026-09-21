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
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('setupaccueil')
  .setDescription('Admin: post a persistent Novarys hub message in a channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(o => o.setName('channel').setDescription('Where to post the hub').setRequired(true).addChannelTypes(ChannelType.GuildText));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const channel = interaction.options.getChannel('channel', true);
  if (channel.type !== ChannelType.GuildText) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Pick a text channel.' : 'Choisis un salon texte.')], flags: MessageFlags.Ephemeral });
    return;
  }
  const target = await interaction.guild?.channels.fetch(channel.id).catch(() => null);
  if (!target || target.type !== ChannelType.GuildText) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Channel not accessible.' : 'Salon non accessible.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const embed = pulseEmbed(en ? '🏠 Welcome' : '🏠 Bienvenue')
    .setDescription(en
      ? 'Your home hub — tap a button to navigate 👇\n\n💰 **Profile** — balance, rank, streak 🔥\n🎮 **Games** — the whole games room\n🎯 **Missions** — active challenges\n🎁 **Shop** — spend your PULSE\n🎫 **Lottery** — live jackpot\n🏆 **Leaderboard** — top players\n🎁 **Daily** — claim your daily reward\n\n_Each button opens a private view (only you can see it)._'
      : 'Ton hub d\'accueil — clique un bouton pour naviguer 👇\n\n💰 **Profil** — solde, rang, série 🔥\n🎮 **Jeux** — toute la salle des jeux\n🎯 **Missions** — défis en cours\n🎁 **Boutique** — dépense tes PULSE\n🎫 **Loterie** — jackpot en direct\n🏆 **Classement** — top joueurs\n🎁 **Daily** — réclame ta récompense quotidienne\n\n_Chaque bouton t\'ouvre une fenêtre privée (visible uniquement par toi)._'
    );

  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('hub:profil').setLabel(en ? 'Profile' : 'Profil').setEmoji('💰').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('hub:jeux').setLabel(en ? 'Games' : 'Jeux').setEmoji('🎮').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('hub:missions').setLabel('Missions').setEmoji('🎯').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hub:shop').setLabel(en ? 'Shop' : 'Boutique').setEmoji('🎁').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('hub:lottery').setLabel(en ? 'Lottery' : 'Loterie').setEmoji('🎫').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hub:leaderboard').setLabel(en ? 'Leaderboard' : 'Classement').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hub:daily').setLabel('Daily').setEmoji('🎁').setStyle(ButtonStyle.Success),
  );

  const msg = await target.send({ embeds: [embed], components: [row1, row2] }).catch(() => null);
  if (!msg) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Failed to send message — check my permissions.' : 'Impossible d\'envoyer le message — vérifie mes permissions.')], flags: MessageFlags.Ephemeral });
    return;
  }
  await msg.pin().catch(() => null);
  await interaction.reply({ embeds: [successEmbed(en
    ? `✅ Home hub posted and pinned in ${target}.`
    : `✅ Hub d'accueil posté et épinglé dans ${target}.`)], flags: MessageFlags.Ephemeral });
}
