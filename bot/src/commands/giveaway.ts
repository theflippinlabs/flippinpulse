import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  buildEnterRow,
  buildGiveawayEmbed,
  countEntries,
  createGiveaway,
  endGiveaway,
  getGiveaway,
  parseDurationMs,
  setGiveawayMessage,
} from '../services/giveaways.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';

const MAX_DURATION_MS = 30 * 24 * 60 * 60_000;

export const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Run a giveaway')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('start')
      .setDescription('Start a giveaway')
      .addStringOption(o => o.setName('prize').setDescription('What is being given away').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 30m, 2h, 1d').setRequired(true))
      .addIntegerOption(o => o.setName('winners').setDescription('How many winners (default 1)').setMinValue(1).setMaxValue(20).setRequired(false)),
  )
  .addSubcommand(sub =>
    sub.setName('end')
      .setDescription('End a giveaway early')
      .addStringOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ embeds: [errorEmbed('This command must be used in a text channel.')], ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'start') {
    await interaction.deferReply({ ephemeral: true });

    const prize = interaction.options.getString('prize', true);
    const durationStr = interaction.options.getString('duration', true);
    const winners = interaction.options.getInteger('winners') ?? 1;

    const durationMs = parseDurationMs(durationStr);
    if (!durationMs || durationMs <= 0) {
      await interaction.editReply({ embeds: [errorEmbed('Invalid duration. Use formats like `30s`, `15m`, `2h`, `1d`.')] });
      return;
    }
    if (durationMs > MAX_DURATION_MS) {
      await interaction.editReply({ embeds: [errorEmbed('Duration cannot exceed 30 days.')] });
      return;
    }

    const giveawayId = await createGiveaway({
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      hostId: interaction.user.id,
      prize,
      winnersCount: winners,
      durationMs,
    });

    if (!giveawayId) {
      await interaction.editReply({ embeds: [errorEmbed('Failed to create giveaway.')] });
      return;
    }

    const g = await getGiveaway(giveawayId);
    if (!g) {
      await interaction.editReply({ embeds: [errorEmbed('Giveaway lookup failed after creation.')] });
      return;
    }

    const embed = buildGiveawayEmbed(g, 0);
    const message = await interaction.channel.send({ embeds: [embed], components: [buildEnterRow()] });
    await setGiveawayMessage(giveawayId, message.id);

    await interaction.editReply({
      embeds: [successEmbed(`Giveaway started! ID: \`${giveawayId}\``)],
    });
    return;
  }

  if (sub === 'end') {
    await interaction.deferReply({ ephemeral: true });

    const id = interaction.options.getString('id', true);
    const g = await getGiveaway(id);
    if (!g) {
      await interaction.editReply({ embeds: [errorEmbed('Giveaway not found.')] });
      return;
    }
    if (g.status !== 'active') {
      await interaction.editReply({ embeds: [errorEmbed('Giveaway is not active.')] });
      return;
    }

    await endGiveaway(interaction.client, id);
    const finalCount = await countEntries(id);
    await interaction.editReply({
      embeds: [successEmbed(`Giveaway \`${id}\` ended with ${finalCount} entries.`)],
    });
  }
}
