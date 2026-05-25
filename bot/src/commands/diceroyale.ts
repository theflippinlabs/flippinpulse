import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import {
  getGameConfig,
  isGameEnabled,
  earnPulse,
  setPlayerPayout,
  updateGameSession,
  saveGameResult,
} from '../services/games.js';
import { runLobby, delay, type LobbyPlayer } from '../services/lobby.js';
import { pulseEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';

const DICE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const d6 = () => Math.floor(Math.random() * 6) + 1;

export const data = new SlashCommandBuilder()
  .setName('diceroyale')
  .setDescription('Dice Royale — everyone rolls, highest total wins the pot!')
  .addIntegerOption(o => o.setName('bet').setDescription('PULSE entry fee (optional)').setMinValue(0).setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isGameEnabled('dice_royale')) {
    await interaction.reply({ embeds: [errorEmbed('Dice Royale is currently disabled.')], ephemeral: true });
    return;
  }

  const conf = (getGameConfig('dice_royale')?.config_json ?? {}) as {
    min_bet: number; max_bet: number; fixed_reward: number; min_players: number;
  };
  const minBet = conf.min_bet ?? 0;
  const maxBet = conf.max_bet ?? 1000;
  const fixedReward = conf.fixed_reward ?? 50;

  const bet = interaction.options.getInteger('bet') ?? 0;
  if (bet > maxBet || (bet > 0 && bet < minBet)) {
    await interaction.reply({ embeds: [errorEmbed(`Bet must be ${minBet}–${maxBet} PULSE (or 0 for free).`)], ephemeral: true });
    return;
  }

  const lobby = await runLobby({
    interaction,
    gameKey: 'dice_royale',
    title: '🎲 Dice Royale',
    bet,
    minPlayers: conf.min_players ?? 2,
    betReason: 'diceroyale_bet',
    refundReason: 'diceroyale_refund',
  });
  if (!lobby) return;

  const rollOnce = (group: LobbyPlayer[]) =>
    group.map(p => {
      const a = d6(), b = d6();
      return { ...p, a, b, total: a + b };
    });

  const allLines: string[] = [];
  let contenders: LobbyPlayer[] = lobby.players;
  let round = 0;

  // Roll; tied leaders re-roll until a single winner remains.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    round++;
    await delay(1500);
    const rolls = rollOnce(contenders);
    const max = Math.max(...rolls.map(r => r.total));
    const header = round === 1 ? '🎲 **Rolls:**' : `🎲 **Tie-break round ${round}:**`;
    allLines.push(
      `${header}\n` +
      rolls.map(r => `${DICE[r.a]}${DICE[r.b]} **${r.name}** — ${r.total}`).join('\n')
    );
    await interaction.editReply({
      embeds: [pulseEmbed('🎲 Dice Royale').setDescription(allLines.slice(-3).join('\n\n'))],
      components: [],
    }).catch(() => {});

    const leaders = rolls.filter(r => r.total === max);
    if (leaders.length === 1) {
      contenders = [{ id: leaders[0].id, name: leaders[0].name }];
      break;
    }
    contenders = leaders.map(r => ({ id: r.id, name: r.name }));
  }

  const winner = contenders[0];
  const payout = lobby.pot > 0 ? lobby.pot : fixedReward;

  await earnPulse(winner.id, payout, 'diceroyale_win', lobby.sessionId);
  await setPlayerPayout(lobby.sessionId, winner.id, payout);
  await updateGameSession(lobby.sessionId, { status: 'completed', ended_at: new Date().toISOString() });
  await saveGameResult(lobby.sessionId, { winner: winner.id, players: lobby.players.length, payout });

  await delay(1200);
  await interaction.editReply({
    embeds: [successEmbed(
      `${allLines.slice(-2).join('\n\n')}\n\n🏆 **${winner.name}** rolls highest and wins **${payout}** PULSE!`
    ).setTitle('🎲 Dice Royale — Winner')],
    components: [],
  }).catch(() => {});
}
