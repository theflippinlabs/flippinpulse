import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { activeHunts, attemptSolve, cancelHunt, createHunt } from '../services/treasureHunts.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('hunt')
  .setDescription('Riddle-style treasure hunts / Chasses au trésor à énigmes')
  .addSubcommand(s => s.setName('create').setDescription('Lord: create a hunt / Créer une chasse')
    .addStringOption(o => o.setName('clue').setDescription('Public clue / Indice public').setRequired(true))
    .addStringOption(o => o.setName('answer').setDescription('Secret answer / Réponse secrète').setRequired(true))
    .addIntegerOption(o => o.setName('reward').setDescription('Reward PULSE (default 500)').setMinValue(1).setMaxValue(50_000).setRequired(false)))
  .addSubcommand(s => s.setName('solve').setDescription('Submit your guess / Proposer une réponse')
    .addStringOption(o => o.setName('guess').setDescription('Your answer / Ta réponse').setRequired(true)))
  .addSubcommand(s => s.setName('list').setDescription('Show active hunts in this channel / Chasses actives ici'))
  .addSubcommand(s => s.setName('cancel').setDescription('Lord: cancel a hunt you created / Annuler ta chasse')
    .addIntegerOption(o => o.setName('id').setDescription('Hunt id').setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    if (!isAdmin) {
      await interaction.reply({ embeds: [errorEmbed(fr ? 'Réservé aux admins.' : 'Admins only.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const clue = interaction.options.getString('clue', true);
    const answer = interaction.options.getString('answer', true);
    const reward = interaction.options.getInteger('reward') ?? 500;
    const res = await createHunt({ clue, answer, rewardPulse: reward, channelId: interaction.channelId, createdBy: interaction.user.id });
    if (!res.ok || !res.hunt) { await interaction.reply({ embeds: [errorEmbed(res.error ?? 'error')], flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({
      embeds: [pulseEmbed(fr ? `🗺️ Chasse au trésor #${res.hunt.id}` : `🗺️ Treasure hunt #${res.hunt.id}`).setDescription(
        (fr
          ? `**Indice :** ${clue}\n\n💰 **Récompense :** ${reward} PULSE\n\n_Réponds avec_ \`/hunt solve guess:X\` _dans ce salon. Premier arrivé, premier servi !_`
          : `**Clue:** ${clue}\n\n💰 **Reward:** ${reward} PULSE\n\n_Answer with_ \`/hunt solve guess:X\` _in this channel. First correct answer wins!_`))],
    });
    return;
  }

  if (sub === 'solve') {
    const guess = interaction.options.getString('guess', true);
    const res = await attemptSolve(interaction.user.id, guess, interaction.channelId);
    if (!res.ok || !res.hunt) {
      const msg = res.error === 'no_match' ? (fr ? '❌ Pas la bonne réponse (ou aucune chasse active ici).' : '❌ Wrong answer (or no active hunt here).')
        : res.error === 'already_solved' ? (fr ? '⏱️ Trop tard, quelqu\'un a été plus rapide.' : '⏱️ Too late — someone beat you to it.')
        : (fr ? 'Erreur.' : 'Error.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({
      embeds: [successEmbed(fr
        ? `🎉 **Bien joué <@${interaction.user.id}> !** Tu résous la chasse #${res.hunt.id} et gagnes **+${res.reward} PULSE**.`
        : `🎉 **Nailed it <@${interaction.user.id}>!** You cracked hunt #${res.hunt.id} and earn **+${res.reward} PULSE**.`)],
    });
    return;
  }

  if (sub === 'list') {
    const hunts = await activeHunts(interaction.channelId);
    if (!hunts.length) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Aucune chasse active ici.' : 'No active hunt here.')], flags: MessageFlags.Ephemeral }); return; }
    const lines = hunts.map(h => `🗺️ **#${h.id}** — ${h.clue.slice(0, 100)} · **${h.reward_pulse} PULSE**`).join('\n\n');
    await interaction.reply({
      embeds: [pulseEmbed(fr ? '🗺️ Chasses actives' : '🗺️ Active hunts').setDescription(lines)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'cancel') {
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    if (!isAdmin) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Réservé aux admins.' : 'Admins only.')], flags: MessageFlags.Ephemeral }); return; }
    const id = interaction.options.getInteger('id', true);
    const res = await cancelHunt(id, interaction.user.id);
    if (!res.ok) {
      const msg = res.error === 'not_owner' ? (fr ? "Tu n'es pas le créateur." : "Not your hunt.")
        : (res.error ?? 'error');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [successEmbed(fr ? `Chasse #${id} annulée.` : `Hunt #${id} cancelled.`)], flags: MessageFlags.Ephemeral });
  }
}
