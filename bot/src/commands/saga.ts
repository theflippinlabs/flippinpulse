import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { attemptChapter, currentDay, getProgress, listActiveSagas } from '../services/sagas.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';
import { supabase } from '../supabase.js';
import type { Saga } from '../services/sagas.js';

export const data = new SlashCommandBuilder()
  .setName('saga')
  .setDescription('Multi-day narrative events / Événements narratifs multi-jours')
  .addSubcommand(s => s.setName('list').setDescription('List active sagas / Sagas actives'))
  .addSubcommand(s => s.setName('view').setDescription('Read the current chapter / Lire le chapitre du jour')
    .addIntegerOption(o => o.setName('id').setDescription('Saga id').setRequired(true)))
  .addSubcommand(s => s.setName('solve').setDescription('Answer the chapter riddle / Résoudre l\'énigme du jour')
    .addIntegerOption(o => o.setName('id').setDescription('Saga id').setRequired(true))
    .addStringOption(o => o.setName('guess').setDescription('Your answer').setRequired(true)))
  .addSubcommand(s => s.setName('progress').setDescription('Your progress on a saga / Ta progression')
    .addIntegerOption(o => o.setName('id').setDescription('Saga id').setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const sub = interaction.options.getSubcommand();

  if (sub === 'list') {
    const sagas = await listActiveSagas();
    if (!sagas.length) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Aucune saga active.' : 'No active sagas.')], flags: MessageFlags.Ephemeral }); return; }
    const lines = sagas.map(s => `📖 **#${s.id} · ${s.title}** — ${s.chapters_json.length} chapitres · fin <t:${Math.floor(new Date(s.ends_at).getTime() / 1000)}:R>`).join('\n');
    await interaction.reply({
      embeds: [pulseEmbed(fr ? '📖 Sagas' : '📖 Sagas').setDescription(lines)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const id = interaction.options.getInteger('id', true);
  const { data: sagaData } = await supabase.from('sagas').select('*').eq('id', id).maybeSingle();
  if (!sagaData) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Saga introuvable.' : 'Saga not found.')], flags: MessageFlags.Ephemeral }); return; }
  const saga = sagaData as Saga;

  if (sub === 'view') {
    const day = await currentDay(saga);
    if (!day) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Aucun chapitre en cours.' : 'No current chapter.')], flags: MessageFlags.Ephemeral }); return; }
    const chapter = saga.chapters_json.find(c => c.day === day);
    if (!chapter) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Chapitre introuvable.' : 'Chapter missing.')], flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({
      embeds: [pulseEmbed(`📖 ${saga.title} — ${fr ? 'Jour' : 'Day'} ${day}/${saga.chapters_json.length}`).setDescription(
        (fr
          ? `**${chapter.title}**\n\n${chapter.clue}\n\n💰 Récompense chapitre : **${chapter.reward_pulse} PULSE**\n🏆 Bonus final : **${saga.reward_pulse} PULSE**\n\n_Réponds avec_ \`/saga solve id:${saga.id} guess:X\``
          : `**${chapter.title}**\n\n${chapter.clue}\n\n💰 Chapter reward: **${chapter.reward_pulse} PULSE**\n🏆 Final bonus: **${saga.reward_pulse} PULSE**\n\n_Answer with_ \`/saga solve id:${saga.id} guess:X\``))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'solve') {
    const guess = interaction.options.getString('guess', true);
    const res = await attemptChapter(id, interaction.user.id, guess);
    if (!res.ok || !res.chapter) {
      const msg = res.error === 'wrong' ? (fr ? '❌ Mauvaise réponse.' : '❌ Wrong answer.')
        : res.error === 'already_done_today' ? (fr ? '✅ Tu as déjà résolu le chapitre du jour.' : '✅ You already solved today\'s chapter.')
        : res.error === 'no_current_chapter' ? (fr ? 'Aucun chapitre en cours.' : 'No current chapter.')
        : res.error === 'not_running' ? (fr ? 'Cette saga n\'est pas en cours.' : 'Saga is not running.')
        : (fr ? 'Erreur.' : 'Error.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    let summary = fr
      ? `🎉 Chapitre "${res.chapter.title}" résolu ! **+${res.reward} PULSE**`
      : `🎉 Chapter "${res.chapter.title}" solved! **+${res.reward} PULSE**`;
    if (res.allDone && res.finalReward) {
      summary += fr ? `\n\n🏆 **Saga terminée !** Bonus final : **+${res.finalReward} PULSE**` : `\n\n🏆 **Saga complete!** Final bonus: **+${res.finalReward} PULSE**`;
    }
    await interaction.reply({ embeds: [successEmbed(summary)] });
    return;
  }

  if (sub === 'progress') {
    const p = await getProgress(id, interaction.user.id);
    const done = p.chapters_completed.length;
    const total = saga.chapters_json.length;
    const dots = saga.chapters_json.map(c => p.chapters_completed.includes(c.day) ? '✅' : '⬜').join(' ');
    await interaction.reply({
      embeds: [pulseEmbed(`📖 ${saga.title}`).setDescription(
        (fr
          ? `Progression : **${done} / ${total}** chapitres\n\n${dots}\n\n${p.final_claimed ? '🏆 Bonus final réclamé' : (done === total ? 'Bonus final prêt à réclamer' : '')}`
          : `Progress: **${done} / ${total}** chapters\n\n${dots}\n\n${p.final_claimed ? '🏆 Final bonus claimed' : (done === total ? 'Final bonus ready to claim' : '')}`))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

// Admin: Lord creates sagas via a modal-driven /sagaadmin — kept simple:
// require Administrator perms.
export const adminData = new SlashCommandBuilder()
  .setName('sagaadmin')
  .setDescription('Admin: create a saga')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o => o.setName('title').setDescription('Saga title').setRequired(true))
  .addStringOption(o => o.setName('intro').setDescription('Intro text').setRequired(true))
  .addIntegerOption(o => o.setName('days').setDescription('Number of days (1-14)').setMinValue(1).setMaxValue(14).setRequired(true))
  .addIntegerOption(o => o.setName('finalreward').setDescription('Final completion bonus PULSE').setMinValue(0).setMaxValue(100_000).setRequired(true))
  .addStringOption(o => o.setName('chapters').setDescription('JSON array of {title,clue,answer,reward}, one per day').setRequired(true))
  .addStringOption(o => o.setName('start').setDescription('Start when (in Nh | YYYY-MM-DD HH:mm)').setRequired(false));

export async function adminExecute(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ embeds: [errorEmbed('Admins only.')], flags: MessageFlags.Ephemeral });
    return;
  }
  const title = interaction.options.getString('title', true);
  const intro = interaction.options.getString('intro', true);
  const days = interaction.options.getInteger('days', true);
  const finalReward = interaction.options.getInteger('finalreward', true);
  const chaptersJson = interaction.options.getString('chapters', true);
  const startStr = interaction.options.getString('start') ?? '';
  let startsAt: Date;
  if (!startStr) startsAt = new Date();
  else {
    const rel = startStr.trim().toLowerCase().match(/^in\s+(\d+)\s*(m|h|d)$/);
    if (rel) {
      const n = parseInt(rel[1], 10);
      const unit = rel[2];
      const ms = n * (unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000);
      startsAt = new Date(Date.now() + ms);
    } else {
      startsAt = new Date(startStr);
    }
  }
  if (Number.isNaN(startsAt.getTime())) {
    await interaction.reply({ embeds: [errorEmbed('Invalid start.')], flags: MessageFlags.Ephemeral });
    return;
  }
  let chapters: { title: string; clue: string; answer: string; reward: number }[];
  try {
    chapters = JSON.parse(chaptersJson);
    if (!Array.isArray(chapters)) throw new Error('not array');
  } catch {
    await interaction.reply({ embeds: [errorEmbed('Chapters must be a JSON array.')], flags: MessageFlags.Ephemeral });
    return;
  }
  const { createSaga } = await import('../services/sagas.js');
  const res = await createSaga({
    title, intro, startsAt, days, rewardPulse: finalReward,
    chapters, createdBy: interaction.user.id,
  });
  if (!res.ok || !res.saga) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'error')], flags: MessageFlags.Ephemeral }); return; }
  await interaction.reply({ embeds: [successEmbed(`📖 Saga #${res.saga.id} — "${res.saga.title}" créée. Statut : ${res.saga.status}.`)] });
}
