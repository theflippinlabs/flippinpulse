import { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { isOnCooldown } from '../services/antiSpam.js';
import { awardPoints } from '../services/points.js';
import { getPointsConfig } from '../services/settings.js';

export async function handleMessageReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (user.bot) return;

  // Fetch partials if needed
  if (reaction.partial) {
    try { reaction = await reaction.fetch(); } catch { return; }
  }
  if (user.partial) {
    try { user = await user.fetch(); } catch { return; }
  }

  const guild = reaction.message.guild;
  if (!guild) return;

  const discordId = user.id;
  if (isOnCooldown(discordId, 'reaction')) return;

  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;

  const config = getPointsConfig();
  await awardPoints({
    discordId,
    username: user.username,
    avatarUrl: user.displayAvatarURL({ size: 128 }),
    type: 'reaction',
    channelId: reaction.message.channelId,
    points: config.reaction,
    guild,
    member,
  });
}
