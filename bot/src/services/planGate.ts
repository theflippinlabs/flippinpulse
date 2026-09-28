import { ChatInputCommandInteraction, MessageFlags, EmbedBuilder } from 'discord.js';
import { guildCan } from './plan.js';

/**
 * Refuses a slash command execution if the guild's current plan does NOT
 * include the requested feature. Replies with an "upgrade" embed pointing
 * to the /billing command and returns false, so the caller can bail early:
 *
 *   if (!await requirePlan(interaction, 'pets', 'Pro')) return;
 *
 * The plan cache in plan.ts already TTLs subscription lookups, so this
 * runs cheap on the hot path.
 */
export async function requirePlan(
  interaction: ChatInputCommandInteraction,
  feature: Parameters<typeof guildCan>[1],
  planLabel: string,
): Promise<boolean> {
  const guildId = interaction.guildId ?? null;
  const ok = await guildCan(guildId, feature);
  if (ok) return true;

  const embed = new EmbedBuilder()
    .setColor(0xF5B62E)
    .setTitle('🔒 Fonctionnalité incluse à partir du plan ' + planLabel)
    .setDescription(
      `Cette fonctionnalité fait partie du plan **${planLabel}** de Novarys.\n\n` +
      `Ouvre \`/billing\` pour voir les plans et faire un upgrade — accès instantané dès le paiement.`
    );

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed] }).catch(() => null);
  } else {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
  }
  return false;
}
