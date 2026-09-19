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
import { grantPulse, revokePulse } from './economy.js';
import { clearJail, fetchActiveJail, getJailConfig, releaseJail } from './jail.js';
import { createTournament, listPlayers } from './tournaments.js';
import { endAllChallenges, launchFlash, launchObjective, launchRiddle } from './challenges.js';
import { getPulsarConfig, pulsarPostNow } from './pulsar.js';
import { log } from '../utils/logger.js';

interface DashboardCommand {
  id: string;
  command: string;
  payload_json: Record<string, unknown>;
  status: string;
  created_by: string | null;
}

async function markDone(id: string): Promise<void> {
  await supabase
    .from('dashboard_commands')
    .update({ status: 'done', processed_at: new Date().toISOString() })
    .eq('id', id);
}

async function markFailed(id: string, error: string): Promise<void> {
  await supabase
    .from('dashboard_commands')
    .update({ status: 'failed', processed_at: new Date().toISOString(), error: error.slice(0, 500) })
    .eq('id', id);
}

async function handleAnnounce(client: Client, cmd: DashboardCommand): Promise<void> {
  const { channel_id, message, title, embed, ping } = cmd.payload_json as {
    channel_id?: string; message?: string; title?: string; embed?: boolean; ping?: 'everyone' | 'here' | null;
  };
  if (!channel_id || !message) throw new Error('announce: channel_id and message required');
  const channel = await client.channels.fetch(channel_id).catch(() => null);
  if (!channel || !('send' in channel) || !channel.isTextBased()) throw new Error('announce: channel not text-sendable');

  const content = ping === 'everyone' ? '@everyone' : ping === 'here' ? '@here' : undefined;
  const allowedMentions = ping === 'everyone'
    ? { parse: ['everyone' as const] }
    : { parse: [] as never[] };

  if (embed) {
    const eb = new EmbedBuilder()
      .setColor(0x38BDF8)
      .setDescription(message.slice(0, 4000))
      .setTimestamp();
    if (title) eb.setTitle(title.slice(0, 200));
    await channel.send({ content, embeds: [eb], allowedMentions });
  } else {
    await channel.send({ content: `${content ? content + '\n' : ''}${message}`.slice(0, 2000), allowedMentions });
  }
}

async function handleGrantPulse(cmd: DashboardCommand): Promise<void> {
  const { discord_id, amount, reason } = cmd.payload_json as {
    discord_id?: string; amount?: number; reason?: string;
  };
  if (!discord_id || !amount || amount <= 0) throw new Error('grant_pulse: bad payload');

  const { data: existing } = await supabase
    .from('discord_users')
    .select('username, avatar_url')
    .eq('discord_id', discord_id)
    .maybeSingle();

  const res = await grantPulse(
    discord_id,
    (existing?.username as string) ?? 'member',
    (existing?.avatar_url as string) ?? null,
    Math.floor(amount),
    reason ?? 'Dashboard grant',
    cmd.created_by ?? 'dashboard',
  );
  if (!res.success) throw new Error(res.error ?? 'grant failed');
}

async function handleRevokePulse(cmd: DashboardCommand): Promise<void> {
  const { discord_id, amount, reason } = cmd.payload_json as {
    discord_id?: string; amount?: number; reason?: string;
  };
  if (!discord_id || !amount || amount <= 0) throw new Error('revoke_pulse: bad payload');
  const res = await revokePulse(
    discord_id,
    Math.floor(amount),
    reason ?? 'Dashboard revoke',
    cmd.created_by ?? 'dashboard',
  );
  if (!res.success) throw new Error(res.error ?? 'revoke failed');
}

async function handleReleaseJail(client: Client, cmd: DashboardCommand): Promise<void> {
  const { discord_id, guild_id } = cmd.payload_json as { discord_id?: string; guild_id?: string };
  if (!discord_id || !guild_id) throw new Error('release_jail: bad payload');

  const jailed = await fetchActiveJail(guild_id, discord_id);
  if (!jailed) return; // already released, no-op

  const cfg = getJailConfig();
  const guild = await client.guilds.fetch(guild_id).catch(() => null);
  if (!guild) throw new Error('release_jail: guild not found');
  const member = await guild.members.fetch(discord_id).catch(() => null);
  if (member && cfg.role_id) {
    await releaseJail(guild, member, cfg.role_id, jailed.previous_roles_json ?? []);
  }
  await clearJail(guild_id, discord_id);
}

async function handleCreateTournament(client: Client, cmd: DashboardCommand): Promise<void> {
  const { channel_id, title, buy_in, max_players } = cmd.payload_json as {
    channel_id?: string; title?: string; buy_in?: number; max_players?: number;
  };
  if (!channel_id || !title || typeof buy_in !== 'number' || typeof max_players !== 'number') {
    throw new Error('create_tournament: bad payload');
  }
  const channel = await client.channels.fetch(channel_id).catch(() => null) as TextChannel | null;
  if (!channel || !channel.isTextBased() || !('guild' in channel)) {
    throw new Error('create_tournament: channel not text-based');
  }

  const t = await createTournament({
    guildId: channel.guildId!,
    title,
    buyIn: buy_in,
    maxPlayers: max_players,
    channelId: channel_id,
    createdBy: cmd.created_by ?? 'dashboard',
  });
  if (!t) throw new Error('create_tournament: DB insert failed');

  // Post the lobby message with Join / Start / Cancel buttons.
  const players = await listPlayers(t.id);
  const embed = new EmbedBuilder()
    .setColor(0x9F7AEA)
    .setTitle(`🏟️ ${t.title}`)
    .setDescription(
      `**Buy-in:** ${t.buy_in} PULSE · **Pot:** ${t.pot_pulse} PULSE\n` +
      `**Players:** ${players.length} / ${t.max_players}\n\n` +
      '_No one yet — press Join!_',
    )
    .setFooter({ text: 'Press Join to enter the arena.' })
    .setTimestamp();

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`tour:join:${t.id}`).setLabel(`Join (${t.buy_in} PULSE)`).setEmoji('⚔️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tour:start:${t.id}`).setLabel('Start (Lord)').setEmoji('▶️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`tour:cancel:${t.id}`).setLabel('Cancel (Lord)').setEmoji('✖️').setStyle(ButtonStyle.Danger),
  );
  const msg = await channel.send({ embeds: [embed], components: [row] });
  await supabase.from('tournaments').update({ message_id: msg.id }).eq('id', t.id);
}

async function handleNovusPostNow(client: Client): Promise<void> {
  const cfg = getPulsarConfig();
  if (!cfg.enabled) throw new Error('novus_post_now: Novus is OFF');
  if (!cfg.channel_id) throw new Error('novus_post_now: no channel set');
  const channel = await client.channels.fetch(cfg.channel_id).catch(() => null);
  if (!channel || !('guild' in channel)) throw new Error('novus_post_now: channel not found');
  const guildId = (channel as { guildId: string | null }).guildId;
  if (!guildId) throw new Error('novus_post_now: not in a guild');
  const ok = await pulsarPostNow(client, guildId);
  if (!ok) throw new Error('pulsarPostNow returned false');
}

async function handleLaunchMission(client: Client, cmd: DashboardCommand): Promise<void> {
  const { kind } = cmd.payload_json as { kind?: 'flash' | 'riddle' | 'daily' | 'weekly' };
  if (!kind) throw new Error('launch_mission: kind required');
  const cfg = getPulsarConfig();
  const ch = cfg.channel_id;
  if (!ch) throw new Error('launch_mission: set the Novus channel first');
  if (kind === 'flash') {
    const ok = await launchFlash(client, ch, { reward: 50, maxWinners: 3, durationMin: 30 });
    if (!ok) throw new Error('launchFlash failed');
  } else if (kind === 'riddle') {
    const ok = await launchRiddle(client, ch, { reward: 100, durationMin: 60 });
    if (!ok) throw new Error('launchRiddle failed');
  } else if (kind === 'daily') {
    const ok = await launchObjective(client, ch, { kind: 'daily', metric: 'messages', goal: 20, reward: 60 });
    if (!ok) throw new Error('launchObjective failed');
  } else if (kind === 'weekly') {
    const ok = await launchObjective(client, ch, { kind: 'weekly', metric: 'games_played', goal: 5, reward: 250 });
    if (!ok) throw new Error('launchObjective failed');
  }
}

async function handleEndAllMissions(client: Client): Promise<void> {
  await endAllChallenges(client);
}

async function processOne(client: Client, cmd: DashboardCommand): Promise<void> {
  try {
    if (cmd.command === 'announce') await handleAnnounce(client, cmd);
    else if (cmd.command === 'grant_pulse') await handleGrantPulse(cmd);
    else if (cmd.command === 'revoke_pulse') await handleRevokePulse(cmd);
    else if (cmd.command === 'release_jail') await handleReleaseJail(client, cmd);
    else if (cmd.command === 'create_tournament') await handleCreateTournament(client, cmd);
    else if (cmd.command === 'novus_post_now') await handleNovusPostNow(client);
    else if (cmd.command === 'launch_mission') await handleLaunchMission(client, cmd);
    else if (cmd.command === 'end_all_missions') await handleEndAllMissions(client);
    else throw new Error(`Unknown command: ${cmd.command}`);
    await markDone(cmd.id);
    log('INFO', `Dashboard cmd ${cmd.command} ${cmd.id} done`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('ERROR', `Dashboard cmd ${cmd.command} ${cmd.id} failed`, err);
    await markFailed(cmd.id, msg);
  }
}

let bridgeInterval: ReturnType<typeof setInterval> | null = null;

export function startDashboardBridge(client: Client, intervalMs = 15_000): void {
  const tick = async () => {
    try {
      const { data } = await supabase
        .from('dashboard_commands')
        .select('id, command, payload_json, status, created_by')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(10);
      for (const row of (data ?? []) as DashboardCommand[]) {
        await processOne(client, row);
      }
    } catch (err) {
      log('ERROR', 'Dashboard bridge tick failed', err);
    }
  };
  void tick();
  bridgeInterval = setInterval(() => void tick(), intervalMs);
}

export function stopDashboardBridge(): void {
  if (bridgeInterval) clearInterval(bridgeInterval);
}
