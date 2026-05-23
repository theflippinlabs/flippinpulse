import {
  ChatInputCommandInteraction,
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

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

type BetType = 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | 'number';

interface RouletteConfig {
  min_bet: number;
  max_bet: number;
  even_money_payout: number;
  single_number_payout: number;
}

const DEFAULT_CONFIG: RouletteConfig = {
  min_bet: 5,
  max_bet: 500,
  even_money_payout: 2,
  single_number_payout: 36,
};

function colorOf(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

function checkWin(betType: BetType, betNumber: number | null, spin: number): boolean {
  if (spin === 0 && betType !== 'number') return false;
  switch (betType) {
    case 'red': return colorOf(spin) === 'red';
    case 'black': return colorOf(spin) === 'black';
    case 'even': return spin % 2 === 0;
    case 'odd': return spin % 2 === 1;
    case 'low': return spin >= 1 && spin <= 18;
    case 'high': return spin >= 19 && spin <= 36;
    case 'number': return betNumber !== null && spin === betNumber;
  }
}

export const data = new SlashCommandBuilder()
  .setName('roulette')
  .setDescription('Play European roulette')
  .addIntegerOption(o => o.setName('bet').setDescription('PULSE to bet').setRequired(true).setMinValue(1))
  .addStringOption(o =>
    o.setName('type').setDescription('Bet type').setRequired(true).addChoices(
      { name: 'Red', value: 'red' },
      { name: 'Black', value: 'black' },
      { name: 'Even', value: 'even' },
      { name: 'Odd', value: 'odd' },
      { name: 'Low (1-18)', value: 'low' },
      { name: 'High (19-36)', value: 'high' },
      { name: 'Single number (0-36)', value: 'number' },
    ),
  )
  .addIntegerOption(o =>
    o.setName('number').setDescription('Number to bet on (0-36, only for "number" bet)').setMinValue(0).setMaxValue(36).setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isGameEnabled('roulette')) {
    await interaction.reply({ embeds: [errorEmbed('Roulette is currently disabled.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const raw = getGameConfig('roulette')?.config_json as Partial<RouletteConfig> | undefined;
  const cfg: RouletteConfig = { ...DEFAULT_CONFIG, ...(raw ?? {}) };

  const bet = interaction.options.getInteger('bet', true);
  const betType = interaction.options.getString('type', true) as BetType;
  const betNumber = interaction.options.getInteger('number');

  if (bet < cfg.min_bet || bet > cfg.max_bet) {
    await interaction.reply({ embeds: [errorEmbed(`Bet must be between ${cfg.min_bet} and ${cfg.max_bet} PULSE.`)], flags: MessageFlags.Ephemeral });
    return;
  }
  if (betType === 'number' && betNumber === null) {
    await interaction.reply({ embeds: [errorEmbed('Provide a `number` (0-36) when betting on a single number.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const bal = await getBalance(interaction.user.id);
  if (!bal || bal.balance < bet) {
    await interaction.reply({ embeds: [errorEmbed(`Insufficient PULSE. You have ${bal?.balance ?? 0}.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  const spend = await spendPulse(interaction.user.id, bet, 'roulette_bet');
  if (!spend.success) {
    await interaction.reply({ embeds: [errorEmbed(spend.error ?? 'Failed to place bet.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const sessionId = await createGameSession('roulette', interaction.channelId, { bet, betType, betNumber });
  if (sessionId) await addGamePlayer(sessionId, interaction.user.id, bet);

  await interaction.reply({
    embeds: [pulseEmbed('🎡 Roulette').setDescription(`**Bet:** ${bet} PULSE on **${betType}${betType === 'number' ? ` ${betNumber}` : ''}**\n\n*The wheel spins…*`)],
  });

  await new Promise(r => setTimeout(r, 1500));

  const spin = Math.floor(Math.random() * 37);
  const won = checkWin(betType, betNumber, spin);
  const payoutMult = betType === 'number' ? cfg.single_number_payout : cfg.even_money_payout;
  const payout = won ? bet * payoutMult : 0;

  if (payout > 0) {
    await earnPulse(interaction.user.id, payout, `roulette_win_${betType}`, sessionId ?? undefined);
    if (sessionId) await setPlayerPayout(sessionId, interaction.user.id, payout);
  }
  if (sessionId) {
    await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
    await saveGameResult(sessionId, { spin, color: colorOf(spin), betType, betNumber, payout });
  }

  const colorEmoji = colorOf(spin) === 'red' ? '🔴' : colorOf(spin) === 'black' ? '⚫' : '🟢';
  const result = won
    ? successEmbed(`${colorEmoji} **${spin}** (${colorOf(spin)})\n\n🎉 You win **${payout}** PULSE!`).setTitle('🎡 Roulette')
    : errorEmbed(`${colorEmoji} **${spin}** (${colorOf(spin)})\n\nYou lose **${bet}** PULSE.`).setTitle('🎡 Roulette');

  await interaction.editReply({ embeds: [result] });
}
