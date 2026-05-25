import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getBalance } from '../services/economy.js';
import { pulseEmbed, errorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('pulseinfo')
  .setDescription('Admin: view any member\'s PULSE stats')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const target = interaction.options.getUser('user', true);
  const bal = await getBalance(target.id);

  if (!bal) {
    await interaction.editReply({ embeds: [errorEmbed(`<@${target.id}> has no account yet.`)] });
    return;
  }

  const embed = pulseEmbed(`PULSE stats — ${target.username}`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: 'Balance', value: `**${bal.balance}** PULSE`, inline: true },
      { name: 'Lifetime earned', value: `${bal.earned}`, inline: true },
      { name: 'Lifetime spent', value: `${bal.spent}`, inline: true },
    );

  await interaction.editReply({ embeds: [embed] });
}
