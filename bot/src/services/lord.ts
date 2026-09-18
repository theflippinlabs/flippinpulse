import { GuildMember, Interaction, MessageFlags } from 'discord.js';
import { errorEmbed } from '../utils/embeds.js';

const LORD_ROLE_NAME = 'Lord';

// A member is a "Lord" if they hold a role named "Lord" (case-insensitive)
// or the role ID in LORD_ROLE_ID, or if they are the server owner.
export function memberIsLord(member: GuildMember | null): boolean {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  const envId = (process.env.LORD_ROLE_ID ?? '').trim();
  if (envId && member.roles.cache.has(envId)) return true;
  return member.roles.cache.some(r => r.name.toLowerCase() === LORD_ROLE_NAME.toLowerCase());
}

// Guards a slash / button / modal interaction: if the invoker is not a Lord,
// replies with an error and returns false so callers can early-return.
export async function requireLord(interaction: Interaction): Promise<boolean> {
  if (!interaction.inGuild()) return false;
  const member = interaction.member && 'guild' in interaction.member
    ? (interaction.member as GuildMember)
    : await interaction.guild?.members.fetch(interaction.user.id).catch(() => null) ?? null;

  if (memberIsLord(member)) return true;

  if (interaction.isRepliable()) {
    await interaction.reply({
      embeds: [errorEmbed(`This is Lord-only — you need the **${LORD_ROLE_NAME}** role.`)],
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
  }
  return false;
}
