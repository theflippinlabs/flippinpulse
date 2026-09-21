import { Message } from 'discord.js';
import { isOnCooldown } from '../services/antiSpam.js';
import { awardPoints } from '../services/points.js';
import { getPointsConfig } from '../services/settings.js';
import { runAutomod } from '../services/automod.js';
import { runAIModCheck } from '../services/aiModeration.js';
import { recordActivity, maybeReply } from '../services/pulsar.js';
import { recordChallengeMetric } from '../services/challenges.js';
import { handleCompanionDM } from '../services/aiCompanionDM.js';

export async function handleMessageCreate(message: Message): Promise<void> {
  if (message.author.bot) return;

  // DMs → personal AI companion
  if (!message.guild) {
    void handleCompanionDM(message);
    return;
  }

  if (!message.member) return;

  const blocked = await runAutomod(message);
  if (blocked) return;

  // AI moderation runs after the fast regex/spam checks — it makes a network
  // call, so we let it work in the background instead of stalling every message.
  void runAIModCheck(message);

  recordActivity(message);
  void maybeReply(message);
  void recordChallengeMetric(message.client, message.author.id, message.author.username, 'messages');

  const discordId = message.author.id;
  if (isOnCooldown(discordId, 'message')) return;

  const config = getPointsConfig();
  await awardPoints({
    discordId,
    username: message.author.username,
    avatarUrl: message.author.displayAvatarURL({ size: 128 }),
    type: 'message',
    channelId: message.channelId,
    points: config.message,
    guild: message.guild,
    member: message.member,
  });
}
