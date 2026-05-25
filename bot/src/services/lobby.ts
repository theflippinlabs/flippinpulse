import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { spendPulse, getBalance } from './economy.js';
import { addGamePlayer, updateGameSession, earnPulse, createGameSession } from './games.js';
import { pulseEmbed, errorEmbed } from '../utils/embeds.js';
import { log } from '../utils/logger.js';

export interface LobbyPlayer {
  id: string;
  name: string;
}

export interface LobbyState {
  host_id: string;
  host_name: string;
  title: string;
  bet: number;
  min_players: number;
  bet_reason: string;
  refund_reason: string;
  players: LobbyPlayer[];
}

export interface ResolverContext {
  message: Message;
  sessionId: string;
  players: LobbyPlayer[];
  bet: number;
  pot: number;
}

type Resolver = (ctx: ResolverContext) => Promise<void>;

const resolvers = new Map<string, Resolver>();
export function registerLobbyResolver(gameKey: string, fn: Resolver): void {
  resolvers.set(gameKey, fn);
}

export const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

function lobbyEmbed(state: LobbyState) {
  return pulseEmbed(`${state.title} — Lobby`)
    .setDescription(
      `**${state.host_name}** is hosting!\n\n` +
      `${state.bet > 0 ? `💰 Entry: **${state.bet}** PULSE\n` : '🆓 Free entry\n'}` +
      `👥 Players (${state.players.length}): ${state.players.map(p => p.name).join(', ')}\n\n` +
      `Click **Join** to enter. Only the host can **Start** (needs ${state.min_players}+ players) or **Cancel**. No time limit.`
    );
}

function lobbyRow(sessionId: string, count: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`lobby_join_${sessionId}`).setLabel(`Join (${count})`).setStyle(ButtonStyle.Primary).setEmoji('🙋'),
    new ButtonBuilder().setCustomId(`lobby_start_${sessionId}`).setLabel('Start').setStyle(ButtonStyle.Success).setEmoji('▶️'),
    new ButtonBuilder().setCustomId(`lobby_cancel_${sessionId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
  );
}

export async function createLobby(opts: {
  interaction: ChatInputCommandInteraction;
  gameKey: string;
  title: string;
  bet: number;
  minPlayers: number;
  betReason: string;
  refundReason: string;
}): Promise<void> {
  const { interaction, gameKey, title, bet, minPlayers } = opts;
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    await interaction.reply({ embeds: [errorEmbed('This game must be started in a text channel.')], ephemeral: true });
    return;
  }

  if (bet > 0) {
    const bal = await getBalance(interaction.user.id);
    if (!bal || bal.balance < bet) {
      await interaction.reply({ embeds: [errorEmbed(`Insufficient PULSE. Balance: ${bal?.balance ?? 0}`)], ephemeral: true });
      return;
    }
  }

  const state: LobbyState = {
    host_id: interaction.user.id,
    host_name: interaction.user.username,
    title,
    bet,
    min_players: minPlayers,
    bet_reason: opts.betReason,
    refund_reason: opts.refundReason,
    players: [{ id: interaction.user.id, name: interaction.user.username }],
  };

  const sessionId = await createGameSession(gameKey, interaction.channelId, state as unknown as Record<string, unknown>);
  if (!sessionId) {
    await interaction.reply({ embeds: [errorEmbed('Failed to create the game.')], ephemeral: true });
    return;
  }

  if (bet > 0) await spendPulse(interaction.user.id, bet, opts.betReason, sessionId);
  await addGamePlayer(sessionId, interaction.user.id, bet);

  await channel.send({ embeds: [lobbyEmbed(state)], components: [lobbyRow(sessionId, state.players.length)] });
  await interaction.reply({ content: '✅ Lobby created below — players can Join, then you press Start when ready.', ephemeral: true });
}

export async function handleLobbyButton(interaction: ButtonInteraction): Promise<void> {
  const match = interaction.customId.match(/^lobby_(join|start|cancel)_(.+)$/);
  if (!match) return;
  const action = match[1];
  const sessionId = match[2];

  const { data: session } = await supabase
    .from('game_sessions')
    .select('id, game_key, status, state_json')
    .eq('id', sessionId)
    .single();

  if (!session || session.status !== 'waiting') {
    await interaction.reply({ content: 'This lobby is closed.', ephemeral: true });
    return;
  }
  const state = session.state_json as LobbyState;

  if (action === 'join') {
    if (state.players.some(p => p.id === interaction.user.id)) {
      await interaction.reply({ content: 'You already joined!', ephemeral: true });
      return;
    }
    if (state.bet > 0) {
      const bal = await getBalance(interaction.user.id);
      if (!bal || bal.balance < state.bet) {
        await interaction.reply({ embeds: [errorEmbed(`You need ${state.bet} PULSE to join.`)], ephemeral: true });
        return;
      }
      await spendPulse(interaction.user.id, state.bet, state.bet_reason, sessionId);
    }
    state.players.push({ id: interaction.user.id, name: interaction.user.username });
    await addGamePlayer(sessionId, interaction.user.id, state.bet);
    await updateGameSession(sessionId, { state_json: state as unknown as Record<string, unknown> });
    await interaction.update({ embeds: [lobbyEmbed(state)], components: [lobbyRow(sessionId, state.players.length)] });
    return;
  }

  // start / cancel are host-only
  if (interaction.user.id !== state.host_id) {
    await interaction.reply({ content: 'Only the host can do that.', ephemeral: true });
    return;
  }

  if (action === 'cancel') {
    if (state.bet > 0) {
      for (const p of state.players) await earnPulse(p.id, state.bet, state.refund_reason, sessionId);
    }
    await updateGameSession(sessionId, { status: 'cancelled', ended_at: new Date().toISOString() });
    await interaction.update({
      embeds: [errorEmbed(`Lobby cancelled by the host.${state.bet > 0 ? ' All bets refunded.' : ''}`).setTitle(state.title)],
      components: [],
    });
    return;
  }

  // start
  if (state.players.length < state.min_players) {
    await interaction.reply({ content: `You need at least ${state.min_players} players to start.`, ephemeral: true });
    return;
  }
  const resolver = resolvers.get(session.game_key);
  if (!resolver) {
    await interaction.reply({ content: 'This game type is currently unavailable.', ephemeral: true });
    return;
  }

  await updateGameSession(sessionId, { status: 'active' });
  await interaction.update({ embeds: [pulseEmbed(state.title).setDescription('Starting…')], components: [] });

  try {
    await resolver({
      message: interaction.message,
      sessionId,
      players: state.players,
      bet: state.bet,
      pot: state.bet * state.players.length,
    });
  } catch (err) {
    log('ERROR', `Lobby resolver for ${session.game_key} failed`, err);
  }
}
