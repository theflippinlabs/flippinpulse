import { Message } from 'discord.js';
import { isOnCooldown } from '../services/antiSpam.js';
import { awardPoints } from '../services/points.js';
import { getPointsConfig } from '../services/settings.js';
import { runAutomod } from '../services/automod.js';
import { recordActivity, maybeReply } from '../services/pulsar.js';

export async function handleMessageCreate(message: Message): Promise<void> {
  if (message.author.bot || !message.guild || !message.member) return;

  const blocked = await runAutomod(message);
  if (blocked) return;

  recordActivity(message);
  void maybeReply(message);

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
