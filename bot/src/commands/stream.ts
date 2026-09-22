import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { supabase } from '../supabase.js';
import { setSetting } from '../services/settings.js';
import { getStreamConfig, postManualLive } from '../services/streamAlerts.js';
import { pulseEmbed, successEmbed, errorEmbed } from '../utils/embeds.js';
import { getUserLocale } from '../i18n.js';

function normalizeTwitch(input: string): string | null {
  const s = input.trim();
  const url = s.match(/twitch\.tv\/([a-zA-Z0-9_]+)/i);
  const handle = (url ? url[1] : s).replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,25}$/.test(handle)) return null;
  return handle;
}

function normalizeYouTube(input: string): { handle: string; channelId: string } | null {
  const s = input.trim();
  const channelMatch = s.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{20,})/i) || s.match(/^(UC[a-zA-Z0-9_-]{20,})$/);
  if (channelMatch) {
    const id = channelMatch[1];
    return { handle: id, channelId: id };
  }
  return null;
}

// X handles: 1-15 chars, letters/digits/underscore. Accept @foo, foo, or a
// full x.com / twitter.com URL.
function normalizeX(input: string): string | null {
  const s = input.trim();
  const url = s.match(/(?:x|twitter)\.com\/([a-zA-Z0-9_]+)/i);
  const handle = (url ? url[1] : s).replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  return handle;
}

export const data = new SlashCommandBuilder()
  .setName('stream')
  .setDescription('Stream alerts — Twitch, YouTube, X, Discord Go Live')
  .addSubcommand(s => s.setName('link').setDescription('Link a streaming platform / Lier une plateforme')
    .addStringOption(o => o.setName('platform').setDescription('Platform').setRequired(true)
      .addChoices(
        { name: 'Twitch', value: 'twitch' },
        { name: 'YouTube', value: 'youtube' },
        { name: 'X (Twitter)', value: 'x' },
      ))
    .addStringOption(o => o.setName('handle').setDescription('Twitch/X handle · YouTube channel ID or URL').setRequired(true)))
  .addSubcommand(s => s.setName('unlink').setDescription('Remove your stream link')
    .addStringOption(o => o.setName('platform').setDescription('Platform').setRequired(true)
      .addChoices(
        { name: 'Twitch', value: 'twitch' },
        { name: 'YouTube', value: 'youtube' },
        { name: 'X (Twitter)', value: 'x' },
      )))
  .addSubcommand(s => s.setName('golive').setDescription('Announce you are live NOW / Annoncer que tu es en live')
    .addStringOption(o => o.setName('url').setDescription('Stream URL (Twitch, YouTube, X, TikTok, Kick, anything)').setRequired(true))
    .addStringOption(o => o.setName('title').setDescription('Stream title / Titre du live').setRequired(false)))
  .addSubcommand(s => s.setName('me').setDescription('Show your linked accounts / Voir tes liens'))
  .addSubcommand(s => s.setName('list').setDescription('Show all linked streamers / Voir tous les streamers'))
  .addSubcommand(s => s.setName('config').setDescription('Admin: configure alerts / Admin: configuration')
    .addChannelOption(o => o.setName('channel').setDescription('Alert channel').addChannelTypes(ChannelType.GuildText).setRequired(false))
    .addRoleOption(o => o.setName('streamer_role').setDescription('Role while streaming').setRequired(false))
    .addRoleOption(o => o.setName('ping_role').setDescription('Role to ping on live').setRequired(false))
    .addIntegerOption(o => o.setName('reward_pulse').setDescription('PULSE per 15 min streamed').setMinValue(0).setMaxValue(1000).setRequired(false)));

export async function execute(interaction: ChatInputCommandInteraction) {
  const locale = await getUserLocale(interaction.user.id);
  const fr = locale === 'fr';
  const sub = interaction.options.getSubcommand();

  if (sub === 'link') {
    const platform = interaction.options.getString('platform', true) as 'twitch' | 'youtube' | 'x';
    const raw = interaction.options.getString('handle', true);
    if (platform === 'twitch') {
      const handle = normalizeTwitch(raw);
      if (!handle) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Pseudo Twitch invalide. Ex : `novaryshq` ou l\'URL complète.' : 'Invalid Twitch handle. e.g. `novaryshq` or full URL.')], flags: MessageFlags.Ephemeral }); return; }
      await supabase.from('stream_links').upsert({ discord_id: interaction.user.id, platform, handle, external_id: null }, { onConflict: 'discord_id,platform' });
      await interaction.reply({ embeds: [successEmbed(fr ? `🟣 Twitch \`${handle}\` lié. La communauté sera prévenue quand tu passeras en live.` : `🟣 Twitch \`${handle}\` linked. The community will be notified when you go live.`)], flags: MessageFlags.Ephemeral });
      return;
    }
    if (platform === 'youtube') {
      const yt = normalizeYouTube(raw);
      if (!yt) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Fournis l\'URL YouTube de la chaîne (youtube.com/channel/UC…) ou son ID `UC…`.' : 'Provide the channel URL (youtube.com/channel/UC…) or the raw `UC…` id.')], flags: MessageFlags.Ephemeral }); return; }
      await supabase.from('stream_links').upsert({ discord_id: interaction.user.id, platform: 'youtube', handle: yt.handle, external_id: yt.channelId }, { onConflict: 'discord_id,platform' });
      await interaction.reply({ embeds: [successEmbed(fr ? `🔴 YouTube lié (chaîne \`${yt.channelId}\`).` : `🔴 YouTube linked (channel \`${yt.channelId}\`).`)], flags: MessageFlags.Ephemeral });
      return;
    }
    // X (Twitter)
    const handle = normalizeX(raw);
    if (!handle) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Pseudo X invalide. Ex : `@novarys` ou `x.com/novarys`.' : 'Invalid X handle. e.g. `@novarys` or `x.com/novarys`.')], flags: MessageFlags.Ephemeral }); return; }
    await supabase.from('stream_links').upsert({ discord_id: interaction.user.id, platform: 'x', handle, external_id: null }, { onConflict: 'discord_id,platform' });
    const note = process.env.X_BEARER_TOKEN
      ? (fr ? ' Les Spaces seront détectés automatiquement.' : ' Spaces will be auto-detected.')
      : (fr ? ' Utilise `/stream golive url:…` quand tu commences un live (l\'API X n\'est pas configurée sur ce serveur, donc pas d\'auto-détection).' : ' Use `/stream golive url:…` when you go live (the X API isn\'t configured, so no auto-detection).');
    await interaction.reply({ embeds: [successEmbed(fr ? `⚫ X \`@${handle}\` lié.${note}` : `⚫ X \`@${handle}\` linked.${note}`)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'unlink') {
    const platform = interaction.options.getString('platform', true);
    await supabase.from('stream_links').delete().eq('discord_id', interaction.user.id).eq('platform', platform);
    await interaction.reply({ embeds: [successEmbed(fr ? `Compte ${platform} délié.` : `${platform} unlinked.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'golive') {
    const url = interaction.options.getString('url', true).trim();
    const title = interaction.options.getString('title')?.trim() ?? '';
    // Cheap URL sanity check — accept only http(s).
    if (!/^https?:\/\/\S+$/i.test(url)) {
      await interaction.reply({ embeds: [errorEmbed(fr ? 'URL invalide. Colle un lien complet (https://…).' : 'Invalid URL. Paste a full https link.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const res = await postManualLive(interaction.client, interaction.user.id, url, title);
    if (!res.ok) {
      const msg = res.error === 'cooldown'
        ? (fr ? `Attends encore ~${res.waitMinutes} min avant d'annoncer un nouveau live.` : `Wait ~${res.waitMinutes} more min before announcing another live.`)
        : res.error === 'no_alert_channel'
          ? (fr ? 'Aucun salon d\'alertes configuré. Un admin peut le régler avec `/stream config`.' : 'No alert channel configured. An admin can set it with `/stream config`.')
          : (fr ? 'Erreur.' : 'Error.');
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [successEmbed(fr ? '📣 Live annoncé à la communauté !' : '📣 Live announced to the community!')], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'me') {
    const { data } = await supabase.from('stream_links').select('*').eq('discord_id', interaction.user.id);
    if (!data?.length) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Aucun compte lié.' : 'No linked accounts.')], flags: MessageFlags.Ephemeral }); return; }
    const lines = data.map(l => {
      if (l.platform === 'twitch') return `🟣 Twitch — twitch.tv/${l.handle}`;
      if (l.platform === 'youtube') return `🔴 YouTube — chaîne ${l.external_id ?? l.handle}`;
      if (l.platform === 'x') return `⚫ X — x.com/${l.handle}`;
      return `📡 ${l.platform} — ${l.handle}`;
    });
    await interaction.reply({ embeds: [pulseEmbed(fr ? '🎥 Tes liens' : '🎥 Your links').setDescription(lines.join('\n'))], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'list') {
    const { data } = await supabase.from('stream_links').select('*').order('created_at', { ascending: true }).limit(50);
    if (!data?.length) { await interaction.reply({ embeds: [errorEmbed(fr ? 'Aucun streamer lié.' : 'No streamers linked yet.')], flags: MessageFlags.Ephemeral }); return; }
    const lines = data.map(l => {
      if (l.platform === 'twitch') return `<@${l.discord_id}> · 🟣 twitch.tv/${l.handle}`;
      if (l.platform === 'youtube') return `<@${l.discord_id}> · 🔴 YouTube ${l.external_id ?? l.handle}`;
      if (l.platform === 'x') return `<@${l.discord_id}> · ⚫ x.com/${l.handle}`;
      return `<@${l.discord_id}> · 📡 ${l.platform} ${l.handle}`;
    });
    await interaction.reply({ embeds: [pulseEmbed(fr ? '🎥 Streamers Novarys' : '🎥 Novarys streamers').setDescription(lines.join('\n'))], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === 'config') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ embeds: [errorEmbed(fr ? 'Réservé aux admins.' : 'Admins only.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const cur = getStreamConfig();
    const channel = interaction.options.getChannel('channel');
    const streamerRole = interaction.options.getRole('streamer_role');
    const pingRole = interaction.options.getRole('ping_role');
    const reward = interaction.options.getInteger('reward_pulse');
    const patch = { ...cur };
    if (channel) patch.alert_channel_id = channel.id;
    if (streamerRole) patch.streamer_role_id = streamerRole.id;
    if (pingRole) patch.mention_role_id = pingRole.id;
    if (reward !== null) patch.reward_pulse = reward;
    await setSetting('stream_config', patch);
    await interaction.reply({
      embeds: [successEmbed(fr
        ? `Configuration mise à jour.\n\n📢 Salon : ${patch.alert_channel_id ? `<#${patch.alert_channel_id}>` : '_non défini_'}\n🎥 Rôle en stream : ${patch.streamer_role_id ? `<@&${patch.streamer_role_id}>` : '_non défini_'}\n🔔 Rôle à ping : ${patch.mention_role_id ? `<@&${patch.mention_role_id}>` : '_non défini_'}\n💰 PULSE / 15 min : ${patch.reward_pulse ?? 50}`
        : `Config updated.\n\n📢 Channel: ${patch.alert_channel_id ? `<#${patch.alert_channel_id}>` : '_unset_'}\n🎥 Streamer role: ${patch.streamer_role_id ? `<@&${patch.streamer_role_id}>` : '_unset_'}\n🔔 Ping role: ${patch.mention_role_id ? `<@&${patch.mention_role_id}>` : '_unset_'}\n💰 PULSE / 15 min: ${patch.reward_pulse ?? 50}`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}
