import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getRawSetting, setSetting } from '../services/settings.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';

// knob -> { settings key, numeric field }
const KNOBS: Record<string, { key: string; field: string; label: string }> = {
  pulse_per_point: { key: 'economy', field: 'pulse_per_point', label: 'PULSE earned per activity point' },
  points_message: { key: 'points_config', field: 'message', label: 'Points per message' },
  points_reaction: { key: 'points_config', field: 'reaction', label: 'Points per reaction' },
  points_voice: { key: 'points_config', field: 'voice_per_minute', label: 'Points per voice minute' },
  points_invite: { key: 'points_config', field: 'invite', label: 'Points per invite' },
  points_event: { key: 'points_config', field: 'event', label: 'Points per event' },
};

export const data = new SlashCommandBuilder()
  .setName('seteconomy')
  .setDescription('Admin: tune the points / PULSE economy')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o =>
    o.setName('setting').setDescription('What to change').setRequired(true).addChoices(
      { name: 'PULSE per point', value: 'pulse_per_point' },
      { name: 'Points per message', value: 'points_message' },
      { name: 'Points per reaction', value: 'points_reaction' },
      { name: 'Points per voice minute', value: 'points_voice' },
      { name: 'Points per invite', value: 'points_invite' },
      { name: 'Points per event', value: 'points_event' },
    )
  )
  .addNumberOption(o => o.setName('value').setDescription('New value').setMinValue(0).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const setting = interaction.options.getString('setting', true);
  const value = interaction.options.getNumber('value', true);
  const knob = KNOBS[setting];

  if (!knob) {
    await interaction.editReply({ embeds: [errorEmbed('Unknown setting.')] });
    return;
  }

  const current = { ...(getRawSetting(knob.key) ?? {}) } as Record<string, unknown>;
  current[knob.field] = value;

  try {
    await setSetting(knob.key, current);
  } catch {
    await interaction.editReply({ embeds: [errorEmbed('Failed to save. Try again.')] });
    return;
  }

  await interaction.editReply({
    embeds: [successEmbed(`**${knob.label}** is now **${value}**.\n*(Takes effect within a minute.)*`)],
  });
}
