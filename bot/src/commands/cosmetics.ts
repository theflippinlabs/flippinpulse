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

export const data = new SlashCommandBuilder()
  .setName('cosmetics')
  .setDescription('Personalize your profile — title, colors, custom nameplate');

async function panel(interaction: ChatInputCommandInteraction | ButtonInteraction, editReply = false): Promise<void> {
  const c = await getCosmetics(interaction.user.id);
  const nameColorRemaining = c?.name_color_expires_at
    ? Math.max(0, Math.ceil((new Date(c.name_color_expires_at).getTime() - Date.now()) / 86_400_000))
    : 0;

  const lines = [
    `**Your current cosmetics:**`,
    `🏷️ **Title:** ${c?.title ? `_${c.title}_` : '*(none — press Set title)*'}`,
    `🎨 **Profile color:** ${c?.color_hex ? `\`${c.color_hex}\`` : '*(default)*'}`,
    `🌈 **Name color:** ${c?.name_color_hex ? `\`${c.name_color_hex}\` — ${nameColorRemaining} day${nameColorRemaining === 1 ? '' : 's'} left` : '*(default)*'}`,
    '',
    `**Prices:**`,
    `• 🏷️ Custom title (permanent) — **${PRICES.title} PULSE**`,
    `• 🎨 Profile embed color (permanent) — **${PRICES.color} PULSE**`,
    `• 🌈 Discord name color (${NAME_COLOR_DAYS} days) — **${PRICES.nameColor30} PULSE**`,
  ];

  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId('cos:title').setLabel('Set title').setEmoji('🏷️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('cos:color').setLabel('Set profile color').setEmoji('🎨').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('cos:namecolor').setLabel('Buy name color').setEmoji('🌈').setStyle(ButtonStyle.Success),
    ),
  ];

  const payload = {
    embeds: [pulseEmbed('✨ Cosmetics Boutique').setDescription(lines.join('\n'))],
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
  const id = interaction.customId;

  if (interaction.isButton()) {
    if (id === 'cos:title') { await interaction.showModal(titleModal()); return; }
    if (id === 'cos:color') { await interaction.showModal(colorModal('cos:modal:color', 'Set your profile embed color')); return; }
    if (id === 'cos:namecolor') { await interaction.showModal(colorModal('cos:modal:namecolor', `Buy Discord name color (${NAME_COLOR_DAYS} days)`)); return; }
    return;
  }

  if (interaction.isModalSubmit()) {
    const value = interaction.fields.getTextInputValue('v');
    if (id === 'cos:modal:title') {
      const res = await buyTitle(interaction.user.id, value);
      if (!res.ok) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Failed.')], flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [successEmbed(`Title set to _"${value.trim().slice(0, 40)}"_. Check it on \`/profile\`.`)], flags: MessageFlags.Ephemeral });
      return;
    }
    if (id === 'cos:modal:color') {
      const res = await buyProfileColor(interaction.user.id, value);
      if (!res.ok) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Failed.')], flags: MessageFlags.Ephemeral }); return; }
      await interaction.reply({ embeds: [successEmbed(`Profile color set to \`${res.hex}\`. It'll show on \`/profile\`.`)], flags: MessageFlags.Ephemeral });
      return;
    }
    if (id === 'cos:modal:namecolor') {
      if (!interaction.guild) { await interaction.reply({ embeds: [errorEmbed('Server only.')], flags: MessageFlags.Ephemeral }); return; }
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) { await interaction.reply({ embeds: [errorEmbed('Member not found.')], flags: MessageFlags.Ephemeral }); return; }
      const res = await buyNameColor(interaction.guild, member, value);
      if (!res.ok) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'Failed.')], flags: MessageFlags.Ephemeral }); return; }
      const expiresTs = Math.floor(new Date(res.expiresAt!).getTime() / 1000);
      await interaction.reply({
        embeds: [successEmbed(`Name color set to \`${res.hex}\` — expires <t:${expiresTs}:R>.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }
}
