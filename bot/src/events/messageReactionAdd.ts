import { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { runWithGuild } from '../guildContext.js';
import { isOnCooldown } from '../services/antiSpam.js';
import { awardPoints } from '../services/points.js';
import { getPointsConfig } from '../services/settings.js';
import { findRoleForReaction } from '../services/reactionRoles.js';
import { recordChallengeMetric } from '../services/challenges.js';
import { log } from '../utils/logger.js';

export async function handleMessageReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<void> {
  if (user.bot) return;

  if (reaction.partial) {
    try { reaction = await reaction.fetch(); } catch { return; }
  }
  if (user.partial) {
    try { user = await user.fetch(); } catch { return; }
  }

  const guild = reaction.message.guild;
  if (!guild) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  const resolvedUser = user;

  await runWithGuild(guild.id, async () => {
    const roleId = await findRoleForReaction(reaction as MessageReaction);
    if (roleId) {
      await member.roles.add(roleId).catch(err =>
        log('ERROR', `Failed to add reaction role ${roleId} to ${resolvedUser.id}`, err),
      );
    }

    const discordId = resolvedUser.id;
    void recordChallengeMetric(reaction.client, discordId, resolvedUser.username ?? 'unknown', 'reactions');
    if (isOnCooldown(discordId, 'reaction')) return;

    const config = getPointsConfig();
    await awardPoints({
      discordId,
      username: resolvedUser.username ?? 'unknown',
      avatarUrl: resolvedUser.displayAvatarURL({ size: 128 }),
      type: 'reaction',
      channelId: reaction.message.channelId,
      points: config.reaction,
      guild,
      member,
    });
  });
}
