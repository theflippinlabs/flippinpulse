import { Client, EmbedBuilder, VoiceState } from 'discord.js';
import { awardPoints } from '../services/points.js';
import { getPointsConfig } from '../services/settings.js';
import { getStreamConfig } from '../services/streamAlerts.js';
import { earnPulse } from '../services/games.js';
import { supabase } from '../supabase.js';
import { enqueuePush } from '../services/pushQueue.js';
import { log } from '../utils/logger.js';

interface VoiceSession {
  channelId: string;
  joinedAt: number;
  username: string;
  avatarUrl: string | null;
  guildId: string;
}

const voiceSessions = new Map<string, VoiceSession>();
const MAX_SESSION_MS = 24 * 60 * 60_000;
const CLEANUP_INTERVAL_MS = 60 * 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

async function flushSession(client: Client, discordId: string, reason: string): Promise<void> {
  const session = voiceSessions.get(discordId);
  if (!session) return;
  voiceSessions.delete(discordId);

  const durationMinutes = Math.floor((Date.now() - session.joinedAt) / 60_000);
  if (durationMinutes < 1) return;

  const guild = client.guilds.cache.get(session.guildId);
  if (!guild) return;
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;

  const config = getPointsConfig();
  const points = durationMinutes * config.voice_per_minute;

  await awardPoints({
    discordId,
    username: session.username,
    avatarUrl: session.avatarUrl,
    type: 'voice',
    channelId: session.channelId,
    points,
    guild,
    member,
  });

  log('INFO', `Voice points (${reason}): ${discordId} ${durationMinutes}min → ${points}pts`);
}

export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const user = newState.member?.user ?? oldState.member?.user;
  if (!user || user.bot) return;

  const discordId = user.id;
  const guild = newState.guild ?? oldState.guild;
  const member = newState.member ?? oldState.member;
  if (!guild || !member) return;

  const username = user.username;
  const avatarUrl = user.displayAvatarURL({ size: 128 });

  if (!oldState.channelId && newState.channelId) {
    voiceSessions.set(discordId, {
      channelId: newState.channelId,
      joinedAt: Date.now(),
      username,
      avatarUrl,
      guildId: guild.id,
    });
    return;
  }

  if (oldState.channelId && !newState.channelId) {
    await flushSession(guild.client, discordId, 'leave');
    return;
  }

  if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    const existing = voiceSessions.get(discordId);
    if (existing) {
      voiceSessions.set(discordId, { ...existing, channelId: newState.channelId });
    }
  }

  // ---- Discord Go Live detection ----
  // Streaming = screen share, selfVideo = camera. Either flip counts as
  // going live for our purposes. The user must be in a voice channel.
  const wasLive = !!oldState.streaming || !!oldState.selfVideo;
  const isLive  = !!newState.streaming || !!newState.selfVideo;
  const channelId = newState.channelId ?? oldState.channelId;

  if (!wasLive && isLive && channelId) {
    await handleGoLiveStart(guild.client, discordId, username, channelId, guild.id).catch(err => log('ERROR', 'Go Live start failed', err));
  } else if (wasLive && !isLive) {
    await handleGoLiveEnd(guild.client, discordId).catch(err => log('ERROR', 'Go Live end failed', err));
  }
}

async function handleGoLiveStart(client: Client, discordId: string, username: string, channelId: string, guildId: string): Promise<void> {
  // Open a live_stream_sessions row. If one is already open (edge case:
  // reconnect), don't double-log — just move on.
  const { data: openRow } = await supabase.from('live_stream_sessions').select('id').eq('discord_id', discordId).eq('source', 'discord_go_live').is('ended_at', null).maybeSingle();
  if (openRow) return;

  await supabase.from('live_stream_sessions').insert({
    discord_id: discordId, source: 'discord_go_live', channel_id: channelId,
    external_url: `https://discord.com/channels/${guildId}/${channelId}`,
  });

  // Attribute a streamer role while live, if configured.
  const cfg = getStreamConfig();
  if (cfg.streamer_role_id) {
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      const member = guild ? await guild.members.fetch(discordId).catch(() => null) : null;
      if (member) await member.roles.add(cfg.streamer_role_id, 'Go Live').catch(() => null);
    } catch { /* ignore */ }
  }

  // Public alert in the configured stream channel.
  if (!cfg.alert_channel_id) return;
  const alertChan = await client.channels.fetch(cfg.alert_channel_id).catch(() => null);
  if (!alertChan || !alertChan.isTextBased() || alertChan.isDMBased() || !alertChan.isSendable()) return;
  const url = `https://discord.com/channels/${guildId}/${channelId}`;
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📺 ${username} vient de lancer un stream !`)
    .setDescription(`En direct dans <#${channelId}> · [Rejoindre](${url})`)
    .setTimestamp();
  const mention = cfg.mention_role_id ? `<@&${cfg.mention_role_id}> ` : '';
  await alertChan.send({ content: `${mention}<@${discordId}>`, embeds: [embed], allowedMentions: { users: [discordId], roles: cfg.mention_role_id ? [cfg.mention_role_id] : [] } }).catch(() => null);
  await enqueuePush(discordId, '📺 Tu streames en direct !', `Ta communauté peut te rejoindre dans <#${channelId}>`, '/app');
}

async function handleGoLiveEnd(client: Client, discordId: string): Promise<void> {
  const { data: openRow } = await supabase.from('live_stream_sessions').select('id, started_at').eq('discord_id', discordId).eq('source', 'discord_go_live').is('ended_at', null).order('id', { ascending: false }).limit(1).maybeSingle();
  if (!openRow) return;
  const startedMs = new Date((openRow as { started_at: string }).started_at).getTime();
  const durationSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  // +50 PULSE per 15 min streamed, capped at 500 per session.
  const cfg = getStreamConfig();
  const perQuarter = cfg.reward_pulse ?? 50;
  const reward = Math.min(500, Math.floor(durationSec / 900) * perQuarter);
  await supabase.from('live_stream_sessions').update({
    ended_at: new Date().toISOString(),
    duration_seconds: durationSec,
    reward_pulse: reward,
  }).eq('id', (openRow as { id: number }).id);
  if (reward > 0) await earnPulse(discordId, reward, `Discord Go Live reward (${Math.floor(durationSec / 60)}min)`, `go_live:${(openRow as { id: number }).id}`).catch(() => null);
  if (cfg.streamer_role_id) {
    try {
      // Best-effort: only the guild that hosted the stream is guaranteed to
      // still know the member. Since we don't stash guildId per row, try all
      // guilds we're in.
      for (const guild of client.guilds.cache.values()) {
        const m = await guild.members.fetch(discordId).catch(() => null);
        if (m?.roles.cache.has(cfg.streamer_role_id)) {
          await m.roles.remove(cfg.streamer_role_id, 'Go Live ended').catch(() => null);
          break;
        }
      }
    } catch { /* ignore */ }
  }
}

export function rehydrateVoiceSessions(client: Client): void {
  const now = Date.now();
  let count = 0;
  for (const guild of client.guilds.cache.values()) {
    for (const [memberId, state] of guild.voiceStates.cache) {
      if (!state.channelId || state.member?.user.bot) continue;
      if (voiceSessions.has(memberId)) continue;
      voiceSessions.set(memberId, {
        channelId: state.channelId,
        joinedAt: now,
        username: state.member?.user.username ?? 'unknown',
        avatarUrl: state.member?.user.displayAvatarURL({ size: 128 }) ?? null,
        guildId: guild.id,
      });
      count++;
    }
  }
  if (count > 0) log('INFO', `Rehydrated ${count} active voice session(s)`);
}

export function startVoiceSessionCleanup(client: Client): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(async () => {
    const now = Date.now();
    for (const [discordId, session] of voiceSessions) {
      if (now - session.joinedAt > MAX_SESSION_MS) {
        await flushSession(client, discordId, 'auto-flush');
      }
    }
  }, CLEANUP_INTERVAL_MS);
}

export function stopVoiceSessionCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
