import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { countWarnings, logAndAnnounce } from '../services/moderation.js';
import { getModConfig } from '../services/settings.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Issue a warning to a member')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Server only.' : 'Uniquement en serveur.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);

  if (target.bot) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Cannot warn a bot.' : 'Impossible d\'avertir un bot.')] });
    return;
  }
  if (target.id === interaction.user.id) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'You cannot warn yourself.' : 'Tu ne peux pas t\'avertir toi-même.')] });
    return;
  }

  await logAndAnnounce(interaction.guild, {
    guildId: interaction.guild.id,
    type: 'warn',
    targetId: target.id,
    moderatorId: interaction.user.id,
    reason,
  });

  const count = await countWarnings(interaction.guild.id, target.id);
  const threshold = getModConfig().auto_warn_threshold;

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (member) {
    const targetLocale = await getUserLocale(target.id);
    const ten = targetLocale === 'en';
    await member.send({
      embeds: [errorEmbed(ten
        ? `You were warned in **${interaction.guild.name}**.\nReason: ${reason}\nTotal warnings: ${count}`
        : `Tu as reçu un avertissement dans **${interaction.guild.name}**.\nRaison : ${reason}\nAvertissements totaux : ${count}`)],
    }).catch(() => null);
  }

  let note = '';
  if (threshold > 0 && count >= threshold) {
    note = en
      ? `\n⚠️ User has reached **${count}** warnings (threshold: ${threshold}). Consider escalating.`
      : `\n⚠️ L'utilisateur a atteint **${count}** avertissements (seuil : ${threshold}). Envisage une escalade.`;
  }

  await interaction.editReply({
    embeds: [successEmbed(en
      ? `Warned <@${target.id}>. Total warnings: **${count}**.${note}`
      : `<@${target.id}> averti. Avertissements totaux : **${count}**.${note}`)],
  });
}
