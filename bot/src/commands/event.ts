import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Interaction,
  MessageActionRowComponentBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { cancelEvent, createEvent, rsvp, rsvpCounts, upcomingEvents } from '../services/calendar.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

// Accepts "YYYY-MM-DD HH:mm" or "in 2h" or "in 30m" or "tomorrow 20:00"
function parseWhen(input: string): Date | null {
  const s = input.trim().toLowerCase();
  const relMatch = s.match(/^in\s+(\d+)\s*(m|h|d)$/);
  if (relMatch) {
    const n = parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    const ms = n * (unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000);
    return new Date(Date.now() + ms);
  }
  const abs = new Date(input);
  if (!Number.isNaN(abs.getTime())) return abs;
  return null;
}

export const data = new SlashCommandBuilder()
  .setName('event')
  .setDescription('Server calendar / Calendrier serveur')
  .addSubcommand(s => s.setName('create').setDescription('Schedule an event / Planifier un événement')
    .addStringOption(o => o.setName('title').setDescription('Title / Titre').setRequired(true))
    .addStringOption(o => o.setName('when').setDescription('When (e.g. "in 2h", "2026-10-05 20:00")').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Description').setRequired(false))
    .addStringOption(o => o.setName('location').setDescription('Where (voice channel, IRL…)').setRequired(false)))
  .addSubcommand(s => s.setName('list').setDescription('Upcoming events / Événements à venir'))
  .addSubcommand(s => s.setName('cancel').setDescription('Cancel your event / Annuler')
    .addIntegerOption(o => o.setName('id').setDescription('Event id').setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const title = interaction.options.getString('title', true);
    const when = interaction.options.getString('when', true);
    const description = interaction.options.getString('description') ?? '';
    const location = interaction.options.getString('location') ?? '';
    const startsAt = parseWhen(when);
    if (!startsAt || startsAt.getTime() <= Date.now()) {
      await interaction.reply({ embeds: [errorEmbed(fr ? 'Date invalide ou passée. Exemples : `in 2h`, `2026-10-05 20:00`.' : 'Invalid or past date. Try: `in 2h`, `2026-10-05 20:00`.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const res = await createEvent({ title, description, startsAt, location, createdBy: interaction.user.id, channelId: interaction.channelId });
    if (!res.ok || !res.event) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'error')], flags: MessageFlags.Ephemeral }); return; }
    const e = res.event;
    const embed = pulseEmbed(`📅 ${e.title}`).setDescription(
      (fr
        ? `${e.description || '_(pas de description)_'}\n\n⏰ **Quand :** <t:${Math.floor(new Date(e.starts_at).getTime() / 1000)}:F> (<t:${Math.floor(new Date(e.starts_at).getTime() / 1000)}:R>)\n📍 **Où :** ${e.location || '_—_'}\n👤 Créé par <@${e.created_by}>\n\n_Rappel envoyé 15 min avant._`
        : `${e.description || '_(no description)_'}\n\n⏰ **When:** <t:${Math.floor(new Date(e.starts_at).getTime() / 1000)}:F> (<t:${Math.floor(new Date(e.starts_at).getTime() / 1000)}:R>)\n📍 **Where:** ${e.location || '_—_'}\n👤 Created by <@${e.created_by}>\n\n_Reminder sent 15 min before._`)
    );
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`event:rsvp:${e.id}:going`).setLabel(fr ? "J'y vais" : "I'm going").setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`event:rsvp:${e.id}:maybe`).setLabel(fr ? 'Peut-être' : 'Maybe').setEmoji('🤔').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`event:rsvp:${e.id}:no`).setLabel(fr ? "Pas dispo" : 'Not going').setEmoji('❌').setStyle(ButtonStyle.Danger),
    );
    await interaction.reply({ embeds: [embed], components: [row] });
    return;
  }

  if (sub === 'list') {
    const events = await upcomingEvents(10);
    if (!events.length) {
      await interaction.reply({ embeds: [errorEmbed(fr ? 'Aucun événement à venir.' : 'No upcoming events.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const lines = await Promise.all(events.map(async e => {
      const c = await rsvpCounts(e.id);
      const ts = Math.floor(new Date(e.starts_at).getTime() / 1000);
      return `📅 **#${e.id} · ${e.title}** — <t:${ts}:R>${e.location ? ` · ${e.location}` : ''}\n✅ ${c.going}   🤔 ${c.maybe}   ❌ ${c.no}`;
    }));
    await interaction.reply({
      embeds: [pulseEmbed(fr ? '📅 Événements à venir' : '📅 Upcoming events').setDescription(lines.join('\n\n'))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'cancel') {
    const id = interaction.options.getInteger('id', true);
    const res = await cancelEvent(id, interaction.user.id);
    if (!res.ok) {
      const msg = res.error === 'not_owner' ? (fr ? 'Seul le créateur peut annuler.' : 'Only the creator can cancel.')
        : res.error === 'not_scheduled' ? (fr ? "Cet événement n'est pas planifié." : 'Event is not scheduled.')
        : (fr ? 'Annulation impossible.' : 'Cancel failed.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [successEmbed(fr ? `📅 Événement #${id} annulé.` : `📅 Event #${id} cancelled.`)], flags: MessageFlags.Ephemeral });
  }
}

export async function handleEventInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('event:rsvp:')) return;
  const [, , idStr, statusStr] = interaction.customId.split(':');
  const eventId = Number(idStr);
  const status = statusStr as 'going' | 'maybe' | 'no';
  if (!['going', 'maybe', 'no'].includes(status)) return;
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const res = await rsvp(eventId, interaction.user.id, status);
  if (!res.ok) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'error')], flags: MessageFlags.Ephemeral }); return; }
  const label = status === 'going' ? (fr ? "J'y vais" : "I'm going") : status === 'maybe' ? (fr ? 'Peut-être' : 'Maybe') : (fr ? 'Pas dispo' : 'Not going');
  await interaction.reply({ embeds: [successEmbed(fr ? `RSVP enregistré : **${label}**` : `RSVP saved: **${label}**`)], flags: MessageFlags.Ephemeral });
}
