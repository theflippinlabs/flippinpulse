import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  GuildTextBasedChannel,
  Interaction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import {
  getRawSetting, setSetting,
  getWelcomeConfig, getRankUpConfig, getModConfig, getPulseHourConfig,
  getDailyCapConfig, getStreakConfig, getDecayConfig,
} from '../services/settings.js';
import { getAutoQuizConfig, launchQuiz } from '../services/communityQuiz.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { log } from '../utils/logger.js';

interface Module {
  label: string;
  emoji: string;
  settingKey: string;
  field: string;
  read: () => boolean;
}

const MODULES: Record<string, Module> = {
  welcome: { label: 'Welcome messages', emoji: '👋', settingKey: 'welcome_config', field: 'enabled', read: () => getWelcomeConfig().enabled },
  rankup: { label: 'Rank-up announcements', emoji: '🚀', settingKey: 'rank_up_config', field: 'enabled', read: () => getRankUpConfig().enabled },
  automod: { label: 'Auto-moderation', emoji: '🛡️', settingKey: 'mod_config', field: 'automod_enabled', read: () => getModConfig().automod_enabled },
  pulsehour: { label: 'Pulse Hour', emoji: '⚡', settingKey: 'pulse_hour', field: 'enabled', read: () => getPulseHourConfig().enabled },
  dailycap: { label: 'Daily PULSE cap', emoji: '🧢', settingKey: 'daily_cap_config', field: 'enabled', read: () => getDailyCapConfig().enabled },
  streak: { label: 'Streak bonus', emoji: '🔥', settingKey: 'streak_config', field: 'enabled', read: () => getStreakConfig().enabled },
  decay: { label: 'Point decay', emoji: '📉', settingKey: 'decay', field: 'enabled', read: () => getDecayConfig().enabled },
  autoquiz: { label: 'Automatic daily quiz', emoji: '🧠', settingKey: 'auto_quiz', field: 'enabled', read: () => getAutoQuizConfig().enabled },
};

function panelEmbed() {
  const lines = Object.values(MODULES).map(m => `${m.read() ? '✅' : '⛔'} ${m.emoji} ${m.label}`);
  return pulseEmbed('🛠️ Pulse Engine — Admin Panel')
    .setDescription(
      'Tap a feature in the menu to turn it **on/off**, or use the buttons below.\n\n' +
      lines.join('\n') +
      '\n\n*Other actions still have their own commands (e.g. `/givepulse`, `/shopadmin`).*'
    );
}

function panelComponents() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('panel:toggle')
    .setPlaceholder('⚙️ Turn a feature on/off')
    .addOptions(Object.entries(MODULES).map(([key, m]) => ({
      label: m.label,
      value: key,
      emoji: m.emoji,
      description: m.read() ? 'Currently ON — tap to turn off' : 'Currently OFF — tap to turn on',
    })));

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('panel:quiznow').setLabel('Launch quiz now').setEmoji('🧠').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('panel:refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
  );

  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), buttons];
}

export const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Admin: open the control panel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply({ embeds: [panelEmbed()], components: panelComponents(), flags: MessageFlags.Ephemeral });
}

// Handles panel button + select interactions (routed from interactionCreate).
export async function handlePanelInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isStringSelectMenu() && interaction.customId === 'panel:toggle') {
    const key = interaction.values[0];
    const m = MODULES[key];
    if (!m) { await interaction.deferUpdate().catch(() => {}); return; }
    const current = { ...(getRawSetting(m.settingKey) ?? {}) } as Record<string, unknown>;
    current[m.field] = !m.read();
    try {
      await setSetting(m.settingKey, current);
    } catch (err) {
      log('ERROR', 'Panel toggle failed', err);
    }
    await interaction.update({ embeds: [panelEmbed()], components: panelComponents() });
    return;
  }

  if (interaction.isButton() && interaction.customId === 'panel:refresh') {
    await interaction.update({ embeds: [panelEmbed()], components: panelComponents() });
    return;
  }

  if (interaction.isButton() && interaction.customId === 'panel:quiznow') {
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.reply({ embeds: [errorEmbed('Use this in a text channel.')], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [successEmbed('Launching a quiz here now! 🧠 (generating questions…)')], flags: MessageFlags.Ephemeral });
    void launchQuiz(channel as GuildTextBasedChannel, getAutoQuizConfig());
    return;
  }
}
