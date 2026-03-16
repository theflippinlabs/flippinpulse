import { VoiceState } from 'discord.js';
import { awardPoints } from '../services/points.js';
import { getPointsConfig } from '../services/settings.js';
import { log } from '../utils/logger.js';

const voiceSessions = new Map<string, { channelId: string; joinedAt: number }>();

export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const user = newState.member?.user ?? oldState.member?.user;
  if (!user || user.bot) return;

  const discordId = user.id;
  const guild = newState.guild ?? oldState.guild;
  const member = newState.member ?? oldState.member;
  if (!guild || !member) return;

  // User joined a voice channel
  if (!oldState.channelId && newState.channelId) {
    voiceSessions.set(discordId, {
      channelId: newState.channelId,
      joinedAt: Date.now(),
    });
    return;
  }

  // User left a voice channel
  if (oldState.channelId && !newState.channelId) {
    const session = voiceSessions.get(discordId);
    voiceSessions.delete(discordId);
    if (!session) return;

    const durationMinutes = Math.floor((Date.now() - session.joinedAt) / 60_000);
    if (durationMinutes < 1) return;

    const config = getPointsConfig();
    const points = durationMinutes * config.voice_per_minute;

    await awardPoints({
      discordId,
      username: user.username,
      avatarUrl: user.displayAvatarURL({ size: 128 }),
      type: 'voice',
      channelId: session.channelId,
      points,
      guild,
      member,
    });

    log('INFO', `Voice points: ${discordId} ${durationMinutes}min → ${points}pts`);
    return;
  }

  // User switched channels — update session
  if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    const existing = voiceSessions.get(discordId);
    if (existing) {
      voiceSessions.set(discordId, { ...existing, channelId: newState.channelId });
    }
  }
}
