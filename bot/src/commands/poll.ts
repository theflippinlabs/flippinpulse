import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { errorEmbed } from '../utils/embeds.js';

const MAX_OPTIONS = 5;
const DEFAULT_DURATION_MS = 5 * 60_000;
const MAX_DURATION_MS = 24 * 60 * 60_000;
const BAR_WIDTH = 12;

const OPTION_EMOJIS = ['🇦', '🇧', '🇨', '🇩', '🇪'];

function parseDurationMs(input: string): number | null {
  const match = input.trim().match(/^(\d+)\s*(s|m|h)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000;
  return value * mult;
}

function renderBar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
}

export const data = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Start a quick poll')
  .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
  .addStringOption(o => o.setName('options').setDescription('Comma-separated options (2-5)').setRequired(true))
  .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 5m, 1h (default 5m, max 24h)').setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  const question = interaction.options.getString('question', true);
  const optionsRaw = interaction.options.getString('options', true);
  const durationStr = interaction.options.getString('duration');

  const options = optionsRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (options.length < 2 || options.length > MAX_OPTIONS) {
    await interaction.reply({ embeds: [errorEmbed(`Provide between 2 and ${MAX_OPTIONS} options.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  let durationMs = DEFAULT_DURATION_MS;
  if (durationStr) {
    const parsed = parseDurationMs(durationStr);
    if (!parsed) {
      await interaction.reply({ embeds: [errorEmbed('Invalid duration. Use formats like `30s`, `5m`, `1h`.')], flags: MessageFlags.Ephemeral });
      return;
    }
    durationMs = Math.min(parsed, MAX_DURATION_MS);
  }

  await interaction.deferReply();

  const votes = new Map<string, number>();
  const endsAt = Date.now() + durationMs;
  const endsAtUnix = Math.floor(endsAt / 1000);

  function renderEmbed(closed = false): EmbedBuilder {
    const total = votes.size;
    const counts = options.map((_, i) => 0);
    for (const choice of votes.values()) counts[choice]++;

    const lines = options.map((label, i) => {
      const pct = total === 0 ? 0 : Math.round((counts[i] / total) * 100);
      return `${OPTION_EMOJIS[i]} **${label}** — ${counts[i]} vote${counts[i] !== 1 ? 's' : ''} (${pct}%)\n\`${renderBar(pct)}\``;
    });

    return new EmbedBuilder()
      .setColor(closed ? 0x6B7280 : 0x38BDF8)
      .setTitle(`📊 ${question}`)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: `Total votes: ${total}${closed ? ' • Closed' : ''}` })
      .addFields({ name: closed ? 'Ended' : 'Ends', value: `<t:${endsAtUnix}:R>`, inline: true })
      .setTimestamp();
  }

  function buildRows(disabled = false): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...options.map((_, i) =>
        new ButtonBuilder()
          .setCustomId(`poll:${i}`)
          .setEmoji(OPTION_EMOJIS[i])
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      ),
    );
    return [row];
  }

  const message = await interaction.editReply({ embeds: [renderEmbed()], components: buildRows() });

  const collector = message.createMessageComponentCollector({
    time: durationMs,
    filter: (i): i is ButtonInteraction => i.isButton() && i.customId.startsWith('poll:'),
  });

  let pending: Promise<void> = Promise.resolve();

  collector.on('collect', async (btn) => {
    const choiceIdx = parseInt(btn.customId.split(':')[1], 10);
    if (Number.isNaN(choiceIdx) || choiceIdx < 0 || choiceIdx >= options.length) return;

    const prev = votes.get(btn.user.id);
    votes.set(btn.user.id, choiceIdx);

    const ack = btn.reply({
      content: prev === choiceIdx
        ? `Your vote for **${options[choiceIdx]}** is recorded.`
        : `Vote ${prev === undefined ? 'recorded' : 'changed'}: **${options[choiceIdx]}**.`,
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);

    pending = pending.then(() => message.edit({ embeds: [renderEmbed()] }).then(() => undefined).catch(() => undefined));
    await ack;
  });

  collector.on('end', async () => {
    await pending.catch(() => undefined);
    await message.edit({ embeds: [renderEmbed(true)], components: buildRows(true) }).catch(() => null);
  });
}
