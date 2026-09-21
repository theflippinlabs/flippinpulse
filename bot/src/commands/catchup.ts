import {
  ChannelType,
  ChatInputCommandInteraction,
  Collection,
  Message,
  MessageFlags,
  SlashCommandBuilder,
  TextBasedChannel,
} from 'discord.js';
import { pulseEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';
import { aiChat, hasAI } from '../services/ai.js';

const MAX_MESSAGES = 300;
const DEFAULT_HOURS = 24;

export const data = new SlashCommandBuilder()
  .setName('catchup')
  .setDescription('AI recap of a channel over the last few hours / Résumé IA d\'un salon')
  .addChannelOption(o => o
    .setName('channel')
    .setDescription('Channel to summarize (defaults to current) / Salon à résumer (par défaut : le courant)')
    .addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread)
    .setRequired(false))
  .addIntegerOption(o => o
    .setName('hours')
    .setDescription('How many hours back (1-72, default 24) / Combien d\'heures en arrière')
    .setMinValue(1).setMaxValue(72).setRequired(false));

async function fetchWindow(channel: TextBasedChannel, sinceMs: number): Promise<Message[]> {
  const out: Message[] = [];
  let before: string | undefined;
  const cutoff = Date.now() - sinceMs;
  while (out.length < MAX_MESSAGES) {
    const batch: Collection<string, Message> = await channel.messages.fetch({ limit: 100, before }).catch(() => new Collection());
    if (!batch.size) break;
    for (const m of batch.values()) {
      if (m.author.bot) continue;
      if (m.createdTimestamp < cutoff) return out;
      out.push(m);
    }
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  return out;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Server only.' : 'Uniquement en serveur.')], flags: MessageFlags.Ephemeral });
    return;
  }

  if (!hasAI()) {
    await interaction.reply({ embeds: [errorEmbed(en
      ? 'AI is not configured. Set `ANTHROPIC_API_KEY` in Railway.'
      : 'IA non configurée. Définis `ANTHROPIC_API_KEY` sur Railway.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channelOpt = interaction.options.getChannel('channel');
  const hours = interaction.options.getInteger('hours') ?? DEFAULT_HOURS;
  const channelId = channelOpt?.id ?? interaction.channelId;
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Text channel required.' : 'Salon texte requis.')] });
    return;
  }

  const msgs = await fetchWindow(channel as TextBasedChannel, hours * 3_600_000);
  if (!msgs.length) {
    await interaction.editReply({ embeds: [pulseEmbed(en ? '📜 Catchup' : '📜 Résumé').setDescription(en
      ? `No human messages in <#${channelId}> in the last ${hours}h.`
      : `Aucun message humain dans <#${channelId}> ces ${hours} dernières heures.`)] });
    return;
  }

  msgs.reverse();
  const transcript = msgs
    .map(m => `${m.member?.displayName ?? m.author.username}: ${m.content.replace(/\n+/g, ' ').slice(0, 400)}`)
    .join('\n')
    .slice(0, 12_000);

  const system = en
    ? 'You are a Discord community assistant. Summarize the following chat log for a member who was away. ' +
      'Group by topic, not by chronological order. Bold the key names/decisions. Use bullet points. ' +
      'Include vibe (was it heated? excited? quiet?). Keep it under 350 words. Reply in English only.'
    : 'Tu es un assistant de communauté Discord. Résume la discussion ci-dessous pour un membre qui était absent. ' +
      'Groupe par thème, pas par ordre chronologique. Mets en gras les noms/décisions clés. Utilise des puces. ' +
      'Inclus l\'ambiance (était-ce animé ? excité ? calme ?). Reste sous 350 mots. Réponds uniquement en français.';

  const user = en
    ? `Channel: #${'name' in channel ? channel.name : channelId}\nMessages (${msgs.length}, last ${hours}h):\n\n${transcript}`
    : `Salon : #${'name' in channel ? channel.name : channelId}\nMessages (${msgs.length}, ces ${hours}h) :\n\n${transcript}`;

  const summary = await aiChat(system, user, 900);
  if (!summary) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'AI failed to summarize. Try again.' : 'Échec du résumé IA. Réessaie.')] });
    return;
  }

  await interaction.editReply({
    embeds: [pulseEmbed(en ? `📜 Catchup — <#${channelId}>` : `📜 Résumé — <#${channelId}>`)
      .setDescription(summary.slice(0, 4000))
      .setFooter({ text: en
        ? `${msgs.length} messages · last ${hours}h · AI-generated`
        : `${msgs.length} messages · ${hours}h · généré par IA` })],
  });
}
