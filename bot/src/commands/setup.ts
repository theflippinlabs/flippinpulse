import {
  ActionRowBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ChannelSelectMenuBuilder,
  ChannelSelectMenuInteraction,
  RoleSelectMenuBuilder,
  RoleSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Interaction,
} from 'discord.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getRawSetting, setSetting } from '../services/settings.js';
import { log } from '../utils/logger.js';

/**
 * Interactive first-boot wizard for a Lord.
 *
 * One ephemeral message with a select menu that lists every group of
 * settings. Picking a group swaps in the matching channel-select,
 * role-select or modal. Every save round-trips through the same
 * settings service the /module and /seteconomy commands already
 * write to, so nothing new has to run in the bot to pick up changes
 * (settings.ts polls every 60 s).
 */

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Admin: interactive setup wizard for a new server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

type SectionKey =
  | 'welcome_channel'
  | 'modlog_channel'
  | 'announce_channel'
  | 'calendar_channel'
  | 'stream_channel'
  | 'lottery_channel'
  | 'quiz_channel'
  | 'rankup_channel'
  | 'streamer_role'
  | 'mention_role'
  | 'economy_message'
  | 'economy_pulse_per_point';

interface Section {
  label: string;
  description: string;
  emoji: string;
  kind: 'channel' | 'role' | 'modal';
}

const SECTIONS: Record<SectionKey, Section> = {
  welcome_channel:         { label: 'Salon bienvenue',    description: 'Où le bot poste "bienvenue"',        emoji: '👋', kind: 'channel' },
  modlog_channel:          { label: 'Salon mod-log',      description: 'Log de warn / mute / ban / clear',   emoji: '🛡️', kind: 'channel' },
  announce_channel:        { label: 'Salon annonces',     description: 'Cible par défaut du dashboard',      emoji: '📢', kind: 'channel' },
  calendar_channel:        { label: 'Salon calendrier',   description: 'Rappels 15 min avant chaque event',  emoji: '📅', kind: 'channel' },
  stream_channel:          { label: 'Salon alertes live', description: 'Twitch / YouTube / X / Discord live', emoji: '🎥', kind: 'channel' },
  lottery_channel:         { label: 'Salon loterie',      description: 'Annonces des tirages',               emoji: '🎫', kind: 'channel' },
  quiz_channel:            { label: 'Salon quiz auto',    description: 'Où l\'AutoQuiz publie les rounds',   emoji: '❓', kind: 'channel' },
  rankup_channel:          { label: 'Salon montée rang',  description: 'Annonces "X passe au rang Y"',       emoji: '⭐', kind: 'channel' },
  streamer_role:           { label: 'Rôle "en stream"',   description: 'Attribué pendant un live',           emoji: '🎬', kind: 'role' },
  mention_role:            { label: 'Rôle à ping live',   description: 'Mentionné quand un membre passe live', emoji: '🔔', kind: 'role' },
  economy_message:         { label: 'Points par message', description: 'Points d\'activité par message',    emoji: '💬', kind: 'modal' },
  economy_pulse_per_point: { label: 'PULSE par point',    description: 'Conversion points → PULSE',          emoji: '💰', kind: 'modal' },
};

// Each SectionKey maps to the settings row we mutate + the JSON field.
const KEY_MAP: Record<SectionKey, { settingKey: string; jsonField: string }> = {
  welcome_channel:         { settingKey: 'welcome_config',    jsonField: 'channel_id' },
  modlog_channel:          { settingKey: 'mod_config',        jsonField: 'mod_log_channel_id' },
  announce_channel:        { settingKey: 'announce_config',   jsonField: 'channel_id' },
  calendar_channel:        { settingKey: 'calendar_config',   jsonField: 'channel_id' },
  stream_channel:          { settingKey: 'stream_config',     jsonField: 'alert_channel_id' },
  lottery_channel:         { settingKey: 'lottery_config',    jsonField: 'announce_channel_id' },
  quiz_channel:            { settingKey: 'auto_quiz',         jsonField: 'channel_id' },
  rankup_channel:          { settingKey: 'rank_up_config',    jsonField: 'channel_id' },
  streamer_role:           { settingKey: 'stream_config',     jsonField: 'streamer_role_id' },
  mention_role:            { settingKey: 'stream_config',     jsonField: 'mention_role_id' },
  economy_message:         { settingKey: 'points_config',     jsonField: 'message' },
  economy_pulse_per_point: { settingKey: 'economy',           jsonField: 'pulse_per_point' },
};

function buildMenuRow(): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = (Object.entries(SECTIONS) as [SectionKey, Section][]).map(([k, s]) => ({
    label: s.label,
    value: k,
    description: s.description,
    emoji: s.emoji,
  }));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup:pick')
      .setPlaceholder('Choisis un réglage à configurer…')
      .addOptions(options),
  );
}

function statusEmbed(guildName: string) {
  const modConfig = (getRawSetting('mod_config') ?? {}) as Record<string, unknown>;
  const streamConfig = (getRawSetting('stream_config') ?? {}) as Record<string, unknown>;
  const welcomeConfig = (getRawSetting('welcome_config') ?? {}) as Record<string, unknown>;
  const lotteryConfig = (getRawSetting('lottery_config') ?? {}) as Record<string, unknown>;
  const quizConfig = (getRawSetting('auto_quiz') ?? {}) as Record<string, unknown>;
  const rankConfig = (getRawSetting('rank_up_config') ?? {}) as Record<string, unknown>;
  const calendarConfig = (getRawSetting('calendar_config') ?? {}) as Record<string, unknown>;
  const announceConfig = (getRawSetting('announce_config') ?? {}) as Record<string, unknown>;
  const points = (getRawSetting('points_config') ?? {}) as Record<string, unknown>;
  const economy = (getRawSetting('economy') ?? {}) as Record<string, unknown>;

  const line = (label: string, value: unknown) =>
    value ? `✅ ${label} : ${typeof value === 'string' && /^\d{15,20}$/.test(value) ? `<#${value}>` : String(value)}` : `⬜ ${label}`;
  const roleLine = (label: string, value: unknown) =>
    value ? `✅ ${label} : <@&${String(value)}>` : `⬜ ${label}`;

  return pulseEmbed(`⚙️ Setup — ${guildName}`).setDescription(
    [
      '**📢 Salons**',
      line('Bienvenue', welcomeConfig.channel_id),
      line('Mod-log', modConfig.mod_log_channel_id),
      line('Annonces', announceConfig.channel_id),
      line('Calendrier', calendarConfig.channel_id),
      line('Alertes live', streamConfig.alert_channel_id),
      line('Loterie', lotteryConfig.announce_channel_id),
      line('AutoQuiz', quizConfig.channel_id),
      line('Rank-up', rankConfig.channel_id),
      '',
      '**🎭 Rôles**',
      roleLine('En stream', streamConfig.streamer_role_id),
      roleLine('Ping live', streamConfig.mention_role_id),
      '',
      '**💰 Économie**',
      line('Points par message', points.message),
      line('PULSE par point', economy.pulse_per_point),
      '',
      '_Choisis un réglage dans le menu ci-dessous pour le configurer._',
    ].join('\n'),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ embeds: [errorEmbed('Réservé aux admins.')], flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    embeds: [statusEmbed(interaction.guild?.name ?? 'ce serveur')],
    components: [buildMenuRow()],
    flags: MessageFlags.Ephemeral,
  });
}

// ============================================================
// Interaction router — called from events/interactionCreate.ts for
// any customId starting with `setup:`.
// ============================================================
export async function handleSetupInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isMessageComponent() && !interaction.isModalSubmit()) return;
  if (!('customId' in interaction) || !interaction.customId.startsWith('setup:')) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    if (interaction.isRepliable()) {
      await interaction.reply({ embeds: [errorEmbed('Réservé aux admins.')], flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    return;
  }

  // Section menu: swap in the matching selector or modal.
  if (interaction.isStringSelectMenu() && interaction.customId === 'setup:pick') {
    const key = interaction.values[0] as SectionKey;
    const section = SECTIONS[key];
    if (!section) {
      await (interaction as StringSelectMenuInteraction).reply({ embeds: [errorEmbed('Réglage inconnu.')], flags: MessageFlags.Ephemeral });
      return;
    }

    if (section.kind === 'channel') {
      const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`setup:channel:${key}`)
          .setChannelTypes(ChannelType.GuildText)
          .setPlaceholder(section.label)
          .setMinValues(1).setMaxValues(1),
      );
      await (interaction as StringSelectMenuInteraction).update({
        embeds: [pulseEmbed(`${section.emoji} ${section.label}`).setDescription(section.description)],
        components: [row, buildMenuRow()],
      });
      return;
    }

    if (section.kind === 'role') {
      const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`setup:role:${key}`)
          .setPlaceholder(section.label)
          .setMinValues(1).setMaxValues(1),
      );
      await (interaction as StringSelectMenuInteraction).update({
        embeds: [pulseEmbed(`${section.emoji} ${section.label}`).setDescription(section.description)],
        components: [row, buildMenuRow()],
      });
      return;
    }

    // Numeric modal for economy knobs.
    const modal = new ModalBuilder()
      .setCustomId(`setup:modal:${key}`)
      .setTitle(section.label)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('value')
            .setLabel(section.label)
            .setPlaceholder(section.description)
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
    await (interaction as StringSelectMenuInteraction).showModal(modal);
    return;
  }

  if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('setup:channel:')) {
    const key = interaction.customId.split(':')[2] as SectionKey;
    const channelId = (interaction as ChannelSelectMenuInteraction).values[0];
    await persistScalar(key, channelId);
    await (interaction as ChannelSelectMenuInteraction).update({
      embeds: [statusEmbed(interaction.guild?.name ?? 'ce serveur'), successEmbed(`✅ ${SECTIONS[key].label} → <#${channelId}>`)],
      components: [buildMenuRow()],
    });
    return;
  }

  if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('setup:role:')) {
    const key = interaction.customId.split(':')[2] as SectionKey;
    const roleId = (interaction as RoleSelectMenuInteraction).values[0];
    await persistScalar(key, roleId);
    await (interaction as RoleSelectMenuInteraction).update({
      embeds: [statusEmbed(interaction.guild?.name ?? 'ce serveur'), successEmbed(`✅ ${SECTIONS[key].label} → <@&${roleId}>`)],
      components: [buildMenuRow()],
    });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('setup:modal:')) {
    const modal = interaction as ModalSubmitInteraction;
    const key = modal.customId.split(':')[2] as SectionKey;
    const raw = modal.fields.getTextInputValue('value').trim();
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      await modal.reply({ embeds: [errorEmbed('Valeur invalide — entier positif attendu.')], flags: MessageFlags.Ephemeral });
      return;
    }
    await persistScalar(key, n);
    await modal.reply({ embeds: [successEmbed(`✅ ${SECTIONS[key].label} → ${n}`)], flags: MessageFlags.Ephemeral });
    return;
  }

  // Unrelated setup:* interaction — silently ignore so it doesn't crash the handler.
  void interaction;
  void ButtonInteraction; // keep the import used
}

async function persistScalar(key: SectionKey, value: unknown): Promise<void> {
  const { settingKey, jsonField } = KEY_MAP[key];
  const current = { ...((getRawSetting(settingKey) ?? {}) as Record<string, unknown>) };
  current[jsonField] = value;
  try {
    await setSetting(settingKey, current);
  } catch (err) {
    log('ERROR', `setup persistScalar failed for ${key}`, err);
  }
}
