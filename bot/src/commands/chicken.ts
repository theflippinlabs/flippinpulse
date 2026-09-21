import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { startChickenRace } from '../services/chickenRace.js';
import { isGameEnabled } from '../services/games.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('chicken')
  .setDescription('Start a Chicken Race — live multi-player crash-style game')
  .addIntegerOption(o => o.setName('buyin').setDescription('PULSE to bet (default 50)').setMinValue(1).setRequired(false))
  .addIntegerOption(o => o.setName('players').setDescription('Max players (2-50, default 20)').setMinValue(2).setMaxValue(50).setRequired(false))
  .addIntegerOption(o => o.setName('wait').setDescription('Seconds to wait for joins (5-120, default 25)').setMinValue(5).setMaxValue(120).setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!isGameEnabled('chicken_race')) {
    await interaction.reply({ embeds: [errorEmbed(en
      ? 'Chicken Race is currently disabled. Turn it on in `/panel` → Games.'
      : 'La Chicken Race est désactivée. Active-la dans `/panel` → Jeux.')], flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Use this in a text channel.' : 'Utilise cette commande dans un salon texte.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const buy_in = interaction.options.getInteger('buyin') ?? undefined;
  const max_players = interaction.options.getInteger('players') ?? undefined;
  const wait_seconds = interaction.options.getInteger('wait') ?? undefined;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const res = await startChickenRace(interaction.channel, { buy_in, max_players, wait_seconds });
  if (!res.ok) {
    await interaction.editReply({ embeds: [errorEmbed(res.error ?? (en ? 'Failed to start.' : 'Échec du démarrage.'))] });
    return;
  }
  await interaction.editReply({ embeds: [successEmbed(en
    ? '🐔 The chicken is walking around. Everyone can join now!'
    : '🐔 La poule se promène. Tout le monde peut rejoindre !')] });
}
