import { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { runWithGuild } from '../guildContext.js';
import { findRoleForReaction } from '../services/reactionRoles.js';
import { log } from '../utils/logger.js';

export async function handleMessageReactionRemove(
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

  const roleId = await runWithGuild(guild.id, () => findRoleForReaction(reaction as MessageReaction));
  if (!roleId) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  await member.roles.remove(roleId).catch(err =>
    log('ERROR', `Failed to remove reaction role ${roleId} from ${user.id}`, err),
  );
}
