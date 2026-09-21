import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';
import { hasAI } from '../services/ai.js';
import {
  chatWithCompanion,
  clearHistory,
  deleteCompanion,
  getCompanion,
  upsertCompanion,
} from '../services/aiCompanion.js';

const DEFAULT_PERSONAS: Record<string, { fr: string; en: string }> = {
  friendly:  { fr: 'chaleureux et bienveillant, comme un ami proche', en: 'warm and caring, like a close friend' },
  witty:     { fr: 'espiègle et taquin, avec un humour vif', en: 'playful and teasing, with a sharp sense of humor' },
  coach:     { fr: 'motivant et exigeant, comme un coach qui te pousse', en: 'motivating and demanding, like a coach pushing you' },
  scholar:   { fr: 'curieux et cultivé, adore expliquer les choses', en: 'curious and knowledgeable, loves explaining things' },
  chill:     { fr: 'zen et cool, jamais stressé', en: 'zen and cool, never stressed' },
  mysterious:{ fr: 'énigmatique et poétique, parle par métaphores', en: 'enigmatic and poetic, speaks in metaphors' },
};

export const data = new SlashCommandBuilder()
  .setName('compagnon')
  .setDescription('Your personal AI companion / Ton compagnon IA personnel')
  .addSubcommand(s => s.setName('setup').setDescription('Create or update your companion / Créer ou modifier ton compagnon')
    .addStringOption(o => o.setName('name').setDescription('Companion name / Nom du compagnon').setRequired(true))
    .addStringOption(o => o.setName('persona').setDescription('Personality / Personnalité').setRequired(false)
      .addChoices(
        { name: '🤗 Friendly / Bienveillant', value: 'friendly' },
        { name: '😏 Witty / Espiègle', value: 'witty' },
        { name: '💪 Coach / Motivant', value: 'coach' },
        { name: '🎓 Scholar / Cultivé', value: 'scholar' },
        { name: '🌊 Chill / Zen', value: 'chill' },
        { name: '🔮 Mysterious / Mystérieux', value: 'mysterious' },
      ))
    .addStringOption(o => o.setName('emoji').setDescription('Signature emoji / Emoji signature').setRequired(false))
    .addStringOption(o => o.setName('memory').setDescription('What should it remember about you? / Ce qu\'il doit retenir sur toi').setRequired(false)))
  .addSubcommand(s => s.setName('chat').setDescription('Talk to your companion / Parler à ton compagnon')
    .addStringOption(o => o.setName('message').setDescription('Your message / Ton message').setRequired(true)))
  .addSubcommand(s => s.setName('view').setDescription('View your companion / Voir ton compagnon'))
  .addSubcommand(s => s.setName('memory').setDescription('Update long-term memory / Modifier la mémoire')
    .addStringOption(o => o.setName('notes').setDescription('Notes (max 500 chars) / Notes (500 car. max)').setRequired(true)))
  .addSubcommand(s => s.setName('reset').setDescription('Clear conversation history / Effacer l\'historique'))
  .addSubcommand(s => s.setName('delete').setDescription('Delete your companion / Supprimer ton compagnon'));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!hasAI()) {
    await interaction.reply({ embeds: [errorEmbed(en
      ? 'AI is not configured. Set `ANTHROPIC_API_KEY` in Railway.'
      : 'IA non configurée. Définis `ANTHROPIC_API_KEY` sur Railway.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const userName = interaction.user.username;

  if (sub === 'setup') {
    const name = interaction.options.getString('name', true).slice(0, 40);
    const personaKey = interaction.options.getString('persona') ?? 'friendly';
    const emoji = (interaction.options.getString('emoji') ?? '✨').slice(0, 8);
    const memoryOpt = interaction.options.getString('memory');
    const persona = DEFAULT_PERSONAS[personaKey]?.[locale] ?? DEFAULT_PERSONAS.friendly[locale];

    const existing = await getCompanion(userId);
    const companion = await upsertCompanion({
      discord_id: userId,
      name,
      persona,
      tone: 'casual',
      emoji,
      memory_notes: memoryOpt !== null ? (memoryOpt ?? '').slice(0, 500) : (existing?.memory_notes ?? ''),
      language: locale,
      is_active: true,
    });

    if (!companion) {
      await interaction.reply({ embeds: [errorEmbed(en ? 'Could not save your companion.' : 'Impossible de sauvegarder ton compagnon.')], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      embeds: [successEmbed(en
        ? `${companion.emoji} **${companion.name}** is ready.\nPersonality: _${companion.persona}_\n\nTalk to them with \`/compagnon chat\` or just **DM the bot** directly.`
        : `${companion.emoji} **${companion.name}** est prêt·e.\nPersonnalité : _${companion.persona}_\n\nParle-lui avec \`/compagnon chat\` ou **envoie un DM au bot** directement.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'view') {
    const companion = await getCompanion(userId);
    if (!companion) {
      await interaction.reply({ embeds: [errorEmbed(en
        ? 'You don\'t have a companion yet. Create one with `/compagnon setup`.'
        : 'Tu n\'as pas encore de compagnon. Crée-en un avec `/compagnon setup`.')], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      embeds: [pulseEmbed(`${companion.emoji} ${companion.name}`).setDescription(
        (en
          ? `**Personality:** ${companion.persona}\n**Language:** ${companion.language.toUpperCase()}\n\n**Memory:**\n${companion.memory_notes || '_(nothing yet — set with `/compagnon memory`)_'}`
          : `**Personnalité :** ${companion.persona}\n**Langue :** ${companion.language.toUpperCase()}\n\n**Mémoire :**\n${companion.memory_notes || '_(rien encore — règle avec `/compagnon memory`)_'}`)
      )],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'chat') {
    const msg = interaction.options.getString('message', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await chatWithCompanion(userId, userName, msg);
    if (res.setupRequired) {
      await interaction.editReply({ embeds: [errorEmbed(en
        ? 'Set up your companion first with `/compagnon setup`.'
        : 'Configure d\'abord ton compagnon avec `/compagnon setup`.')] });
      return;
    }
    if (!res.reply) {
      await interaction.editReply({ embeds: [errorEmbed(en ? 'The AI did not reply. Try again.' : 'L\'IA n\'a pas répondu. Réessaie.')] });
      return;
    }
    const companion = await getCompanion(userId);
    await interaction.editReply({
      embeds: [pulseEmbed(`${companion?.emoji ?? '✨'} ${companion?.name ?? 'Nova'}`).setDescription(res.reply.slice(0, 3800))],
    });
    return;
  }

  if (sub === 'memory') {
    const notes = interaction.options.getString('notes', true).slice(0, 500);
    const companion = await upsertCompanion({ discord_id: userId, memory_notes: notes });
    await interaction.reply({
      embeds: [successEmbed(en
        ? `Memory saved (${notes.length} chars). ${companion?.name ?? 'Your companion'} will use it in every future reply.`
        : `Mémoire sauvegardée (${notes.length} car.). ${companion?.name ?? 'Ton compagnon'} l'utilisera à chaque réponse.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'reset') {
    await clearHistory(userId);
    await interaction.reply({
      embeds: [successEmbed(en ? 'Conversation history cleared.' : 'Historique de conversation effacé.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'delete') {
    await deleteCompanion(userId);
    await interaction.reply({
      embeds: [successEmbed(en ? 'Companion deleted.' : 'Compagnon supprimé.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}
