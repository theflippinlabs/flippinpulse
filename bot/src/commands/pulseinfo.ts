import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getBalance } from '../services/economy.js';
import { pulseEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('pulseinfo')
  .setDescription('Admin: view any member\'s PULSE stats')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  const target = interaction.options.getUser('user', true);
  const bal = await getBalance(target.id);

  if (!bal) {
    await interaction.editReply({ embeds: [errorEmbed(en
      ? `<@${target.id}> has no account yet.`
      : `<@${target.id}> n'a pas encore de compte.`)] });
    return;
  }

  const embed = pulseEmbed(en ? `PULSE stats — ${target.username}` : `Stats PULSE — ${target.username}`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: en ? 'Balance' : 'Solde',                   value: `**${bal.balance}** PULSE`, inline: true },
      { name: en ? 'Lifetime earned' : 'Gagné à vie',     value: `${bal.earned}`, inline: true },
      { name: en ? 'Lifetime spent'  : 'Dépensé à vie',   value: `${bal.spent}`,  inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
}
