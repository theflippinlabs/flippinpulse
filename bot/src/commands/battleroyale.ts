import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import {
  getGameConfig,
  isGameEnabled,
  earnPulse,
  setPlayerPayout,
  updateGameSession,
  saveGameResult,
} from '../services/games.js';
import { createLobby, registerLobbyResolver, delay, type LobbyPlayer } from '../services/lobby.js';
import { pulseEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';

const DEATHS = [
  '{victim} tripped over their own feet and fell off the map. 💀',
  '{victim} opened a suspicious loot box… it exploded. 💥',
  '{victim} got sniped from across the server. 🎯',
  '{victim} ran out of ammo at the worst possible moment. 🔫',
  '{victim} was betrayed by their own teammate. 🗡️',
  '{victim} stepped on a landmine. 💣',
  '{victim} got swallowed by the storm. 🌪️',
  '{victim} took an arrow to the knee. 🏹',
  '{victim} rage-quit after some brutal lag. 📵',
  '{victim} got cornered and taken out. ⚰️',
  '{victim} slipped on a banana peel. 🍌',
  '{victim} disconnected… permanently. 🔌',
];

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

registerLobbyResolver('battle_royale', async ({ message, sessionId, players, pot }) => {
  const fixedReward = (getGameConfig('battle_royale')?.config_json?.fixed_reward as number) ?? 50;

  const alive: LobbyPlayer[] = shuffle(players);
  const feed: string[] = [`⚔️ **${alive.length} fighters** enter the arena!`];

  const render = () => pulseEmbed('⚔️ Battle Royale').setDescription(
    feed.slice(-9).join('\n') +
    `\n\n**Still alive (${alive.length}):** ${alive.map(p => p.name).join(', ')}`
  );

  await message.edit({ embeds: [render()], components: [] }).catch(() => {});

  while (alive.length > 1) {
    await delay(2500);
    const victim = alive.splice(Math.floor(Math.random() * alive.length), 1)[0];
    feed.push(DEATHS[Math.floor(Math.random() * DEATHS.length)].replace('{victim}', `**${victim.name}**`));
    await message.edit({ embeds: [render()], components: [] }).catch(() => {});
  }

  const winner = alive[0];
  const payout = pot > 0 ? pot : fixedReward;

  await earnPulse(winner.id, payout, 'battleroyale_win', sessionId);
  await setPlayerPayout(sessionId, winner.id, payout);
  await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
  await saveGameResult(sessionId, { winner: winner.id, players: players.length, payout });

  await message.edit({
    embeds: [successEmbed(
      `${feed.slice(-6).join('\n')}\n\n🏆 **${winner.name}** is the last one standing and wins **${payout}** PULSE!`
    ).setTitle('⚔️ Battle Royale — Winner')],
    components: [],
  }).catch(() => {});
});

export const data = new SlashCommandBuilder()
  .setName('battleroyale')
  .setDescription('Battle Royale — last one standing wins the whole pot!')
  .addIntegerOption(o => o.setName('bet').setDescription('PULSE entry fee (optional)').setMinValue(0).setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isGameEnabled('battle_royale')) {
    await interaction.reply({ embeds: [errorEmbed('Battle Royale is currently disabled.')], ephemeral: true });
    return;
  }

  const conf = (getGameConfig('battle_royale')?.config_json ?? {}) as {
    min_bet: number; max_bet: number; min_players: number;
  };
  const minBet = conf.min_bet ?? 0;
  const maxBet = conf.max_bet ?? 1000;

  const bet = interaction.options.getInteger('bet') ?? 0;
  if (bet > maxBet || (bet > 0 && bet < minBet)) {
    await interaction.reply({ embeds: [errorEmbed(`Bet must be ${minBet}–${maxBet} PULSE (or 0 for free).`)], ephemeral: true });
    return;
  }

  await createLobby({
    interaction,
    gameKey: 'battle_royale',
    title: '⚔️ Battle Royale',
    bet,
    minPlayers: conf.min_players ?? 2,
    betReason: 'battleroyale_bet',
    refundReason: 'battleroyale_refund',
  });
}
