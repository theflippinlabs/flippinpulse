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
  '{victim} stepped on a landmine while moonwalking. 💣',
  '{victim} got swallowed by the storm. 🌪️',
  '{victim} took an arrow to the knee. 🏹',
  '{victim} rage-quit after some brutal lag. 📵',
  '{victim} got cornered and taken out. ⚰️',
  '{victim} slipped on a banana peel left by {killer}. 🍌',
  '{victim} disconnected… permanently. 🔌',
  '{victim} tried to pet a wild boar. The boar disagreed. 🐗',
  '{victim} hid in a bush for 20 minutes, then sneezed. 🤧',
  '{victim} brought a spoon to a gunfight. 🥄',
  '{victim} was looting when {killer} said “behind you 👀”.',
  '{victim} got third-partied by {killer} mid-celebration. 🎉',
  '{victim} fell out of the supply plane and forgot the parachute. 🪂',
  '{victim} drank the wrong potion and turned into a chicken. 🐔',
  '{victim} got out-jumped, out-played, and out-emoted by {killer}. 🕺',
  '{victim} stood still to read the patch notes. Big mistake. 📜',
  '{victim} mistook a grenade for a snack. 🍎',
  '{victim} ran the wrong way into the circle. 🧭',
  '{victim} was sent back to the lobby by {killer}, no refunds. 🎟️',
];

// Atmosphere lines that fire between eliminations — no one dies, just vibes.
const FLAVOR = [
  '🌫️ The storm tightens. Nowhere left to hide…',
  '📦 A legendary supply drop lands. Everyone freezes, then sprints.',
  '🔊 Distant gunfire echoes across the arena.',
  '🌙 Night falls. Somewhere, someone is definitely panicking.',
  '🐍 A snake slithers through the grass. Tensions rise.',
  '💨 The wind howls. {a} and {b} circle each other warily.',
  '🩹 {a} patches up behind a rock, hands shaking.',
  '⚡ A thunderclap. {a} nearly has a heart attack.',
  '🍗 Someone is calmly grilling chicken in the middle of the warzone.',
  '👀 {a} swears they saw movement. It was just a bush.',
];

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

registerLobbyResolver('battle_royale', async ({ message, sessionId, players, pot }) => {
  const fixedReward = (getGameConfig('battle_royale')?.config_json?.fixed_reward as number) ?? 50;

  const alive: LobbyPlayer[] = shuffle(players);
  const total = alive.length;
  const channel = message.channel;

  // Pacing: keep the whole match in a comfortable window even with many players.
  const elimDelay = total > 12 ? 1700 : total > 7 ? 2400 : 3200;

  const send = (text: string) =>
    channel.isSendable()
      ? channel.send({ embeds: [pulseEmbed('⚔️ Battle Royale').setDescription(text)] }).catch(() => null)
      : Promise.resolve(null);

  // Opening message replaces the lobby card.
  await message.edit({
    embeds: [pulseEmbed('⚔️ Battle Royale — FIGHT!').setDescription(
      `The dropship doors open… **${total} fighters** parachute into the arena!\n\n` +
      `${alive.map(p => `• ${p.name}`).join('\n')}\n\n` +
      `${pot > 0 ? `💰 Winner takes the **${pot} PULSE** pot.` : `💰 Winner takes **${fixedReward} PULSE**.`}\n` +
      `Let the chaos begin… 🪂`
    )],
    components: [],
  }).catch(() => {});

  await delay(2200);

  while (alive.length > 1) {
    // Occasional atmosphere beat (not when we're down to the final 2).
    if (alive.length > 2 && Math.random() < 0.33) {
      const two = shuffle(alive).slice(0, 2);
      await send(pick(FLAVOR)
        .replace('{a}', `**${two[0]?.name ?? 'Someone'}**`)
        .replace('{b}', `**${two[1]?.name ?? 'someone'}**`));
      await delay(elimDelay);
    }

    const victim = alive.splice(Math.floor(Math.random() * alive.length), 1)[0];
    const killer = alive.length ? pick(alive) : victim;
    const line = pick(DEATHS)
      .replace('{victim}', `**${victim.name}**`)
      .replace('{killer}', `**${killer.name}**`);

    const tail = alive.length === 1
      ? ''
      : alive.length <= 3
        ? `\n\n🔥 **Final ${alive.length}:** ${alive.map(p => p.name).join(' vs ')}`
        : `\n\n*${alive.length} fighters remain.*`;

    await send(`☠️ ${line}${tail}`);
    await delay(elimDelay);
  }

  const winner = alive[0];
  const payout = pot > 0 ? pot : fixedReward;

  await earnPulse(winner.id, payout, 'battleroyale_win', sessionId);
  await setPlayerPayout(sessionId, winner.id, payout);
  await updateGameSession(sessionId, { status: 'completed', ended_at: new Date().toISOString() });
  await saveGameResult(sessionId, { winner: winner.id, players: players.length, payout });

  if (channel.isSendable()) {
    await channel.send({
      embeds: [successEmbed(
        `The dust settles over ${total} fallen fighters…\n\n` +
        `🏆 **${winner.name}** is the **last one standing** and walks away with **${payout}** PULSE! 🎉\n\n` +
        `*GG everyone — run it back?*`
      ).setTitle('⚔️ Battle Royale — Victory Royale')],
    }).catch(() => {});
  }
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
