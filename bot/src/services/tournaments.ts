import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
  TextChannel,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { spendPulse } from './economy.js';
import { earnPulse } from './games.js';
import { log } from '../utils/logger.js';

export interface Tournament {
  id: string;
  guild_id: string;
  status: 'open' | 'running' | 'done' | 'cancelled';
  title: string;
  buy_in: number;
  max_players: number;
  pot_pulse: number;
  channel_id: string | null;
  message_id: string | null;
  created_by: string | null;
  winner_id: string | null;
  runner_up_id: string | null;
  created_at: string;
}

export interface TournamentPlayer {
  tournament_id: string;
  discord_id: string;
  username: string;
  seed: number | null;
  eliminated_round: number | null;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  round: number;
  match_index: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  score1: number | null;
  score2: number | null;
  status: 'pending' | 'done';
}

const RANK_COLOR = 0x9F7AEA;
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function getOpenTournamentInGuild(guildId: string): Promise<Tournament | null> {
  const { data } = await supabase
    .from('tournaments')
    .select('*')
    .eq('guild_id', guildId)
    .in('status', ['open', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Tournament | null) ?? null;
}

export async function getTournament(id: string): Promise<Tournament | null> {
  const { data } = await supabase.from('tournaments').select('*').eq('id', id).maybeSingle();
  return (data as Tournament | null) ?? null;
}

export async function listPlayers(tournamentId: string): Promise<TournamentPlayer[]> {
  const { data } = await supabase
    .from('tournament_players')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('joined_at', { ascending: true });
  return (data as TournamentPlayer[]) ?? [];
}

export async function createTournament(input: {
  guildId: string;
  title: string;
  buyIn: number;
  maxPlayers: number;
  channelId: string;
  createdBy: string;
}): Promise<Tournament | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      guild_id: input.guildId,
      title: input.title.slice(0, 200),
      buy_in: Math.max(0, Math.floor(input.buyIn)),
      max_players: Math.max(2, Math.min(64, Math.floor(input.maxPlayers))),
      channel_id: input.channelId,
      created_by: input.createdBy,
      status: 'open',
    })
    .select('*')
    .single();
  if (error) { log('ERROR', 'Failed to create tournament', error); return null; }
  return data as Tournament;
}

export async function joinTournament(
  tournament: Tournament,
  discordId: string,
  username: string,
): Promise<{ ok: boolean; error?: string }> {
  if (tournament.status !== 'open') return { ok: false, error: 'Tournament is no longer open.' };

  const players = await listPlayers(tournament.id);
  if (players.length >= tournament.max_players) return { ok: false, error: 'Tournament is full.' };
  if (players.some(p => p.discord_id === discordId)) return { ok: false, error: 'You already joined.' };

  if (tournament.buy_in > 0) {
    const spend = await spendPulse(discordId, tournament.buy_in, `tournament_buyin:${tournament.id}`, tournament.id);
    if (!spend.success) return { ok: false, error: spend.error ?? 'Could not pay buy-in.' };
  }

  const { error } = await supabase.from('tournament_players').insert({
    tournament_id: tournament.id,
    discord_id: discordId,
    username: username.slice(0, 80),
  });
  if (error) {
    // Refund on failure.
    if (tournament.buy_in > 0) await earnPulse(discordId, tournament.buy_in, `tournament_refund:${tournament.id}`, tournament.id);
    return { ok: false, error: 'Could not join, tickets have been refunded.' };
  }

  await supabase
    .from('tournaments')
    .update({ pot_pulse: tournament.pot_pulse + tournament.buy_in })
    .eq('id', tournament.id);

  return { ok: true };
}

export async function cancelTournament(tournament: Tournament): Promise<number> {
  if (tournament.status === 'done' || tournament.status === 'cancelled') return 0;
  const players = await listPlayers(tournament.id);

  // Refund every entry.
  for (const p of players) {
    if (tournament.buy_in > 0) {
      await earnPulse(p.discord_id, tournament.buy_in, `tournament_cancel:${tournament.id}`, tournament.id);
    }
  }
  await supabase
    .from('tournaments')
    .update({ status: 'cancelled', ended_at: new Date().toISOString(), pot_pulse: 0 })
    .eq('id', tournament.id);
  return players.length;
}

// Shuffle in place with Fisher–Yates.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Round bracket size: next power of two ≥ n.
function bracketSize(n: number): number {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

function rollDie(): number {
  return Math.floor(Math.random() * 100) + 1; // 1-100
}

function pickHigher(): { s1: number; s2: number; winner: 1 | 2 } {
  for (let i = 0; i < 12; i++) {
    const s1 = rollDie();
    const s2 = rollDie();
    if (s1 !== s2) return { s1, s2, winner: s1 > s2 ? 1 : 2 };
  }
  return { s1: 50, s2: 50, winner: 1 };
}

function buildEmbed(t: Tournament, players: TournamentPlayer[], matches: TournamentMatch[]): EmbedBuilder {
  const lines: string[] = [
    `**Buy-in:** ${t.buy_in} PULSE · **Pot:** ${t.pot_pulse} PULSE`,
    `**Players:** ${players.length} / ${t.max_players}`,
  ];
  if (t.status === 'open') {
    lines.push('', players.map(p => `• ${p.username}`).join('\n') || '_No one yet — press Join!_');
  } else if (matches.length) {
    // Group latest round for a compact summary.
    const byRound = new Map<number, TournamentMatch[]>();
    for (const m of matches) {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round)!.push(m);
    }
    for (const [round, ms] of byRound) {
      lines.push('', `**Round ${round}**`);
      for (const m of ms) {
        const p1 = players.find(p => p.discord_id === m.player1_id)?.username ?? '—';
        const p2 = players.find(p => p.discord_id === m.player2_id)?.username ?? (m.player2_id ? '—' : 'BYE');
        if (m.status === 'done') {
          const w = m.winner_id === m.player1_id ? p1 : p2;
          lines.push(`✅ ${p1} (${m.score1 ?? '-'}) vs ${p2} (${m.score2 ?? '-'}) → **${w}**`);
        } else {
          lines.push(`• ${p1} vs ${p2}`);
        }
      }
    }
  }
  if (t.status === 'done' && t.winner_id) {
    const winnerName = players.find(p => p.discord_id === t.winner_id)?.username ?? '???';
    lines.push('', `🏆 **Winner:** <@${t.winner_id}> (${winnerName}) — takes home **${t.pot_pulse} PULSE**`);
  }
  if (t.status === 'cancelled') {
    lines.push('', '❌ Cancelled — buy-ins refunded.');
  }
  return new EmbedBuilder()
    .setColor(RANK_COLOR)
    .setTitle(`🏟️ ${t.title}`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: t.status === 'open' ? 'Press Join to enter the arena.' : `Tournament ${t.status}` })
    .setTimestamp();
}

function rowFor(t: Tournament): ActionRowBuilder<MessageActionRowComponentBuilder> | null {
  if (t.status !== 'open') return null;
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`tour:join:${t.id}`).setLabel(`Join (${t.buy_in} PULSE)`).setEmoji('⚔️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tour:start:${t.id}`).setLabel('Start (Lord)').setEmoji('▶️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`tour:cancel:${t.id}`).setLabel('Cancel (Lord)').setEmoji('✖️').setStyle(ButtonStyle.Danger),
  );
}

export async function refreshLobbyMessage(client: Client, t: Tournament): Promise<void> {
  if (!t.channel_id || !t.message_id) return;
  try {
    const channel = await client.channels.fetch(t.channel_id) as TextChannel;
    const msg = await channel.messages.fetch(t.message_id);
    const players = await listPlayers(t.id);
    const { data: matches } = await supabase.from('tournament_matches').select('*').eq('tournament_id', t.id).order('round').order('match_index');
    const row = rowFor(t);
    await msg.edit({
      embeds: [buildEmbed(t, players, (matches as TournamentMatch[]) ?? [])],
      components: row ? [row] : [],
    });
  } catch (err) {
    log('WARN', 'refreshLobbyMessage failed', err);
  }
}

// Runs the bracket to completion.
export async function startTournament(client: Client, t: Tournament): Promise<{ ok: boolean; error?: string }> {
  if (t.status !== 'open') return { ok: false, error: 'Tournament is not in open state.' };
  const players = await listPlayers(t.id);
  if (players.length < 2) return { ok: false, error: 'Need at least 2 players.' };

  const seeded = shuffle(players);
  // Assign seeds.
  for (let i = 0; i < seeded.length; i++) {
    await supabase.from('tournament_players').update({ seed: i + 1 }).eq('tournament_id', t.id).eq('discord_id', seeded[i].discord_id);
  }

  // Round 1 pairs — pad with byes to next power of two.
  const size = bracketSize(seeded.length);
  const slots: (TournamentPlayer | null)[] = [...seeded];
  while (slots.length < size) slots.push(null);

  await supabase
    .from('tournaments')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', t.id);
  t.status = 'running';

  const channel = t.channel_id ? await client.channels.fetch(t.channel_id).catch(() => null) as TextChannel | null : null;

  // Announce start.
  if (channel) await channel.send({ content: `🔔 **${t.title}** starts now with **${seeded.length}** contenders!` }).catch(() => null);

  let alive: TournamentPlayer[] = seeded;
  let round = 1;
  let currentSlots = slots;

  while (alive.length > 1) {
    const nextRoundSlots: (TournamentPlayer | null)[] = [];
    const matchCount = currentSlots.length / 2;

    for (let i = 0; i < matchCount; i++) {
      const p1 = currentSlots[i * 2];
      const p2 = currentSlots[i * 2 + 1];

      // Byes: auto-advance.
      if (!p1 && !p2) { nextRoundSlots.push(null); continue; }
      if (!p1) { nextRoundSlots.push(p2); continue; }
      if (!p2) {
        nextRoundSlots.push(p1);
        await supabase.from('tournament_matches').insert({
          tournament_id: t.id,
          round,
          match_index: i,
          player1_id: p1.discord_id,
          player2_id: null,
          winner_id: p1.discord_id,
          status: 'done',
          resolved_at: new Date().toISOString(),
        });
        if (channel) await channel.send({ content: `Round ${round} · match ${i + 1}: **${p1.username}** gets a BYE.` }).catch(() => null);
        continue;
      }

      // Dice duel.
      const roll = pickHigher();
      const winner = roll.winner === 1 ? p1 : p2;
      const loser = roll.winner === 1 ? p2 : p1;

      await supabase.from('tournament_matches').insert({
        tournament_id: t.id,
        round,
        match_index: i,
        player1_id: p1.discord_id,
        player2_id: p2.discord_id,
        winner_id: winner.discord_id,
        score1: roll.s1,
        score2: roll.s2,
        status: 'done',
        resolved_at: new Date().toISOString(),
      });
      await supabase.from('tournament_players').update({ eliminated_round: round }).eq('tournament_id', t.id).eq('discord_id', loser.discord_id);

      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(RANK_COLOR)
          .setDescription(
            `**Round ${round} · Match ${i + 1}** 🎲\n\n` +
            `${p1.username} rolls **${roll.s1}**\n` +
            `${p2.username} rolls **${roll.s2}**\n\n` +
            `🏆 **${winner.username}** advances!`,
          );
        await channel.send({ embeds: [embed] }).catch(() => null);
        await delay(2200);
      }
      nextRoundSlots.push(winner);
    }

    alive = nextRoundSlots.filter((p): p is TournamentPlayer => p !== null);
    currentSlots = nextRoundSlots;
    round++;
  }

  const winner = alive[0];
  const pot = t.pot_pulse;

  await supabase.from('tournaments').update({
    status: 'done',
    ended_at: new Date().toISOString(),
    winner_id: winner?.discord_id ?? null,
  }).eq('id', t.id);

  if (winner && pot > 0) {
    await earnPulse(winner.discord_id, pot, `tournament_win:${t.id}`, t.id);
  }

  if (channel && winner) {
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 CHAMPION')
      .setDescription(`**${winner.username}** wins **${t.title}** and takes home **${pot} PULSE**! 🎉`)
      .setTimestamp();
    await channel.send({ content: `<@${winner.discord_id}>`, embeds: [embed] }).catch(() => null);
  }

  // Refresh the lobby message one last time so it shows the final bracket.
  const finalT = await getTournament(t.id);
  if (finalT) await refreshLobbyMessage(client, finalT);

  return { ok: true };
}
