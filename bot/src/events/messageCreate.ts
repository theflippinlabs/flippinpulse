import { Message } from 'discord.js';
import { isOnCooldown } from '../services/antiSpam.js';
import { awardPoints } from '../services/points.js';
import { getPointsConfig } from '../services/settings.js';

export async function handleMessageCreate(message: Message): Promise<void> {
  if (message.author.bot || !message.guild || !message.member) return;

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
