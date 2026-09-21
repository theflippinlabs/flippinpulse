import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('duel')
  .setDescription('Challenge another player to a PULSE duel!')
  .addUserOption(opt =>
    opt.setName('opponent')
      .setDescription('Who to duel')
      .setRequired(true)
  )
  .addIntegerOption(opt =>
    opt.setName('bet')
      .setDescription('PULSE to wager')
      .setRequired(true)
      .setMinValue(1)
  )
  .addStringOption(opt =>
    opt.setName('mode')
      .setDescription('Game mode')
      .setRequired(false)
      .addChoices(
        { name: 'Coin Flip', value: 'coinflip' },
        { name: 'Dice Roll', value: 'dice' },
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!isGameEnabled('duel')) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Duel is currently disabled.' : 'Le duel est désactivé pour l\'instant.')], ephemeral: true });
    return;
  }

  const cfg = getGameConfig('duel');
  const conf = (cfg?.config_json ?? {}) as {
    min_bet: number; max_bet: number; fee_percent: number; timeout_seconds: number;
  };
  const minBet = conf.min_bet ?? 10;
  const maxBet = conf.max_bet ?? 500;
  const feePercent = conf.fee_percent ?? 5;
  const timeout = (conf.timeout_seconds ?? 60) * 1000;

  const opponent = interaction.options.getUser('opponent', true);
  const bet = interaction.options.getInteger('bet', true);
  const mode = interaction.options.getString('mode') ?? 'coinflip';

  if (opponent.id === interaction.user.id) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'You cannot duel yourself.' : 'Tu ne peux pas te duel toi-même.')], ephemeral: true });
    return;
  }
  if (opponent.bot) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'You cannot duel a bot.' : 'Tu ne peux pas duel un bot.')], ephemeral: true });
    return;
  }
  if (bet < minBet || bet > maxBet) {
    await interaction.reply({ embeds: [errorEmbed(en
      ? `Bet must be between ${minBet} and ${maxBet} PULSE.`
      : `La mise doit être entre ${minBet} et ${maxBet} PULSE.`)], ephemeral: true });
    return;
  }

  const challengerBal = await getBalance(interaction.user.id);
  if (!challengerBal || challengerBal.balance < bet) {
    await interaction.reply({ embeds: [errorEmbed(en
      ? `You don't have enough PULSE. Balance: ${challengerBal?.balance ?? 0}`
      : `Tu n'as pas assez de PULSE. Solde : ${challengerBal?.balance ?? 0}`)], ephemeral: true });
    return;
  }

  const sessionId = await createGameSession('duel', interaction.channelId, {
    challenger: interaction.user.id,
    opponent: opponent.id,
    bet,
    mode,
  });

  if (!sessionId) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Failed to create duel.' : 'Impossible de créer le duel.')], ephemeral: true });
    return;
  }

  const acceptBtn = new ButtonBuilder()
    .setCustomId(`duel_accept_${sessionId}`)
    .setLabel(en ? '⚔️ Accept Duel' : '⚔️ Accepter')
    .setStyle(ButtonStyle.Success);

  const declineBtn = new ButtonBuilder()
    .setCustomId(`duel_decline_${sessionId}`)
    .setLabel(en ? '❌ Decline' : '❌ Refuser')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, declineBtn);

  const modeLabel = mode === 'dice'
    ? (en ? '🎲 Dice Roll' : '🎲 Lancer de dé')
    : (en ? '🪙 Coin Flip' : '🪙 Pile ou Face');
  const embed = pulseEmbed(en ? '⚔️ Duel Challenge!' : '⚔️ Défi en duel !')
    .setDescription(en
      ? `**${interaction.user}** challenges **${opponent}** to a duel!\n\n💰 Wager: **${bet}** PULSE\n🎮 Mode: **${modeLabel}**\n\n${opponent}, do you accept?`
      : `**${interaction.user}** défie **${opponent}** en duel !\n\n💰 Mise : **${bet}** PULSE\n🎮 Mode : **${modeLabel}**\n\n${opponent}, tu acceptes ?`);

  const reply = await interaction.reply({ content: `${opponent}`, embeds: [embed], components: [row], fetchReply: true }) as Message;

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: timeout,
    filter: (i) => i.user.id === opponent.id,
  });

  collector.on('collect', async (btnInteraction) => {
    if (btnInteraction.customId === `duel_decline_${sessionId}`) {
      collector.stop('declined');
      await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
      const declineEmbed = errorEmbed(en
        ? `${opponent.username} declined the duel.`
        : `${opponent.username} a refusé le duel.`).setTitle('⚔️ Duel');
      await btnInteraction.update({ embeds: [declineEmbed], components: [] });
      return;
    }

    if (btnInteraction.customId === `duel_accept_${sessionId}`) {
      collector.stop('accepted');

      const oppBal = await getBalance(opponent.id);
      if (!oppBal || oppBal.balance < bet) {
        await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
        const noFunds = errorEmbed(en
          ? `${opponent.username} doesn't have enough PULSE.`
          : `${opponent.username} n'a pas assez de PULSE.`).setTitle('⚔️ Duel');
        await btnInteraction.update({ embeds: [noFunds], components: [] });
        return;
      }

      const s1 = await spendPulse(interaction.user.id, bet, 'duel_bet', sessionId);
      const s2 = await spendPulse(opponent.id, bet, 'duel_bet', sessionId);
      if (!s1.success || !s2.success) {
        if (s1.success) await earnPulse(interaction.user.id, bet, 'duel_refund', sessionId);
        if (s2.success) await earnPulse(opponent.id, bet, 'duel_refund', sessionId);
        await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
        await btnInteraction.update({ embeds: [errorEmbed(en ? 'Failed to deduct bets. Duel cancelled.' : 'Impossible de débiter les mises. Duel annulé.')], components: [] });
        return;
      }

      await addGamePlayer(sessionId, interaction.user.id, bet);
      await addGamePlayer(sessionId, opponent.id, bet);

      let winnerId: string;
      let resultText: string;

      if (mode === 'dice') {
        const roll1 = Math.floor(Math.random() * 6) + 1;
        const roll2 = Math.floor(Math.random() * 6) + 1;
        resultText = `🎲 ${interaction.user.username}: **${roll1}** vs ${opponent.username}: **${roll2}**`;
        winnerId = roll1 >= roll2 ? interaction.user.id : opponent.id;
        if (roll1 === roll2) winnerId = Math.random() > 0.5 ? interaction.user.id : opponent.id;
      } else {
        const flip = Math.random() > 0.5;
        const side = en ? (flip ? 'Heads' : 'Tails') : (flip ? 'Face' : 'Pile');
        winnerId = flip ? interaction.user.id : opponent.id;
        resultText = en ? `🪙 The coin landed on **${side}**!` : `🪙 La pièce est tombée sur **${side}** !`;
      }

      const totalPot = bet * 2;
      const fee = Math.floor(totalPot * feePercent / 100);
      const payout = totalPot - fee;

      await earnPulse(winnerId, payout, `duel_win`, sessionId);
      await setPlayerPayout(sessionId, winnerId, payout);
      await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
      await saveGameResult(sessionId, { winnerId, mode, payout });

      const winnerName = winnerId === interaction.user.id ? interaction.user.username : opponent.username;
      const resultEmbed = successEmbed(en
        ? `${resultText}\n\n🏆 **${winnerName}** wins **${payout}** PULSE! (${feePercent}% fee)`
        : `${resultText}\n\n🏆 **${winnerName}** gagne **${payout}** PULSE ! (frais ${feePercent}%)`
      ).setTitle(en ? '⚔️ Duel Result' : '⚔️ Résultat du duel');

      await btnInteraction.update({ embeds: [resultEmbed], components: [] });
    }
  });

  collector.on('end', (_collected, reason) => {
    if (reason === 'time') {
      updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
      const timeoutEmbed = errorEmbed(en
        ? `${opponent.username} didn't respond in time. Duel cancelled.`
        : `${opponent.username} n'a pas répondu à temps. Duel annulé.`).setTitle('⚔️ Duel');
      interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
    }
  });
}
