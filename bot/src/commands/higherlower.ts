import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ComponentType,
  Message,
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
  if (!isGameEnabled('higherlower')) {
    await interaction.reply({ embeds: [errorEmbed('Higher or Lower is currently disabled.')], ephemeral: true });
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

  const bet = interaction.options.getInteger('bet', true);
  if (bet < minBet || bet > maxBet) {
    await interaction.reply({ embeds: [errorEmbed(`Bet must be between ${minBet} and ${maxBet} PULSE.`)], ephemeral: true });
    return;
  }

  const bal = await getBalance(interaction.user.id);
  if (!bal || bal.balance < bet) {
    await interaction.reply({ embeds: [errorEmbed(`Insufficient PULSE. You have ${bal?.balance ?? 0}.`)], ephemeral: true });
    return;
  }

  const spend = await spendPulse(interaction.user.id, bet, 'higherlower_bet');
  if (!spend.success) {
    await interaction.reply({ embeds: [errorEmbed(spend.error ?? 'Failed to place bet.')], ephemeral: true });
    return;
  }

  const sessionId = await createGameSession('higherlower', interaction.channelId, { bet });
  if (!sessionId) {
    await earnPulse(interaction.user.id, bet, 'higherlower_refund');
    await interaction.reply({ embeds: [errorEmbed('Failed to start game. Bet refunded.')], ephemeral: true });
    return;
  }
  await addGamePlayer(sessionId, interaction.user.id, bet);

  let current = randCard();
  let pot = bet;
  let round = 0;
  let finished = false;

  const render = () => {
    const higherBtn = new ButtonBuilder()
      .setCustomId(`hl_up_${sessionId}`)
      .setLabel('Higher ⬆️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(current === MAX);
    const lowerBtn = new ButtonBuilder()
      .setCustomId(`hl_down_${sessionId}`)
      .setLabel('Lower ⬇️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(current === MIN);
    const cashBtn = new ButtonBuilder()
      .setCustomId(`hl_cash_${sessionId}`)
      .setLabel(`💰 Cash Out (${pot})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(round === 0);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(higherBtn, lowerBtn, cashBtn);

    const embed = pulseEmbed('🎴 Higher or Lower')
      .setDescription(
        `Current number: **${current}** (range ${MIN}–${MAX})\n\n` +
        `Will the next number be higher or lower?\n\n` +
        `**Bet:** ${bet} PULSE\n💰 **Current pot:** ${pot} PULSE\n🔢 **Streak:** ${round}/${maxRounds}`
      )
      .setFooter({ text: round === 0 ? 'Make your first guess!' : 'Guess again or cash out!' });
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
    await btn.update({
      embeds: [successEmbed(`🎉 Cashed out after **${round}** correct guess${round === 1 ? '' : 'es'}!\n\n💰 You won **${pot}** PULSE (bet was ${bet}).`)],
      components: [],
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
      await btn.update({
        embeds: [errorEmbed(
          `Next number was **${next}** — ${guessHigher ? 'not higher' : 'not lower'}. 💥\n\n` +
          `You lost **${bet}** PULSE${round > 0 ? ` (and a pot of ${pot})` : ''}.`
        ).setTitle('🎴 Higher or Lower')],
        components: [],
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
    // Timed out: keep winnings if any, otherwise the bet is lost.
    if (round > 0) {
      await earnPulse(interaction.user.id, pot, `higherlower_timeout_cashout_${round}`, sessionId);
      await setPlayerPayout(sessionId, interaction.user.id, pot);
      await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
      await saveGameResult(sessionId, { result: 'timeout_cashout', rounds: round, payout: pot, bet });
      await interaction.editReply({
        embeds: [successEmbed(`⏰ Time's up — auto cashed out **${pot}** PULSE after ${round} correct guess${round === 1 ? '' : 'es'}.`)],
        components: [],
      }).catch(() => {});
    } else {
      await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
      await saveGameResult(sessionId, { result: 'timeout_loss', rounds: 0, bet });
      await interaction.editReply({
        embeds: [errorEmbed(`⏰ Time's up! You didn't guess. You lost **${bet}** PULSE.`).setTitle('🎴 Higher or Lower')],
        components: [],
      }).catch(() => {});
    }
  });
}
