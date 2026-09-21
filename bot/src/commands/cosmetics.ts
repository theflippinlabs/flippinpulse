import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageActionRowComponentBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  buyNameColor,
  buyProfileColor,
  buyTitle,
  getCosmetics,
  NAME_COLOR_DAYS,
  PRICES,
} from '../services/cosmetics.js';
import { errorEmbed, successEmbed, pulseEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('cosmetics')
  .setDescription('Personalize your profile — title, colors, custom nameplate');

async function panel(interaction: ChatInputCommandInteraction | ButtonInteraction, editReply = false): Promise<void> {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const c = await getCosmetics(interaction.user.id);
  const nameColorRemaining = c?.name_color_expires_at
    ? Math.max(0, Math.ceil((new Date(c.name_color_expires_at).getTime() - Date.now()) / 86_400_000))
    : 0;

  const noneSetTitle = en ? '*(none — press Set title)*' : '*(aucun — clique Définir le titre)*';
  const defaultLbl = en ? '*(default)*' : '*(défaut)*';
  const daysLbl = en ? (nameColorRemaining === 1 ? 'day' : 'days') : (nameColorRemaining === 1 ? 'jour' : 'jours');
  const leftLbl = en ? 'left' : 'restants';

  const lines = [
    `**${en ? 'Your current cosmetics:' : 'Tes cosmétiques actuels :'}**`,
    `🏷️ **${en ? 'Title' : 'Titre'}:** ${c?.title ? `_${c.title}_` : noneSetTitle}`,
    `🎨 **${en ? 'Profile color' : 'Couleur de profil'}:** ${c?.color_hex ? `\`${c.color_hex}\`` : defaultLbl}`,
    `🌈 **${en ? 'Name color' : 'Couleur de pseudo'}:** ${c?.name_color_hex ? `\`${c.name_color_hex}\` — ${nameColorRemaining} ${daysLbl} ${leftLbl}` : defaultLbl}`,
    '',
    `**${en ? 'Prices:' : 'Prix :'}**`,
    `• 🏷️ ${en ? 'Custom title (permanent)' : 'Titre custom (permanent)'} — **${PRICES.title} PULSE**`,
    `• 🎨 ${en ? 'Profile embed color (permanent)' : 'Couleur d\'embed (permanente)'} — **${PRICES.color} PULSE**`,
    `• 🌈 ${en ? `Discord name color (${NAME_COLOR_DAYS} days)` : `Couleur de pseudo Discord (${NAME_COLOR_DAYS} jours)`} — **${PRICES.nameColor30} PULSE**`,
  ];

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('cos:title').setLabel(en ? 'Set title' : 'Définir titre').setEmoji('🏷️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('cos:color').setLabel(en ? 'Set profile color' : 'Couleur profil').setEmoji('🎨').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('cos:namecolor').setLabel(en ? 'Buy name color' : 'Acheter couleur pseudo').setEmoji('🌈').setStyle(ButtonStyle.Success),
    ),
  ];

  const payload = {
    embeds: [pulseEmbed(en ? '✨ Cosmetics Boutique' : '✨ Boutique cosmétique').setDescription(lines.join('\n'))],
    components: rows,
    flags: MessageFlags.Ephemeral as const,
  };

  if (editReply && interaction.isRepliable()) {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: payload.embeds, components: payload.components });
      return;
    }
  }
  await interaction.reply(payload);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await panel(interaction);
}

function titleModal(): ModalBuilder {
  return new ModalBuilder().setCustomId('cos:modal:title').setTitle('Set your profile title').addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('v').setLabel('Title (1-40 chars)').setStyle(TextInputStyle.Short).setMaxLength(40).setRequired(true),
    ),
  );
}

function colorModal(id: string, title: string): ModalBuilder {
  return new ModalBuilder().setCustomId(id).setTitle(title).addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('v').setLabel('Hex color (e.g. #E11D48)').setStyle(TextInputStyle.Short).setMinLength(4).setMaxLength(7).setRequired(true),
    ),
  );
}

export async function handleCosmeticsInteraction(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const id = interaction.customId;

  if (interaction.isButton()) {
    if (id === 'cos:title') { await interaction.showModal(titleModal()); return; }
    if (id === 'cos:color') { await interaction.showModal(colorModal('cos:modal:color', en ? 'Set your profile embed color' : 'Choisis ta couleur d\'embed')); return; }
    if (id === 'cos:namecolor') { await interaction.showModal(colorModal('cos:modal:namecolor', en ? `Buy Discord name color (${NAME_COLOR_DAYS} days)` : `Acheter couleur pseudo Discord (${NAME_COLOR_DAYS} jours)`)); return; }
    return;
  }

  if (interaction.isModalSubmit()) {
    const value = interaction.fields.getTextInputValue('v');
    if (id === 'cos:modal:title') {
      const res = await buyTitle(interaction.user.id, value);
      if (!res.ok) { await interaction.reply({ embeds: [errorEmbed(res.error ?? (en ? 'Failed.' : 'Échec.'))], flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [successEmbed(en
        ? `Title set to _"${value.trim().slice(0, 40)}"_. Check it on \`/profile\`.`
        : `Titre défini à _"${value.trim().slice(0, 40)}"_. Vérifie avec \`/profile\`.`)], flags: MessageFlags.Ephemeral });
      return;
    }
    if (id === 'cos:modal:color') {
      const res = await buyProfileColor(interaction.user.id, value);
      if (!res.ok) { await interaction.reply({ embeds: [errorEmbed(res.error ?? (en ? 'Failed.' : 'Échec.'))], flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [successEmbed(en
        ? `Profile color set to \`${res.hex}\`. It'll show on \`/profile\`.`
        : `Couleur de profil définie à \`${res.hex}\`. Visible sur \`/profile\`.`)], flags: MessageFlags.Ephemeral });
      return;
    }
    if (id === 'cos:modal:namecolor') {
      if (!interaction.guild) { await interaction.reply({ embeds: [errorEmbed(en ? 'Server only.' : 'Uniquement en serveur.')], flags: MessageFlags.Ephemeral }); return; }
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) { await interaction.reply({ embeds: [errorEmbed(en ? 'Member not found.' : 'Membre introuvable.')], flags: MessageFlags.Ephemeral }); return; }
      const res = await buyNameColor(interaction.guild, member, value);
      if (!res.ok) { await interaction.reply({ embeds: [errorEmbed(res.error ?? (en ? 'Failed.' : 'Échec.'))], flags: MessageFlags.Ephemeral }); return; }
      const expiresTs = Math.floor(new Date(res.expiresAt!).getTime() / 1000);
      await interaction.reply({
        embeds: [successEmbed(en
          ? `Name color set to \`${res.hex}\` — expires <t:${expiresTs}:R>.`
          : `Couleur de pseudo définie à \`${res.hex}\` — expire <t:${expiresTs}:R>.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }
}
