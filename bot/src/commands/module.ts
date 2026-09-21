import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getRawSetting, setSetting } from '../services/settings.js';
import { successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

const LABELS_FR: Record<string, string> = {
  welcome: 'Messages de bienvenue',
  rankup: 'Annonces de niveau',
  automod: 'Auto-modération',
  pulsehour: 'Pulse Hour (multiplicateur de points)',
  dailycap: 'Plafond PULSE journalier',
  streak: 'Bonus de série d\'activité',
  decay: 'Décroissance des points d\'inactivité',
};

// module name -> { settings key, boolean field inside the JSON }
const MODULES: Record<string, { key: string; field: string; label: string }> = {
  welcome: { key: 'welcome_config', field: 'enabled', label: 'Welcome messages' },
  rankup: { key: 'rank_up_config', field: 'enabled', label: 'Rank-up announcements' },
  automod: { key: 'mod_config', field: 'automod_enabled', label: 'Auto-moderation' },
  pulsehour: { key: 'pulse_hour', field: 'enabled', label: 'Pulse Hour (point multiplier)' },
  dailycap: { key: 'daily_cap_config', field: 'enabled', label: 'Daily PULSE cap' },
  streak: { key: 'streak_config', field: 'enabled', label: 'Activity streak bonus' },
  decay: { key: 'decay', field: 'enabled', label: 'Inactivity point decay' },
};

export const data = new SlashCommandBuilder()
  .setName('module')
  .setDescription('Admin: turn a bot feature on or off')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o =>
    o.setName('feature').setDescription('Which feature').setRequired(true).addChoices(
      { name: 'Welcome messages', value: 'welcome' },
      { name: 'Rank-up announcements', value: 'rankup' },
      { name: 'Auto-moderation', value: 'automod' },
      { name: 'Pulse Hour', value: 'pulsehour' },
      { name: 'Daily PULSE cap', value: 'dailycap' },
      { name: 'Streak bonus', value: 'streak' },
      { name: 'Point decay', value: 'decay' },
    )
  )
  .addBooleanOption(o => o.setName('enabled').setDescription('On (true) or off (false)').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';

  const feature = interaction.options.getString('feature', true);
  const enabled = interaction.options.getBoolean('enabled', true);
  const mod = MODULES[feature];

  if (!mod) {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Unknown feature.' : 'Fonctionnalité inconnue.')] });
    return;
  }

  const current = { ...(getRawSetting(mod.key) ?? {}) } as Record<string, unknown>;
  current[mod.field] = enabled;

  try {
    await setSetting(mod.key, current);
  } catch {
    await interaction.editReply({ embeds: [errorEmbed(en ? 'Failed to save. Try again.' : 'Échec de la sauvegarde. Réessaie.')] });
    return;
  }

  const label = en ? mod.label : (LABELS_FR[feature] ?? mod.label);
  const stateOn = en ? 'ON ✅' : 'ACTIF ✅';
  const stateOff = en ? 'OFF ⛔' : 'INACTIF ⛔';
  await interaction.editReply({
    embeds: [successEmbed(en
      ? `**${label}** is now **${enabled ? stateOn : stateOff}**.\n*(Takes effect within a minute.)*`
      : `**${label}** est maintenant **${enabled ? stateOn : stateOff}**.\n*(Effet dans la minute.)*`)],
  });
}
