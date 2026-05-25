import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  Message,
} from 'discord.js';
import { spendPulse, getBalance } from './economy.js';
import { createGameSession, addGamePlayer, updateGameSession, earnPulse } from './games.js';
import { pulseEmbed, errorEmbed } from '../utils/embeds.js';

export interface LobbyPlayer {
  id: string;
  name: string;
}

export interface LobbyOutcome {
  sessionId: string;
  players: LobbyPlayer[];
  bet: number;
  pot: number;
  message: Message;
}

export interface LobbyOptions {
  interaction: ChatInputCommandInteraction;
  gameKey: string;
  title: string;
  bet: number;
  minPlayers: number;
  betReason: string;
  refundReason: string;
}

export const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

/**
 * Runs a shared join lobby: host buys in, others join with the same bet, and
 * only the host can start it (no time limit, no player cap). Returns the final
 * roster (bets already collected into the pot) or null if it was cancelled (in
 * which case bets are refunded and a message is shown).
 */
export async function runLobby(opts: LobbyOptions): Promise<LobbyOutcome | null> {
  const { interaction, gameKey, title, bet, minPlayers } = opts;

  if (bet > 0) {
    const bal = await getBalance(interaction.user.id);
    if (!bal || bal.balance < bet) {
      await interaction.reply({ embeds: [errorEmbed(`Insufficient PULSE. Balance: ${bal?.balance ?? 0}`)], ephemeral: true });
      return null;
    }
  }

  const sessionId = await createGameSession(gameKey, interaction.channelId, { bet });
  if (!sessionId) {
    await interaction.reply({ embeds: [errorEmbed('Failed to create the game.')], ephemeral: true });
    return null;
  }

  if (bet > 0) await spendPulse(interaction.user.id, bet, opts.betReason, sessionId);
  await addGamePlayer(sessionId, interaction.user.id, bet);

  const players = new Map<string, string>([[interaction.user.id, interaction.user.username]]);

  const lobbyEmbed = () => pulseEmbed(`${title} — Lobby`)
    .setDescription(
      `**${interaction.user.username}** is hosting!\n\n` +
      `${bet > 0 ? `💰 Entry: **${bet}** PULSE\n` : '🆓 Free entry\n'}` +
      `👥 Players (${players.size}): ${[...players.values()].join(', ')}\n\n` +
      `Click **Join** to enter. Only the host can **Start** (needs ${minPlayers}+ players). No time limit.`
    );

  const buildRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`lobby_join_${sessionId}`).setLabel(`Join (${players.size})`).setStyle(ButtonStyle.Primary).setEmoji('🙋'),
    new ButtonBuilder().setCustomId(`lobby_start_${sessionId}`).setLabel('Start').setStyle(ButtonStyle.Success).setEmoji('▶️'),
  );

  const reply = await interaction.reply({ embeds: [lobbyEmbed()], components: [buildRow()], fetchReply: true }) as Message;

  // No `time` => the lobby waits indefinitely until the host starts it.
  const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button });
  let started = false;

  await new Promise<void>((resolve) => {
    collector.on('collect', async (btn) => {
      if (started) { await btn.deferUpdate().catch(() => {}); return; }

      if (btn.customId === `lobby_join_${sessionId}`) {
        if (players.has(btn.user.id)) { await btn.reply({ content: 'You already joined!', ephemeral: true }); return; }
        if (bet > 0) {
          const bal = await getBalance(btn.user.id);
          if (!bal || bal.balance < bet) { await btn.reply({ embeds: [errorEmbed(`You need ${bet} PULSE to join.`)], ephemeral: true }); return; }
          await spendPulse(btn.user.id, bet, opts.betReason, sessionId);
        }
        players.set(btn.user.id, btn.user.username);
        await addGamePlayer(sessionId, btn.user.id, bet);
        await btn.update({ embeds: [lobbyEmbed()], components: [buildRow()] });
        return;
      }

      if (btn.customId === `lobby_start_${sessionId}`) {
        if (btn.user.id !== interaction.user.id) { await btn.reply({ content: 'Only the host can start the game.', ephemeral: true }); return; }
        if (players.size < minPlayers) { await btn.reply({ content: `You need at least ${minPlayers} players to start.`, ephemeral: true }); return; }
        started = true;
        collector.stop('started');
        await btn.deferUpdate().catch(() => {});
        return;
      }
    });

    collector.on('end', () => resolve());
  });

  if (players.size < minPlayers) {
    if (bet > 0) {
      for (const pid of players.keys()) await earnPulse(pid, bet, opts.refundReason, sessionId);
    }
    await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
    await interaction.editReply({
      embeds: [errorEmbed(`Not enough players joined (need ${minPlayers}). ${bet > 0 ? 'All bets refunded.' : ''}`).setTitle(title)],
      components: [],
    }).catch(() => {});
    return null;
  }

  await updateGameSession(sessionId, { status: 'active' });

  return {
    sessionId,
    players: [...players.entries()].map(([id, name]) => ({ id, name })),
    bet,
    pot: bet * players.size,
    message: reply,
  };
}

