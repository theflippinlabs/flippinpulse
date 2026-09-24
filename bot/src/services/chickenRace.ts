import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  Message,
  MessageActionRowComponentBuilder,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js';
import { spendPulse } from './economy.js';
import { earnPulse } from './games.js';
import { getGameConfig } from './games.js';
import { log } from '../utils/logger.js';

interface Player {
  discord_id: string;
  username: string;
  bet: number;
  cashed_out_at: number | null; // multiplier at cash-out, null while racing
  won: number; // pulse won (0 if wiped)
}

interface Race {
  id: string;
  channel_id: string;
  message: Message;
  buy_in: number;
  max_players: number;
  wait_seconds: number;
  starts_at: number; // ms epoch when race starts
  started_at: number | null; // ms epoch when race began
  crash_at_ms: number | null; // ms after started_at when chicken flies
  ends_at: number | null;
  phase: 'lobby' | 'running' | 'ended';
  players: Map<string, Player>;
  loopHandle: ReturnType<typeof setInterval> | null;
}

const races = new Map<string, Race>();     // by race id
const racesByChannel = new Map<string, string>(); // channel_id -> race id
const GOLD = 0xF5B62E;
const CRASH_COLOR = 0xEF4444;
const CYAN = 0x22D3EE;

function multiplierAt(elapsedMs: number): number {
  // Smooth exponential: 1.00x at 0s, ~2x at 5s, ~4x at 15s, ~8x at 30s.
  const t = elapsedMs / 1000;
  return Math.max(1, 1 + Math.pow(t, 1.18) / 6);
}

function rollCrashPoint(): number {
  // Instant crash sometimes (2%), median around 4-6x, occasional 20x+ tail.
  const r = Math.random();
  if (r < 0.02) return 1.0; // instant chicken
  // Inverted exponential — heavy tail.
  const u = Math.random();
  const mult = Math.max(1.05, 1 / (1 - u * 0.98));
  return Math.min(mult, 50);
}

function elapsedToReach(target: number): number {
  // Inverse of multiplierAt(t): t = ((target - 1) * 6)^(1/1.18)
  const raw = (target - 1) * 6;
  return Math.pow(Math.max(0, raw), 1 / 1.18) * 1000;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

// Lobby row: Join + Force start buttons
function lobbyRow(raceId: string, buyIn: number): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`chicken:join:${raceId}`).setLabel(`Join (${buyIn} PULSE)`).setEmoji('🐔').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`chicken:start:${raceId}`).setLabel('Start now (Lord)').setEmoji('▶️').setStyle(ButtonStyle.Primary),
  );
}

function racingRow(raceId: string, multiplier: number): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`chicken:cashout:${raceId}`).setLabel(`Cash out ${multiplier.toFixed(2)}x`).setEmoji('💸').setStyle(ButtonStyle.Success),
  );
}

function lobbyEmbed(race: Race): EmbedBuilder {
  const remaining = Math.max(0, Math.ceil((race.starts_at - Date.now()) / 1000));
  const players = [...race.players.values()];
  const list = players.map(p => `• ${p.username}`).join('\n') || '_No one yet — join!_';
  return new EmbedBuilder()
    .setColor(GOLD)
    .setTitle('🐔 CHICKEN RACE')
    .setDescription(
      `The chicken is walking around… bet **${race.buy_in} PULSE** to hop on. ` +
      `Multiplier will start ticking, and the chicken will fly away at a **random** moment. ` +
      `Cash out **before** it flies — or lose your bet.\n\n` +
      `**Starts in ${remaining}s** · **${players.length} / ${race.max_players}** players\n\n${list}`,
    )
    .setFooter({ text: 'Press Cash out when you feel lucky.' })
    .setTimestamp();
}

function runningEmbed(race: Race, mult: number): EmbedBuilder {
  const alive = [...race.players.values()].filter(p => p.cashed_out_at === null);
  const cashed = [...race.players.values()].filter(p => p.cashed_out_at !== null);
  const potInPot = alive.reduce((s, p) => s + p.bet, 0);
  const cashedLines = cashed.length
    ? cashed.map(p => `✅ **${p.username}** cashed at **${p.cashed_out_at!.toFixed(2)}x** — won ${fmt(p.won)} PULSE`).join('\n')
    : '_Nobody has cashed out yet._';
  const aliveLines = alive.length
    ? alive.map(p => `🏃 ${p.username}`).join('\n')
    : '_No one still racing._';
  return new EmbedBuilder()
    .setColor(CYAN)
    .setTitle(`🐔 CHICKEN RACE — LIVE`)
    .setDescription(
      `## 🔥 **${mult.toFixed(2)}x**\n\n` +
      `**Still racing:** ${alive.length} · **Cashed out:** ${cashed.length}\n` +
      `**Live pot in danger:** ${fmt(potInPot)} PULSE\n\n` +
      `${cashedLines}\n\n${aliveLines}`,
    )
    .setTimestamp();
}

function endEmbed(race: Race, crashMult: number): EmbedBuilder {
  const cashed = [...race.players.values()].filter(p => p.cashed_out_at !== null);
  const wiped = [...race.players.values()].filter(p => p.cashed_out_at === null);
  const winnerLines = cashed.length
    ? cashed
        .sort((a, b) => b.won - a.won)
        .map(p => `🏆 **${p.username}** — cashed at **${p.cashed_out_at!.toFixed(2)}x** for **${fmt(p.won)} PULSE**`)
        .join('\n')
    : '_Nobody made it out in time._';
  const wipedLines = wiped.length
    ? wiped.map(p => `💀 ${p.username} — lost **${fmt(p.bet)} PULSE**`).join('\n')
    : '';
  return new EmbedBuilder()
    .setColor(CRASH_COLOR)
    .setTitle(`🐔💨 The chicken flew away at ${crashMult.toFixed(2)}x!`)
    .setDescription(`${winnerLines}${wipedLines ? '\n\n' + wipedLines : ''}\n\n_Start another race with \`/chicken\`._`)
    .setTimestamp();
}

async function refreshLobby(race: Race): Promise<void> {
  try {
    await race.message.edit({
      embeds: [lobbyEmbed(race)],
      components: [lobbyRow(race.id, race.buy_in)],
    });
  } catch (err) {
    log('WARN', 'chicken: lobby refresh failed', err);
  }
}

async function tickRunning(race: Race): Promise<void> {
  const now = Date.now();
  const started = race.started_at!;
  const elapsed = now - started;
  const mult = multiplierAt(elapsed);

  // Crash check
  if (race.crash_at_ms !== null && elapsed >= race.crash_at_ms) {
    await endRace(race);
    return;
  }

  // If everyone has cashed out, end early
  const alive = [...race.players.values()].filter(p => p.cashed_out_at === null);
  if (alive.length === 0) {
    await endRace(race);
    return;
  }

  try {
    await race.message.edit({
      embeds: [runningEmbed(race, mult)],
      components: [racingRow(race.id, mult)],
    });
  } catch (err) {
    // Rate-limited or message deleted — silent, we'll try again next tick.
  }
}

async function endRace(race: Race): Promise<void> {
  if (race.phase === 'ended') return;
  race.phase = 'ended';
  race.ends_at = Date.now();
  if (race.loopHandle) { clearInterval(race.loopHandle); race.loopHandle = null; }

  const started = race.started_at ?? Date.now();
  const finalElapsed = race.crash_at_ms ?? (Date.now() - started);
  const crashMult = multiplierAt(finalElapsed);

  // Anyone still racing when crash hits is wiped (bet already spent — no earnPulse for them).
  try {
    await race.message.edit({
      embeds: [endEmbed(race, crashMult)],
      components: [],
    });
  } catch (err) {
    log('WARN', 'chicken: end message edit failed', err);
  }

  racesByChannel.delete(race.channel_id);
  // Retain the race in memory for a few minutes for late queries, then drop.
  setTimeout(() => races.delete(race.id), 5 * 60_000);
}

async function transitionToRunning(race: Race): Promise<void> {
  if (race.phase !== 'lobby') return;
  if (race.players.size === 0) {
    // Nobody joined — cancel gracefully.
    race.phase = 'ended';
    racesByChannel.delete(race.channel_id);
    try {
      await race.message.edit({
        embeds: [new EmbedBuilder()
          .setColor(0x6B7280)
          .setTitle('🐔 The chicken got bored')
          .setDescription('Nobody joined the race. Try again with `/chicken`.')],
        components: [],
      });
    } catch { /* noop */ }
    return;
  }
  race.phase = 'running';
  race.started_at = Date.now();

  // Roll crash target multiplier + convert to elapsed ms.
  const target = rollCrashPoint();
  race.crash_at_ms = elapsedToReach(target);

  log('INFO', `chicken: race ${race.id} starts, crash target ${target.toFixed(2)}x @ ${(race.crash_at_ms/1000).toFixed(1)}s`);

  race.loopHandle = setInterval(() => void tickRunning(race), 1800);
  void tickRunning(race);
}

export async function startChickenRace(channel: TextChannel, opts: {
  buy_in?: number;
  max_players?: number;
  wait_seconds?: number;
}): Promise<{ ok: boolean; error?: string; race_id?: string }> {
  if (racesByChannel.has(channel.id)) {
    return { ok: false, error: 'A chicken race is already running in this channel.' };
  }
  const cfg = (getGameConfig('chicken_race')?.config_json ?? {}) as {
    min_bet?: number; max_bet?: number; default_buy_in?: number; max_players?: number; wait_seconds?: number;
  };
  const buy_in = Math.max(1, Math.floor(opts.buy_in ?? cfg.default_buy_in ?? 50));
  const max_players = Math.max(2, Math.min(50, Math.floor(opts.max_players ?? cfg.max_players ?? 20)));
  const wait_seconds = Math.max(5, Math.min(120, Math.floor(opts.wait_seconds ?? cfg.wait_seconds ?? 25)));

  const id = `${channel.id}-${Date.now()}`;
  const race: Race = {
    id,
    channel_id: channel.id,
    message: undefined as unknown as Message,
    buy_in,
    max_players,
    wait_seconds,
    starts_at: Date.now() + wait_seconds * 1000,
    started_at: null,
    crash_at_ms: null,
    ends_at: null,
    phase: 'lobby',
    players: new Map(),
    loopHandle: null,
  };

  const msg = await channel.send({
    embeds: [lobbyEmbed(race)],
    components: [lobbyRow(id, buy_in)],
  });
  race.message = msg;

  races.set(id, race);
  racesByChannel.set(channel.id, id);

  // Countdown tick to refresh the "starts in Xs" line.
  const countdownHandle = setInterval(async () => {
    if (race.phase !== 'lobby') { clearInterval(countdownHandle); return; }
    if (Date.now() >= race.starts_at) {
      clearInterval(countdownHandle);
      await transitionToRunning(race);
      return;
    }
    await refreshLobby(race);
  }, 3000);

  return { ok: true, race_id: id };
}

export async function handleChickenButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, raceId] = interaction.customId.split(':');
  const race = races.get(raceId);
  if (!race) {
    await interaction.reply({ content: 'This race is no longer running.', ephemeral: true });
    return;
  }

  if (action === 'join') {
    if (race.phase !== 'lobby') {
      await interaction.reply({ content: 'The race has already started.', ephemeral: true });
      return;
    }
    if (race.players.size >= race.max_players) {
      await interaction.reply({ content: 'The race is full.', ephemeral: true });
      return;
    }
    if (race.players.has(interaction.user.id)) {
      await interaction.reply({ content: 'You are already in.', ephemeral: true });
      return;
    }
    const spend = await spendPulse(interaction.user.id, race.buy_in, `chicken_race_bet:${raceId}`, raceId);
    if (!spend.success) {
      await interaction.reply({ content: spend.error ?? 'Could not pay the buy-in.', ephemeral: true });
      return;
    }
    race.players.set(interaction.user.id, {
      discord_id: interaction.user.id,
      username: interaction.user.username,
      bet: race.buy_in,
      cashed_out_at: null,
      won: 0,
    });
    await interaction.reply({ content: `You're on. Good luck. 🐔`, ephemeral: true });
    await refreshLobby(race);
    return;
  }

  if (action === 'start') {
    // The button label says "(Lord)" — enforce it. Without this check any
    // joiner could skip the lobby window and lock others out of joining.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: '⛔ Only a Lord can skip the lobby wait.', ephemeral: true });
      return;
    }
    if (race.phase !== 'lobby') {
      await interaction.reply({ content: 'Not in lobby anymore.', ephemeral: true });
      return;
    }
    race.starts_at = Date.now();
    await interaction.reply({ content: '▶️ Starting the race now.', ephemeral: true });
    await transitionToRunning(race);
    return;
  }

  if (action === 'cashout') {
    if (race.phase !== 'running') {
      await interaction.reply({ content: 'Race is not running.', ephemeral: true });
      return;
    }
    const player = race.players.get(interaction.user.id);
    if (!player) {
      await interaction.reply({ content: 'You are not in this race.', ephemeral: true });
      return;
    }
    if (player.cashed_out_at !== null) {
      await interaction.reply({ content: 'You already cashed out.', ephemeral: true });
      return;
    }
    const elapsed = Date.now() - race.started_at!;
    // Late cash-out attempt after the chicken has flown → wipe.
    if (race.crash_at_ms !== null && elapsed >= race.crash_at_ms) {
      await interaction.reply({ content: '🐔💨 Too late — the chicken already flew.', ephemeral: true });
      return;
    }
    const mult = multiplierAt(elapsed);
    const won = Math.floor(player.bet * mult);
    player.cashed_out_at = mult;
    player.won = won;
    await earnPulse(player.discord_id, won, `chicken_race_cashout:${raceId}`, raceId);
    await interaction.reply({ content: `💸 Cashed out at **${mult.toFixed(2)}x** — you win **${fmt(won)} PULSE**.`, ephemeral: true });
    return;
  }

  log('WARN', `chicken: unknown action ${action}`);
}
