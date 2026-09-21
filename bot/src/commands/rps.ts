import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { spendPulse, getBalance } from '../services/economy.js';
import {
  getGameConfig,
  isGameEnabled,
  createGameSession,
  updateGameSession,
  addGamePlayer,
  setPlayerPayout,
  saveGameResult,
  earnPulse,
} from '../services/games.js';
import { pulseEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';

interface RPSConfig {
  min_bet: number;
  max_bet: number;
  fee_percent: number;
  timeout_seconds: number;
}

const DEFAULT_CONFIG: RPSConfig = { min_bet: 5, max_bet: 300, fee_percent: 5, timeout_seconds: 60 };

type Choice = 'rock' | 'paper' | 'scissors';
const CHOICE_EMOJI: Record<Choice, string> = { rock: '🪨', paper: '📄', scissors: '✂️' };

function winnerOf(a: Choice, b: Choice): 'a' | 'b' | 'tie' {
  if (a === b) return 'tie';
  if ((a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper')) return 'a';
  return 'b';
}

export const data = new SlashCommandBuilder()
  .setName('rps')
  .setDescription('Challenge a player to Rock Paper Scissors')
  .addUserOption(o => o.setName('opponent').setDescription('Who to challenge').setRequired(true))
  .addIntegerOption(o => o.setName('bet').setDescription('PULSE to wager').setRequired(true).setMinValue(1));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await (await import('../i18n.js')).getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!isGameEnabled('rps')) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'RPS is currently disabled.' : 'RPS est désactivé pour l\'instant.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const raw = getGameConfig('rps')?.config_json as Partial<RPSConfig> | undefined;
  const cfg: RPSConfig = { ...DEFAULT_CONFIG, ...(raw ?? {}) };

  const opponent = interaction.options.getUser('opponent', true);
  const bet = interaction.options.getInteger('bet', true);

  if (opponent.id === interaction.user.id) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'You cannot challenge yourself.' : 'Tu ne peux pas te défier toi-même.')], flags: MessageFlags.Ephemeral });
    return;
  }
  if (opponent.bot) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'You cannot challenge a bot.' : 'Tu ne peux pas défier un bot.')], flags: MessageFlags.Ephemeral });
    return;
  }
  if (bet < cfg.min_bet || bet > cfg.max_bet) {
    await interaction.reply({ embeds: [errorEmbed(en
      ? `Bet must be between ${cfg.min_bet} and ${cfg.max_bet} PULSE.`
      : `La mise doit être entre ${cfg.min_bet} et ${cfg.max_bet} PULSE.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  const aBal = await getBalance(interaction.user.id);
  if (!aBal || aBal.balance < bet) {
    await interaction.reply({ embeds: [errorEmbed(en
      ? `You don't have enough PULSE. Balance: ${aBal?.balance ?? 0}`
      : `Tu n'as pas assez de PULSE. Solde : ${aBal?.balance ?? 0}`)], flags: MessageFlags.Ephemeral });
    return;
  }

  const sessionId = await createGameSession('rps', interaction.channelId, {
    challenger: interaction.user.id, opponent: opponent.id, bet,
  });
  if (!sessionId) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Failed to create match.' : 'Impossible de créer le match.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const acceptRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`rps_accept_${sessionId}`).setLabel(en ? 'Accept' : 'Accepter').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`rps_decline_${sessionId}`).setLabel(en ? 'Decline' : 'Refuser').setStyle(ButtonStyle.Danger),
  );

  const challengeEmbed = pulseEmbed(en ? '✊✋✌️ Rock Paper Scissors' : '✊✋✌️ Pierre-Feuille-Ciseaux')
    .setDescription(en
      ? `<@${interaction.user.id}> challenges <@${opponent.id}> for **${bet}** PULSE.\n\n<@${opponent.id}>, do you accept?`
      : `<@${interaction.user.id}> défie <@${opponent.id}> pour **${bet}** PULSE.\n\n<@${opponent.id}>, tu acceptes ?`);

  const reply = await interaction.reply({
    content: `<@${opponent.id}>`,
    embeds: [challengeEmbed],
    components: [acceptRow],
    withResponse: true,
  });
  const message = reply.resource?.message;
  if (!message) return;

  const lobby = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: cfg.timeout_seconds * 1000,
    filter: (i: ButtonInteraction) => i.user.id === opponent.id,
  });

  let started = false;

  lobby.on('collect', async (btn) => {
    if (btn.customId === `rps_decline_${sessionId}`) {
      lobby.stop('declined');
      await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
      await btn.update({
        embeds: [errorEmbed(en ? `${opponent.username} declined the challenge.` : `${opponent.username} a refusé le défi.`).setTitle('✊✋✌️ RPS')],
        components: [],
      });
      return;
    }

    if (btn.customId !== `rps_accept_${sessionId}`) return;
    started = true;
    lobby.stop('accepted');

    const bBal = await getBalance(opponent.id);
    if (!bBal || bBal.balance < bet) {
      await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
      await btn.update({
        embeds: [errorEmbed(en ? `${opponent.username} doesn't have enough PULSE.` : `${opponent.username} n'a pas assez de PULSE.`).setTitle('✊✋✌️ RPS')],
        components: [],
      });
      return;
    }

    const s1 = await spendPulse(interaction.user.id, bet, 'rps_bet', sessionId);
    const s2 = await spendPulse(opponent.id, bet, 'rps_bet', sessionId);
    if (!s1.success || !s2.success) {
      if (s1.success) await earnPulse(interaction.user.id, bet, 'rps_refund', sessionId);
      if (s2.success) await earnPulse(opponent.id, bet, 'rps_refund', sessionId);
      await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
      await btn.update({
        embeds: [errorEmbed(en ? 'Failed to deduct bets. Match cancelled.' : 'Impossible de débiter les mises. Match annulé.').setTitle('✊✋✌️ RPS')],
        components: [],
      });
      return;
    }

    await addGamePlayer(sessionId, interaction.user.id, bet);
    await addGamePlayer(sessionId, opponent.id, bet);

    const pickRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`rps_pick_${sessionId}_rock`).setEmoji('🪨').setLabel(en ? 'Rock' : 'Pierre').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rps_pick_${sessionId}_paper`).setEmoji('📄').setLabel(en ? 'Paper' : 'Feuille').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rps_pick_${sessionId}_scissors`).setEmoji('✂️').setLabel(en ? 'Scissors' : 'Ciseaux').setStyle(ButtonStyle.Secondary),
    );

    await btn.update({
      embeds: [pulseEmbed(en ? '✊✋✌️ Rock Paper Scissors' : '✊✋✌️ Pierre-Feuille-Ciseaux').setDescription(en
        ? `<@${interaction.user.id}> vs <@${opponent.id}> for **${bet}** PULSE.\n\nBoth players, pick in secret using the buttons below.`
        : `<@${interaction.user.id}> vs <@${opponent.id}> pour **${bet}** PULSE.\n\nLes deux joueurs, choisissez en secret avec les boutons ci-dessous.`)],
      components: [pickRow],
    });

    const picks = new Map<string, Choice>();
    const playerIds = new Set([interaction.user.id, opponent.id]);

    const pickCollector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: cfg.timeout_seconds * 1000,
      filter: (i: ButtonInteraction) => playerIds.has(i.user.id) && i.customId.startsWith(`rps_pick_${sessionId}_`),
    });

    pickCollector.on('collect', async (pick) => {
      const choice = pick.customId.split(`_pick_${sessionId}_`)[1] as Choice;
      const prev = picks.get(pick.user.id);
      picks.set(pick.user.id, choice);

      // Ephemeral confirmation goes to the picker so it uses THEIR locale.
      const pickerLocale = await (await import('../i18n.js')).getUserLocale(pick.user.id);
      const pen = pickerLocale === 'en';
      const choiceLabel = pen ? choice : ({ rock: 'pierre', paper: 'feuille', scissors: 'ciseaux' } as Record<string, string>)[choice] ?? choice;

      await pick.reply({
        content: prev
          ? (pen ? `Updated to ${CHOICE_EMOJI[choice]} ${choiceLabel}.` : `Choix modifié : ${CHOICE_EMOJI[choice]} ${choiceLabel}.`)
          : (pen ? `Locked in: ${CHOICE_EMOJI[choice]} ${choiceLabel}.` : `Verrouillé : ${CHOICE_EMOJI[choice]} ${choiceLabel}.`),
        flags: MessageFlags.Ephemeral,
      });

      if (picks.size === 2) pickCollector.stop('both_picked');
    });

    pickCollector.on('end', async (_c, reason) => {
      const aChoice = picks.get(interaction.user.id);
      const bChoice = picks.get(opponent.id);

      if (!aChoice || !bChoice) {
        await earnPulse(interaction.user.id, bet, 'rps_refund', sessionId);
        await earnPulse(opponent.id, bet, 'rps_refund', sessionId);
        await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
        await interaction.editReply({
          embeds: [errorEmbed(en
            ? `Timed out before both players picked (${reason}). Bets refunded.`
            : `Temps écoulé avant que les deux joueurs choisissent (${reason}). Mises remboursées.`).setTitle('✊✋✌️ RPS')],
          components: [],
        });
        return;
      }

      const outcome = winnerOf(aChoice, bChoice);
      const totalPot = bet * 2;
      const fee = Math.floor(totalPot * (cfg.fee_percent / 100));
      const winPayout = totalPot - fee;

      let title: string;
      if (outcome === 'tie') {
        await earnPulse(interaction.user.id, bet, 'rps_refund', sessionId);
        await earnPulse(opponent.id, bet, 'rps_refund', sessionId);
        title = en ? '🤝 Tie — bets refunded.' : '🤝 Égalité — mises remboursées.';
      } else if (outcome === 'a') {
        await earnPulse(interaction.user.id, winPayout, 'rps_win', sessionId);
        await setPlayerPayout(sessionId, interaction.user.id, winPayout);
        title = en ? `🏆 <@${interaction.user.id}> wins **${winPayout}** PULSE!` : `🏆 <@${interaction.user.id}> gagne **${winPayout}** PULSE !`;
      } else {
        await earnPulse(opponent.id, winPayout, 'rps_win', sessionId);
        await setPlayerPayout(sessionId, opponent.id, winPayout);
        title = en ? `🏆 <@${opponent.id}> wins **${winPayout}** PULSE!` : `🏆 <@${opponent.id}> gagne **${winPayout}** PULSE !`;
      }

      await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
      await saveGameResult(sessionId, { aChoice, bChoice, outcome, winPayout, fee });

      const aChoiceFr = ({ rock: 'pierre', paper: 'feuille', scissors: 'ciseaux' } as Record<string, string>)[aChoice] ?? aChoice;
      const bChoiceFr = ({ rock: 'pierre', paper: 'feuille', scissors: 'ciseaux' } as Record<string, string>)[bChoice] ?? bChoice;
      const pickedLbl = en ? 'picked' : 'a choisi';
      const resultEmbed = successEmbed([
        `<@${interaction.user.id}> ${pickedLbl} ${CHOICE_EMOJI[aChoice]} **${en ? aChoice : aChoiceFr}**`,
        `<@${opponent.id}> ${pickedLbl} ${CHOICE_EMOJI[bChoice]} **${en ? bChoice : bChoiceFr}**`,
        '',
        title,
      ].join('\n')).setTitle(en ? '✊✋✌️ RPS Result' : '✊✋✌️ Résultat RPS');

      await interaction.editReply({ embeds: [resultEmbed], components: [] });
    });
  });

  lobby.on('end', async (_c, reason) => {
    if (started) return;
    if (reason === 'time') {
      await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
      await interaction.editReply({
        embeds: [errorEmbed(en
          ? `${opponent.username} didn't respond in time. Challenge cancelled.`
          : `${opponent.username} n'a pas répondu à temps. Défi annulé.`).setTitle('✊✋✌️ RPS')],
        components: [],
      });
    }
  });
}
