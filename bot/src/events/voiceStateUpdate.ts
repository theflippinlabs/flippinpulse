import { Client, VoiceState } from 'discord.js';
import { awardPoints } from '../services/points.js';
import { getPointsConfig } from '../services/settings.js';
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
