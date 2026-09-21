import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  Message,
  ModalSubmitInteraction,
  ButtonInteraction,
} from 'discord.js';
import { supabase } from '../supabase.js';
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
import { log } from '../utils/logger.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('crash')
  .setDescription('Play Crash — cash out before the multiplier crashes!')
  .addIntegerOption(opt =>
    opt.setName('bet')
      .setDescription('Amount of PULSE to bet')
      .setRequired(true)
      .setMinValue(1)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const bet = interaction.options.getInteger('bet', true);
  await runCrash(interaction, bet);
}

export async function runCrash(interaction: ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction, bet: number): Promise<void> {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!isGameEnabled('crash')) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Crash is currently disabled.' : 'Crash est désactivé pour l\'instant.')], ephemeral: true });
    return;
  }

  const cfg = getGameConfig('crash');
  const conf = (cfg?.config_json ?? {}) as {
    min_bet: number; max_bet: number; fee_percent: number;
    cooldown_seconds: number; crash_min: number; crash_max: number;
  };
  const minBet = conf.min_bet ?? 10;
  const maxBet = conf.max_bet ?? 1000;
  const crashMin = conf.crash_min ?? 1.0;
  const crashMax = conf.crash_max ?? 10.0;
  const feePercent = conf.fee_percent ?? 5;

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

  const spend = await spendPulse(interaction.user.id, bet, 'crash_bet');
  if (!spend.success) {
    await interaction.reply({ embeds: [errorEmbed(spend.error ?? (en ? 'Failed to place bet.' : 'Échec de la mise.'))], ephemeral: true });
    return;
  }

  const crashPoint = Math.round((crashMin + Math.random() * Math.random() * (crashMax - crashMin)) * 100) / 100;

  const sessionId = await createGameSession('crash', interaction.channelId ?? '', { crashPoint, bet });
  if (!sessionId) {
    await earnPulse(interaction.user.id, bet, 'crash_refund');
    await interaction.reply({ embeds: [errorEmbed(en ? 'Failed to start game. Bet refunded.' : 'Impossible de démarrer. Mise remboursée.')], ephemeral: true });
    return;
  }
  await addGamePlayer(sessionId, interaction.user.id, bet);

  // Start the game
  let multiplier = 1.0;
  let crashed = false;
  let cashedOut = false;

  const cashLbl = en ? 'Cash Out' : 'Encaisser';
  const betLbl = en ? 'Bet' : 'Mise';
  const multiLbl = en ? 'Multiplier' : 'Multiplicateur';
  const potWinLbl = en ? 'Potential win' : 'Gain potentiel';
  const footerText = en ? 'Click Cash Out before it crashes!' : 'Encaisse avant que ça crash !';

  const cashoutBtn = new ButtonBuilder()
    .setCustomId(`crash_cashout_${sessionId}`)
    .setLabel(`💰 ${cashLbl} (${multiplier.toFixed(2)}x)`)
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(cashoutBtn);

  const embed = pulseEmbed('🚀 Crash')
    .setDescription(`**${betLbl}:** ${bet} PULSE\n\n📈 ${multiLbl}: **${multiplier.toFixed(2)}x**\n💰 ${potWinLbl}: **${Math.floor(bet * multiplier)}** PULSE`)
    .setFooter({ text: footerText });

  const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true }) as Message;

  // Collector for cash out button
  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
    filter: (i) => i.user.id === interaction.user.id,
  });

  collector.on('collect', async (btnInteraction) => {
    if (btnInteraction.customId === `crash_cashout_${sessionId}` && !crashed && !cashedOut) {
      cashedOut = true;
      collector.stop('cashout');

      const winnings = Math.floor(bet * multiplier);
      const fee = Math.floor(winnings * feePercent / 100);
      const payout = winnings - fee;

      await earnPulse(interaction.user.id, payout, `crash_win_${multiplier.toFixed(2)}x`, sessionId);
      await setPlayerPayout(sessionId, interaction.user.id, payout);
      await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
      await saveGameResult(sessionId, { crashPoint, cashedOutAt: multiplier, payout });

      const winEmbed = successEmbed(en
        ? `🎉 You cashed out at **${multiplier.toFixed(2)}x**!\n\n💰 Payout: **${payout}** PULSE (${feePercent}% fee)\n📈 Crash point was: **${crashPoint.toFixed(2)}x**`
        : `🎉 Encaissé à **${multiplier.toFixed(2)}x** !\n\n💰 Gain : **${payout}** PULSE (frais ${feePercent}%)\n📈 Le crash était à : **${crashPoint.toFixed(2)}x**`);
      await btnInteraction.update({ embeds: [winEmbed], components: [buildPostGameRow('crash', bet)] });
    }
  });

  // Increment multiplier
  const interval = setInterval(async () => {
    if (cashedOut) {
      clearInterval(interval);
      return;
    }

    multiplier = Math.round((multiplier + 0.1 + Math.random() * 0.15) * 100) / 100;

    if (multiplier >= crashPoint) {
      crashed = true;
      clearInterval(interval);
      collector.stop('crashed');

      await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
      await saveGameResult(sessionId, { crashPoint, cashedOutAt: null, payout: 0 });

      const loseEmbed = errorEmbed(en
        ? `💥 CRASHED at **${crashPoint.toFixed(2)}x**!\n\nYou lost **${bet}** PULSE.`
        : `💥 CRASH à **${crashPoint.toFixed(2)}x** !\n\nTu perds **${bet}** PULSE.`)
        .setTitle('🚀 Crash');
      await interaction.editReply({ embeds: [loseEmbed], components: [buildPostGameRow('crash', bet)] }).catch(() => {});
      return;
    }

    cashoutBtn.setLabel(`💰 ${cashLbl} (${multiplier.toFixed(2)}x)`);
    const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(cashoutBtn);
    const updatedEmbed = pulseEmbed('🚀 Crash')
      .setDescription(`**${betLbl}:** ${bet} PULSE\n\n📈 ${multiLbl}: **${multiplier.toFixed(2)}x**\n💰 ${potWinLbl}: **${Math.floor(bet * multiplier)}** PULSE`)
      .setFooter({ text: footerText });

    await interaction.editReply({ embeds: [updatedEmbed], components: [newRow] }).catch(() => {});
  }, 1500);

  collector.on('end', (_collected, reason) => {
    clearInterval(interval);
    if (reason === 'time' && !cashedOut && !crashed) {
      // Timed out without cashing out
      updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
      saveGameResult(sessionId, { crashPoint, cashedOutAt: null, payout: 0, reason: 'timeout' });
      const timeoutEmbed = errorEmbed(en
        ? `⏰ Time's up! You didn't cash out.\n\nYou lost **${bet}** PULSE.`
        : `⏰ Temps écoulé ! Tu n'as pas encaissé.\n\nTu perds **${bet}** PULSE.`).setTitle('🚀 Crash');
      interaction.editReply({ embeds: [timeoutEmbed], components: [buildPostGameRow('crash', bet)] }).catch(() => {});
    }
  });
}
