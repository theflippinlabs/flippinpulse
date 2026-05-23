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

interface SlotsConfig {
  min_bet: number;
  max_bet: number;
  symbols: string[];
  weights: number[];
  payouts: {
    three_seven: number;
    three_diamond: number;
    three_star: number;
    three_other: number;
    two_match: number;
  };
}

const DEFAULT_CONFIG: SlotsConfig = {
  min_bet: 5,
  max_bet: 500,
  symbols: ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'],
  weights: [30, 25, 20, 15, 6, 3, 1],
  payouts: { three_seven: 50, three_diamond: 20, three_star: 10, three_other: 5, two_match: 1 },
};

function spinReel(symbols: string[], weights: number[]): string {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < symbols.length; i++) {
    r -= weights[i];
    if (r <= 0) return symbols[i];
  }
  return symbols[symbols.length - 1];
}

function computeMultiplier(reels: string[], cfg: SlotsConfig): number {
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    if (reels[0] === '7️⃣') return cfg.payouts.three_seven;
    if (reels[0] === '💎') return cfg.payouts.three_diamond;
    if (reels[0] === '⭐') return cfg.payouts.three_star;
    return cfg.payouts.three_other;
  }
  if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    return cfg.payouts.two_match;
  }
  return 0;
}

export const data = new SlashCommandBuilder()
  .setName('slots')
  .setDescription('Spin the slot machine!')
  .addIntegerOption(o =>
    o.setName('bet').setDescription('PULSE to bet').setRequired(true).setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isGameEnabled('slots')) {
    await interaction.reply({ embeds: [errorEmbed('Slots is currently disabled.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const raw = getGameConfig('slots')?.config_json as Partial<SlotsConfig> | undefined;
  const cfg: SlotsConfig = { ...DEFAULT_CONFIG, ...(raw ?? {}) };

  const bet = interaction.options.getInteger('bet', true);
  if (bet < cfg.min_bet || bet > cfg.max_bet) {
    await interaction.reply({ embeds: [errorEmbed(`Bet must be between ${cfg.min_bet} and ${cfg.max_bet} PULSE.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  const bal = await getBalance(interaction.user.id);
  if (!bal || bal.balance < bet) {
    await interaction.reply({ embeds: [errorEmbed(`Insufficient PULSE. You have ${bal?.balance ?? 0}.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  const spend = await spendPulse(interaction.user.id, bet, 'slots_bet');
  if (!spend.success) {
    await interaction.reply({ embeds: [errorEmbed(spend.error ?? 'Failed to place bet.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const sessionId = await createGameSession('slots', interaction.channelId, { bet });
  if (sessionId) await addGamePlayer(sessionId, interaction.user.id, bet);

  const reels = ['🎰', '🎰', '🎰'];

  await interaction.reply({
    embeds: [pulseEmbed('🎰 Slots').setDescription(`**Bet:** ${bet} PULSE\n\n[ ${reels.join(' | ')} ]\n\nSpinning…`)],
  });

  const final = [
    spinReel(cfg.symbols, cfg.weights),
    spinReel(cfg.symbols, cfg.weights),
    spinReel(cfg.symbols, cfg.weights),
  ];

  for (let step = 0; step < 3; step++) {
    await new Promise(r => setTimeout(r, 700));
    reels[step] = final[step];
    await interaction.editReply({
      embeds: [pulseEmbed('🎰 Slots').setDescription(`**Bet:** ${bet} PULSE\n\n[ ${reels.join(' | ')} ]`)],
    });
  }

  const multiplier = computeMultiplier(final, cfg);
  const payout = bet * multiplier;

  if (payout > 0) {
    await earnPulse(interaction.user.id, payout, `slots_win_${multiplier}x`, sessionId ?? undefined);
    if (sessionId) await setPlayerPayout(sessionId, interaction.user.id, payout);
  }
  if (sessionId) {
    await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
    await saveGameResult(sessionId, { reels: final, multiplier, payout });
  }

  const result = payout > 0
    ? successEmbed(`[ ${final.join(' | ')} ]\n\n🎉 **${multiplier}x** payout! You win **${payout}** PULSE.`).setTitle('🎰 Slots')
    : errorEmbed(`[ ${final.join(' | ')} ]\n\nNo match. You lose **${bet}** PULSE.`).setTitle('🎰 Slots');

  await interaction.editReply({ embeds: [result] });
}
