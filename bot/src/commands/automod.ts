import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getModConfig, setSetting, getRawSetting } from '../services/settings.js';
import { requireLord, memberIsLord } from '../services/lord.js';
import { errorEmbed } from '../utils/embeds.js';
import { log } from '../utils/logger.js';
import { getUserLocale, type Locale } from '../i18n.js';

export const data = new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Lord-only: view and toggle auto-moderation rules')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

interface ModConfig {
  mod_log_channel_id: string | null;
  automod_enabled: boolean;
  anti_spam: { enabled: boolean; max_messages: number; window_seconds: number; mute_seconds: number };
  anti_mass_mentions: { enabled: boolean; max_mentions: number; action: 'delete' | 'warn' };
  anti_invites: { enabled: boolean; action: 'delete' | 'warn' };
  anti_links: { enabled: boolean; whitelist_domains: string[] };
  anti_raid: { enabled: boolean; max_joins: number; window_seconds: number; lockdown_minutes: number };
  auto_warn_threshold: number;
}

function render(cfg: ModConfig, locale: Locale) {
  const en = locale === 'en';
  const line = (on: boolean, name: string, hint: string) =>
    `${on ? '✅' : '⛔'} **${name}** — ${hint}`;

  const modLogLbl = en ? 'Mod-log' : 'Journal mod';
  const notSet = en ? '_not set_' : '_non défini_';
  const spamName = en ? 'Anti-spam' : 'Anti-spam';
  const mentionsName = en ? 'Anti mass-mentions' : 'Anti-mentions';
  const invitesName = en ? 'Anti-invites' : 'Anti-invites';
  const linksName = en ? 'Anti-links' : 'Anti-liens';
  const raidName = en ? 'Anti-raid' : 'Anti-raid';
  const whitelistLbl = en ? 'Whitelist' : 'Liste blanche';
  const noneLbl = en ? '_none_' : '_aucun_';
  const actionLbl = en ? 'Action' : 'Action';
  const joinsLbl = en ? 'joins' : 'joins';
  const lockLbl = en ? 'lock' : 'verrouille';
  const thresholdLine = en
    ? `⚠️ **Auto-warn threshold:** ${cfg.auto_warn_threshold} warnings → auto-mute`
    : `⚠️ **Seuil d'auto-warn :** ${cfg.auto_warn_threshold} avertissements → auto-mute`;
  const footerLine = en
    ? '_Tap a button to toggle. Fine-tuning of numbers happens on the dashboard._'
    : '_Clique un bouton pour toggler. Les réglages fins se font sur le dashboard._';

  const embed = new EmbedBuilder()
    .setColor(cfg.automod_enabled ? 0xF5B62E : 0x6B7280)
    .setTitle(`🛡️ ${en ? 'Auto-moderation' : 'Auto-modération'} — ${cfg.automod_enabled ? (en ? 'ON' : 'ACTIF') : (en ? 'OFF' : 'INACTIF')}`)
    .setDescription(
      `**${modLogLbl}:** ${cfg.mod_log_channel_id ? `<#${cfg.mod_log_channel_id}>` : notSet}\n\n` +
      [
        line(cfg.anti_spam.enabled, spamName,     `${cfg.anti_spam.max_messages} msg / ${cfg.anti_spam.window_seconds}s → mute ${cfg.anti_spam.mute_seconds}s`),
        line(cfg.anti_mass_mentions.enabled, mentionsName, `${cfg.anti_mass_mentions.max_mentions} mentions → ${cfg.anti_mass_mentions.action}`),
        line(cfg.anti_invites.enabled, invitesName, `${actionLbl}: ${cfg.anti_invites.action}`),
        line(cfg.anti_links.enabled, linksName,   `${whitelistLbl}: ${cfg.anti_links.whitelist_domains.length ? cfg.anti_links.whitelist_domains.join(', ') : noneLbl}`),
        line(cfg.anti_raid.enabled, raidName,    `${cfg.anti_raid.max_joins} ${joinsLbl} / ${cfg.anti_raid.window_seconds}s → ${lockLbl} ${cfg.anti_raid.lockdown_minutes}min`),
      ].join('\n') +
      `\n\n${thresholdLine}\n\n${footerLine}`,
    )
    .setTimestamp();

  const onLbl = en ? 'ON' : 'ACTIF';
  const offLbl = en ? 'OFF' : 'INACTIF';
  const masterOn = en ? 'Turn ON master' : 'Master ACTIF';
  const masterOff = en ? 'Turn OFF master' : 'Master INACTIF';

  const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('automod:master').setLabel(cfg.automod_enabled ? masterOff : masterOn).setEmoji(cfg.automod_enabled ? '⛔' : '✅').setStyle(cfg.automod_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('automod:spam').setLabel(`Spam ${cfg.anti_spam.enabled ? onLbl : offLbl}`).setEmoji('🚫').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('automod:mentions').setLabel(`Mentions ${cfg.anti_mass_mentions.enabled ? onLbl : offLbl}`).setEmoji('📢').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId('automod:invites').setLabel(`Invites ${cfg.anti_invites.enabled ? onLbl : offLbl}`).setEmoji('🔗').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('automod:links').setLabel(`${en ? 'Links' : 'Liens'} ${cfg.anti_links.enabled ? onLbl : offLbl}`).setEmoji('🌐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('automod:raid').setLabel(`Raid ${cfg.anti_raid.enabled ? onLbl : offLbl}`).setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const locale = await getUserLocale(interaction.user.id);
  if (!interaction.guild) {
    await interaction.reply({ embeds: [errorEmbed(locale === 'en' ? 'Server only.' : 'Uniquement en serveur.')], flags: MessageFlags.Ephemeral });
    return;
  }
  if (!(await requireLord(interaction))) return;
  const cfg = getModConfig();
  await interaction.reply({ ...render(cfg, locale), flags: MessageFlags.Ephemeral });
}

async function saveModConfig(patch: Partial<ModConfig>): Promise<ModConfig> {
  const current = { ...getModConfig() } as ModConfig;
  const raw = (getRawSetting<Partial<ModConfig>>('mod_config') ?? {}) as Partial<ModConfig>;
  const merged: ModConfig = { ...current, ...patch } as ModConfig;
  if (patch.anti_spam)          merged.anti_spam          = { ...current.anti_spam,          ...patch.anti_spam };
  if (patch.anti_mass_mentions) merged.anti_mass_mentions = { ...current.anti_mass_mentions, ...patch.anti_mass_mentions };
  if (patch.anti_invites)       merged.anti_invites       = { ...current.anti_invites,       ...patch.anti_invites };
  if (patch.anti_links)         merged.anti_links         = { ...current.anti_links,         ...patch.anti_links };
  if (patch.anti_raid)          merged.anti_raid          = { ...current.anti_raid,          ...patch.anti_raid };
  await setSetting('mod_config', { ...raw, ...merged });
  return merged;
}

export async function handleAutomodButton(interaction: ButtonInteraction): Promise<void> {
  const locale = await getUserLocale(interaction.user.id);
  const en = locale === 'en';
  const member = interaction.member && 'guild' in interaction.member ? interaction.member : null;
  if (!memberIsLord(member as never)) {
    await interaction.reply({ embeds: [errorEmbed(en ? 'Lord-only.' : 'Lord uniquement.')], flags: MessageFlags.Ephemeral });
    return;
  }
  const action = interaction.customId.split(':')[1];
  const cur = getModConfig();
  try {
    let next: ModConfig;
    if (action === 'master')     next = await saveModConfig({ automod_enabled: !cur.automod_enabled });
    else if (action === 'spam')     next = await saveModConfig({ anti_spam: { ...cur.anti_spam, enabled: !cur.anti_spam.enabled } });
    else if (action === 'mentions') next = await saveModConfig({ anti_mass_mentions: { ...cur.anti_mass_mentions, enabled: !cur.anti_mass_mentions.enabled } });
    else if (action === 'invites')  next = await saveModConfig({ anti_invites: { ...cur.anti_invites, enabled: !cur.anti_invites.enabled } });
    else if (action === 'links')    next = await saveModConfig({ anti_links: { ...cur.anti_links, enabled: !cur.anti_links.enabled } });
    else if (action === 'raid')     next = await saveModConfig({ anti_raid: { ...cur.anti_raid, enabled: !cur.anti_raid.enabled } });
    else { await interaction.reply({ content: en ? 'Unknown action.' : 'Action inconnue.', flags: MessageFlags.Ephemeral }); return; }
    await interaction.update(render(next, locale));
  } catch (err) {
    log('ERROR', 'automod button failed', err);
    await interaction.reply({ embeds: [errorEmbed(en ? 'Failed to save.' : 'Échec de la sauvegarde.')], flags: MessageFlags.Ephemeral }).catch(() => null);
  }
}
