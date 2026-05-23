import {
  ChatInputCommandInteraction,
  EmbedBuilder,
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
import { errorEmbed } from '../utils/embeds.js';

interface WheelOutcome {
  label: string;
  multiplier: number;
  weight: number;
  color: string;
}

interface WheelConfig {
  min_bet: number;
  max_bet: number;
  outcomes: WheelOutcome[];
}

const DEFAULT_CONFIG: WheelConfig = {
  min_bet: 10,
  max_bet: 300,
  outcomes: [
    { label: '💸 Bust', multiplier: 0, weight: 35, color: '#6B7280' },
    { label: '🪙 Common', multiplier: 1, weight: 30, color: '#9CA3AF' },
    { label: '🥉 Uncommon', multiplier: 2, weight: 20, color: '#22C55E' },
    { label: '🥈 Rare', multiplier: 3, weight: 10, color: '#3B82F6' },
    { label: '🥇 Epic', multiplier: 5, weight: 4, color: '#A855F7' },
    { label: '💎 Legendary', multiplier: 25, weight: 1, color: '#F59E0B' },
  ],
};

function pickOutcome(outcomes: WheelOutcome[]): WheelOutcome {
  const total = outcomes.reduce((a, b) => a + b.weight, 0);
  let r = Math.random() * total;
  for (const o of outcomes) {
    r -= o.weight;
    if (r <= 0) return o;
  }
  return outcomes[outcomes.length - 1];
}

function parseHex(input: string): number {
  const num = parseInt(input.replace('#', ''), 16);
  return Number.isFinite(num) ? num : 0x38BDF8;
}

export const data = new SlashCommandBuilder()
  .setName('wheel')
  .setDescription('Spin the gacha wheel — chance at huge multipliers!')
  .addIntegerOption(o =>
    o.setName('bet').setDescription('PULSE to bet').setRequired(true).setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isGameEnabled('wheel')) {
    await interaction.reply({ embeds: [errorEmbed('Wheel is currently disabled.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const raw = getGameConfig('wheel')?.config_json as Partial<WheelConfig> | undefined;
  const cfg: WheelConfig = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
  if (!cfg.outcomes?.length) cfg.outcomes = DEFAULT_CONFIG.outcomes;

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

  const spend = await spendPulse(interaction.user.id, bet, 'wheel_bet');
  if (!spend.success) {
    await interaction.reply({ embeds: [errorEmbed(spend.error ?? 'Failed to place bet.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const sessionId = await createGameSession('wheel', interaction.channelId, { bet });
  if (sessionId) await addGamePlayer(sessionId, interaction.user.id, bet);

  const outcome = pickOutcome(cfg.outcomes);
  const payout = bet * outcome.multiplier;

  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x6366F1).setTitle('🎡 Wheel of PULSE').setDescription(`**Bet:** ${bet} PULSE\n\n*Spinning…*`)],
  });

  await new Promise(r => setTimeout(r, 1500));

  if (payout > 0) {
    await earnPulse(interaction.user.id, payout, `wheel_${outcome.multiplier}x`, sessionId ?? undefined);
    if (sessionId) await setPlayerPayout(sessionId, interaction.user.id, payout);
  }
  if (sessionId) {
    await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
    await saveGameResult(sessionId, { outcome: outcome.label, multiplier: outcome.multiplier, payout });
  }

  const result = new EmbedBuilder()
    .setColor(parseHex(outcome.color))
    .setTitle('🎡 Wheel of PULSE')
    .setDescription([
      `**Bet:** ${bet} PULSE`,
      `**Result:** ${outcome.label} (${outcome.multiplier}x)`,
      payout > 0
        ? `🎉 You win **${payout}** PULSE!`
        : `💸 You lose **${bet}** PULSE.`,
    ].join('\n'))
    .setTimestamp();

  await interaction.editReply({ embeds: [result] });
}
