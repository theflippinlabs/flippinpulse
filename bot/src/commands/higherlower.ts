import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ComponentType,
  Message,
  ModalSubmitInteraction,
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
import { buildPostGameRow } from '../utils/postgame.js';
import { getUserLocale } from '../i18n.js';

const MIN = 1;
const MAX = 100;
const randCard = () => Math.floor(Math.random() * (MAX - MIN + 1)) + MIN;

export const data = new SlashCommandBuilder()
  .setName('higherlower')
  .setDescription('Higher or Lower — guess the next number, cash out before you miss!')
  .addIntegerOption(opt =>
    opt.setName('bet').setDescription('Amount of PULSE to bet').setRequired(true).setMinValue(1)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const bet = interaction.options.getInteger('bet', true);
  await runHigherLower(interaction, bet);
}

export async function runHigherLower(interaction: ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction, bet: number): Promise<void> {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!isGameEnabled('higherlower')) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Higher or Lower is currently disabled.' : 'Higher or Lower est désactivé pour l\'instant.')], ephemeral: true });
    return;
  }

  const cfg = getGameConfig('higherlower');
  const conf = (cfg?.config_json ?? {}) as {
    min_bet: number; max_bet: number; fee_percent: number; max_rounds: number;
  };
  const minBet = conf.min_bet ?? 10;
  const maxBet = conf.max_bet ?? 500;
  const feePercent = conf.fee_percent ?? 5;
  const maxRounds = conf.max_rounds ?? 10;

  if (bet < minBet || bet > maxBet) {
    await interaction.reply({ embeds: [errorEmbed(en
      ? `Bet must be between ${minBet} and ${maxBet} PULSE.`
      : `La mise doit être entre ${minBet} et ${maxBet} PULSE.`)], ephemeral: true });
    return;
  }

  const bal = await getBalance(interaction.user.id);
  if (!bal || bal.balance < bet) {
    await interaction.reply({ embeds: [errorEmbed(en
      ? `Not enough PULSE. You have ${bal?.balance ?? 0}.`
      : `Pas assez de PULSE. Tu as ${bal?.balance ?? 0}.`)], ephemeral: true });
    return;
  }

  const spend = await spendPulse(interaction.user.id, bet, 'higherlower_bet');
  if (!spend.success) {
    await interaction.reply({ embeds: [errorEmbed(spend.error ?? (en ? 'Failed to place bet.' : 'Échec de la mise.'))], ephemeral: true });
    return;
  }

  const sessionId = await createGameSession('higherlower', interaction.channelId ?? '', { bet });
  if (!sessionId) {
    await earnPulse(interaction.user.id, bet, 'higherlower_refund');
    await interaction.reply({ embeds: [errorEmbed(en ? 'Failed to start game. Bet refunded.' : 'Impossible de démarrer la partie. Mise remboursée.')], ephemeral: true });
    return;
  }
  await addGamePlayer(sessionId, interaction.user.id, bet);

  let current = randCard();
  let pot = bet;
  let round = 0;
  let finished = false;

  const cashLabel = en ? 'Cash Out' : 'Encaisser';
  const higherLabel = en ? 'Higher ⬆️' : 'Plus haut ⬆️';
  const lowerLabel  = en ? 'Lower ⬇️'  : 'Plus bas ⬇️';
  const betLabel = en ? 'Bet' : 'Mise';
  const potLabel = en ? 'Current pot' : 'Cagnotte';
  const streakLabel = en ? 'Streak' : 'Série';
  const firstGuess = en ? 'Make your first guess!' : 'Fais ta première prédiction !';
  const guessAgain = en ? 'Guess again or cash out!' : 'Rejoue ou encaisse !';

  const render = () => {
    const higherBtn = new ButtonBuilder()
      .setCustomId(`hl_up_${sessionId}`)
      .setLabel(higherLabel)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(current === MAX);
    const lowerBtn = new ButtonBuilder()
      .setCustomId(`hl_down_${sessionId}`)
      .setLabel(lowerLabel)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(current === MIN);
    const cashBtn = new ButtonBuilder()
      .setCustomId(`hl_cash_${sessionId}`)
      .setLabel(`💰 ${cashLabel} (${pot})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(round === 0);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(higherBtn, lowerBtn, cashBtn);

    const questionLine = en
      ? 'Will the next number be higher or lower?'
      : 'Le prochain numéro sera plus haut ou plus bas ?';
    const currentLine = en
      ? `Current number: **${current}** (range ${MIN}–${MAX})`
      : `Numéro actuel : **${current}** (entre ${MIN} et ${MAX})`;

    const embed = pulseEmbed('🎴 Higher or Lower')
      .setDescription(
        `${currentLine}\n\n${questionLine}\n\n` +
        `**${betLabel}:** ${bet} PULSE\n💰 **${potLabel}:** ${pot} PULSE\n🔢 **${streakLabel}:** ${round}/${maxRounds}`
      )
      .setFooter({ text: round === 0 ? firstGuess : guessAgain });
    return { embeds: [embed], components: [row] };
  };

  const reply = await interaction.reply({ ...render(), fetchReply: true }) as Message;

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i) => i.user.id === interaction.user.id,
  });

  const endLoss = async () => {
    finished = true;
    collector.stop('done');
    await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
    await saveGameResult(sessionId, { result: 'lost', rounds: round, bet });
  };

  const cashOut = async (btn: ButtonInteraction) => {
    finished = true;
    collector.stop('done');
    await earnPulse(interaction.user.id, pot, `higherlower_win_${round}`, sessionId);
    await setPlayerPayout(sessionId, interaction.user.id, pot);
    await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
    await saveGameResult(sessionId, { result: 'cashed_out', rounds: round, payout: pot, bet });
    const msg = en
      ? `🎉 Cashed out after **${round}** correct guess${round === 1 ? '' : 'es'}!\n\n💰 You won **${pot}** PULSE (bet was ${bet}).`
      : `🎉 Encaissé après **${round}** bonne${round === 1 ? '' : 's'} prédiction${round === 1 ? '' : 's'} !\n\n💰 Tu gagnes **${pot}** PULSE (mise ${bet}).`;
    await btn.update({
      embeds: [successEmbed(msg)],
      components: [buildPostGameRow('higherlower', bet)],
    });
  };

  collector.on('collect', async (btn) => {
    if (finished) return;

    if (btn.customId === `hl_cash_${sessionId}`) {
      await cashOut(btn);
      return;
    }

    const guessHigher = btn.customId === `hl_up_${sessionId}`;
    const prob = guessHigher ? (MAX - current) / MAX : (current - 1) / MAX;
    const next = randCard();
    const win = guessHigher ? next > current : next < current;

    if (!win || prob <= 0) {
      await endLoss();
      const notLine = en
        ? (guessHigher ? 'not higher' : 'not lower')
        : (guessHigher ? 'pas plus haut' : 'pas plus bas');
      const nextLine = en ? `Next number was **${next}** — ${notLine}. 💥` : `Le prochain était **${next}** — ${notLine}. 💥`;
      const potChunk = round > 0
        ? (en ? ` (and a pot of ${pot})` : ` (et une cagnotte de ${pot})`)
        : '';
      const lostLine = en
        ? `You lost **${bet}** PULSE${potChunk}.`
        : `Tu perds **${bet}** PULSE${potChunk}.`;
      await btn.update({
        embeds: [errorEmbed(`${nextLine}\n\n${lostLine}`).setTitle('🎴 Higher or Lower')],
        components: [buildPostGameRow('higherlower', bet)],
      });
      return;
    }

    const mult = (1 / prob) * (1 - feePercent / 100);
    pot = Math.max(pot + 1, Math.floor(pot * mult));
    round += 1;
    current = next;

    if (round >= maxRounds) {
      await cashOut(btn);
      return;
    }

    await btn.update(render());
  });

  collector.on('end', async (_c, reason) => {
    if (finished || reason === 'done') return;
    if (round > 0) {
      await earnPulse(interaction.user.id, pot, `higherlower_timeout_cashout_${round}`, sessionId);
      await setPlayerPayout(sessionId, interaction.user.id, pot);
      await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
      await saveGameResult(sessionId, { result: 'timeout_cashout', rounds: round, payout: pot, bet });
      const msg = en
        ? `⏰ Time's up — auto cashed out **${pot}** PULSE after ${round} correct guess${round === 1 ? '' : 'es'}.`
        : `⏰ Temps écoulé — encaissé automatiquement **${pot}** PULSE après ${round} bonne${round === 1 ? '' : 's'} prédiction${round === 1 ? '' : 's'}.`;
      await interaction.editReply({ embeds: [successEmbed(msg)], components: [] }).catch(() => {});
    } else {
      await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
      await saveGameResult(sessionId, { result: 'timeout_loss', rounds: 0, bet });
      const msg = en
        ? `⏰ Time's up! You didn't guess. You lost **${bet}** PULSE.`
        : `⏰ Temps écoulé ! Tu n'as pas prédit. Tu perds **${bet}** PULSE.`;
      await interaction.editReply({ embeds: [errorEmbed(msg).setTitle('🎴 Higher or Lower')], components: [] }).catch(() => {});
    }
  });
}
