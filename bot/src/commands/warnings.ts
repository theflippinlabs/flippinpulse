import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { listWarnings } from '../services/moderation.js';
import { errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('List warnings for a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('User to inspect').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Server only.' : 'Uniquement en serveur.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const warnings = await listWarnings(interaction.guild.id, target.id);
  const titleWarnings = en ? 'Warnings' : 'Avertissements';

  if (!warnings.length) {
    await interaction.editReply({ embeds: [new EmbedBuilder()
      .setTitle(`${titleWarnings} — ${target.username}`)
      .setDescription(en ? 'No warnings on record.' : 'Aucun avertissement enregistré.')
      .setColor(0x22C55E)] });
    return;
  }

  const noReason = en ? '_no reason_' : '_sans raison_';
  const byLbl = en ? 'by' : 'par';
  const lines = warnings.map((w, i) => {
    const ts = Math.floor(new Date(w.created_at).getTime() / 1000);
    return `**${i + 1}.** <t:${ts}:R> — ${byLbl} <@${w.moderator_discord_id ?? 'unknown'}>\n  ${w.reason ?? noReason}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xFACC15)
    .setTitle(`${titleWarnings} — ${target.username}`)
    .setDescription(`${en ? 'Total' : 'Total'} : **${warnings.length}**\n\n${lines.join('\n\n')}`)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
