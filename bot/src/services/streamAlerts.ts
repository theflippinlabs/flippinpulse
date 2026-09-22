import { Client, EmbedBuilder } from 'discord.js';
import { supabase } from '../supabase.js';
import { getRawSetting } from './settings.js';
import { enqueuePush } from './pushQueue.js';
import { log } from '../utils/logger.js';

/**
 * Stream alerts — polls Twitch, YouTube, and X (Spaces) every ~90 seconds
 * for members who linked their handle via /stream link, and posts an embed
 * in the Lord-configured alert channel when someone goes live. First-time-up
 * during a poll cycle triggers the notif; subsequent polls where the same
 * live_key is seen stay silent.
 *
 * Env vars (each is optional and degrades gracefully):
 *   TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET  → Twitch app credentials
 *   YOUTUBE_API_KEY                          → YouTube Data v3 API key
 *   X_BEARER_TOKEN                           → X (Twitter) API v2 bearer token
 *                                              (Basic tier or higher — required
 *                                              for Spaces detection)
 *
 * X video-live broadcasts are NOT auto-detected — X does not expose that in
 * their API even on paid tiers. Members can announce a video live manually
 * with `/stream golive url:<link>`, which routes through postManualLive.
 */

export type StreamPlatform = 'twitch' | 'youtube' | 'x';

interface StreamLink {
  discord_id: string;
  platform: StreamPlatform;
  handle: string;
  external_id: string | null;
  last_live_key: string | null;
  last_live_at: string | null;
}

interface StreamConfig {
  alert_channel_id?: string | null;
  streamer_role_id?: string | null;
  mention_role_id?: string | null;
  reward_pulse?: number;
}

export function getStreamConfig(): StreamConfig {
  return (getRawSetting<StreamConfig>('stream_config') ?? {}) as StreamConfig;
}

// ---- Platform metadata (colors, labels, emoji) ----
export interface PlatformMeta { key: string; label: string; emoji: string; color: number; }
const PLATFORM_META: Record<string, PlatformMeta> = {
  twitch:   { key: 'twitch',   label: 'Twitch',   emoji: '🟣', color: 0x9146FF },
  youtube:  { key: 'youtube',  label: 'YouTube',  emoji: '🔴', color: 0xFF0000 },
  x:        { key: 'x',        label: 'X',        emoji: '⚫', color: 0x000000 },
  x_spaces: { key: 'x_spaces', label: 'X Spaces', emoji: '🎙️', color: 0x1DA1F2 },
  tiktok:   { key: 'tiktok',   label: 'TikTok',   emoji: '⚫', color: 0x00F2EA },
  kick:     { key: 'kick',     label: 'Kick',     emoji: '🟢', color: 0x53FC18 },
  discord:  { key: 'discord',  label: 'Discord',  emoji: '🎮', color: 0x5865F2 },
  other:    { key: 'other',    label: 'Live',     emoji: '📡', color: 0xF5B62E },
};

export function inferPlatformFromUrl(url: string): PlatformMeta {
  const u = url.toLowerCase();
  if (u.includes('twitch.tv'))                          return PLATFORM_META.twitch;
  if (u.includes('youtube.com') || u.includes('youtu.be')) return PLATFORM_META.youtube;
  if (u.includes('twitter.com') || u.includes('x.com')) return PLATFORM_META.x;
  if (u.includes('tiktok.com'))                         return PLATFORM_META.tiktok;
  if (u.includes('kick.com'))                           return PLATFORM_META.kick;
  return PLATFORM_META.other;
}

// ---- Twitch ----
let twitchAppToken: { token: string; expires_at: number } | null = null;

async function twitchToken(): Promise<string | null> {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (twitchAppToken && twitchAppToken.expires_at > Date.now() + 60_000) return twitchAppToken.token;
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
    });
    if (!res.ok) { log('WARN', 'Twitch token fetch failed', await res.text()); return null; }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    twitchAppToken = { token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 };
    return twitchAppToken.token;
  } catch (err) { log('ERROR', 'Twitch token exception', err); return null; }
}

interface TwitchStream {
  id: string; user_id: string; user_login: string; user_name: string;
  game_name: string; title: string; viewer_count: number;
  thumbnail_url: string; started_at: string;
}

async function twitchStreamsByLogin(logins: string[]): Promise<Map<string, TwitchStream>> {
  if (!logins.length) return new Map();
  const token = await twitchToken();
  if (!token) return new Map();
  const id = process.env.TWITCH_CLIENT_ID!;
  const url = new URL('https://api.twitch.tv/helix/streams');
  for (const l of logins.slice(0, 100)) url.searchParams.append('user_login', l.toLowerCase());
  try {
    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${token}`, 'client-id': id },
    });
    if (!res.ok) return new Map();
    const data = (await res.json()) as { data: TwitchStream[] };
    return new Map(data.data.map(s => [s.user_login.toLowerCase(), s]));
  } catch { return new Map(); }
}

// ---- YouTube ----
interface YouTubeLiveInfo { videoId: string; title: string; thumbnailUrl: string; channelUrl: string; }

async function youtubeLiveForChannel(channelId: string): Promise<YouTubeLiveInfo | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('channelId', channelId);
    url.searchParams.set('eventType', 'live');
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', '1');
    url.searchParams.set('key', key);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as { items: { id: { videoId: string }; snippet: { title: string; thumbnails: { high?: { url: string } }; channelTitle: string } }[] };
    const first = data.items[0];
    if (!first) return null;
    return {
      videoId: first.id.videoId,
      title: first.snippet.title,
      thumbnailUrl: first.snippet.thumbnails.high?.url ?? '',
      channelUrl: `https://youtube.com/channel/${channelId}`,
    };
  } catch { return null; }
}

// ---- X (Spaces via API v2, Basic tier or higher required) ----
async function xUserIdForHandle(handle: string): Promise<string | null> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return null;
  const clean = handle.replace(/^@/, '');
  try {
    const res = await fetch(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(clean)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) { log('WARN', 'X user lookup failed', res.status); return null; }
    const data = (await res.json()) as { data?: { id: string } };
    return data.data?.id ?? null;
  } catch (err) { log('ERROR', 'X user lookup exception', err); return null; }
}

interface XSpace { id: string; creator_id: string; title?: string; state: string; started_at?: string; }

async function xSpacesForCreatorIds(userIds: string[]): Promise<Map<string, XSpace>> {
  if (!userIds.length) return new Map();
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return new Map();
  try {
    const url = new URL('https://api.twitter.com/2/spaces/by/creator_ids');
    url.searchParams.set('user_ids', userIds.slice(0, 100).join(','));
    url.searchParams.set('space.fields', 'title,state,started_at,creator_id');
    const res = await fetch(url.toString(), { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return new Map();
    const data = (await res.json()) as { data?: XSpace[] };
    const map = new Map<string, XSpace>();
    for (const s of data.data ?? []) {
      // Only surface actually-live Spaces; scheduled ones stay silent.
      if (s.state === 'live') map.set(s.creator_id, s);
    }
    return map;
  } catch (err) { log('ERROR', 'X Spaces poll exception', err); return new Map(); }
}

// ---- Notification (auto-detected lives) ----
async function notifyLive(client: Client, discordId: string, handle: string, meta: PlatformMeta, payload: { title: string; url: string; thumbnail: string; extra?: string }): Promise<void> {
  const cfg = getStreamConfig();
  const channelId = cfg.alert_channel_id;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || !channel.isSendable()) return;

  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} ${handle} est en direct sur ${meta.label} !`)
    .setDescription(`**${payload.title}**${payload.extra ? `\n${payload.extra}` : ''}\n\n[▶️ Regarder](${payload.url})`)
    .setURL(payload.url)
    .setThumbnail(payload.thumbnail || null)
    .setTimestamp();

  const mention = cfg.mention_role_id ? `<@&${cfg.mention_role_id}> ` : '';
  await channel.send({
    content: `${mention}<@${discordId}> vient de passer en live !`,
    embeds: [embed],
    allowedMentions: { users: [discordId], roles: cfg.mention_role_id ? [cfg.mention_role_id] : [] },
  }).catch(() => null);

  await supabase.from('live_stream_sessions').insert({
    discord_id: discordId, source: meta.key, external_url: payload.url,
  });
  await enqueuePush(discordId, `🔴 Tu es en direct sur ${meta.label}`, payload.title.slice(0, 200), payload.url);
}

// ---- Manual "I'm live" — cheap fallback for platforms without APIs
// (X video, TikTok, Kick, whatever). Cooldown per user avoids spam.
const manualLiveCooldowns = new Map<string, number>();
const MANUAL_COOLDOWN_MS = 30 * 60_000;

export interface ManualLiveResult { ok: boolean; error?: string; waitMinutes?: number; }

export async function postManualLive(
  client: Client,
  discordId: string,
  url: string,
  title: string,
): Promise<ManualLiveResult> {
  const last = manualLiveCooldowns.get(discordId);
  if (last && Date.now() - last < MANUAL_COOLDOWN_MS) {
    const wait = Math.ceil((MANUAL_COOLDOWN_MS - (Date.now() - last)) / 60_000);
    return { ok: false, error: 'cooldown', waitMinutes: wait };
  }
  const cfg = getStreamConfig();
  if (!cfg.alert_channel_id) return { ok: false, error: 'no_alert_channel' };
  const channel = await client.channels.fetch(cfg.alert_channel_id).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || !channel.isSendable()) return { ok: false, error: 'no_alert_channel' };

  const meta = inferPlatformFromUrl(url);
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} Live sur ${meta.label} !`)
    .setDescription(`**${title || 'Sans titre'}**\n\n[▶️ Regarder](${url})`)
    .setURL(url)
    .setTimestamp();

  const mention = cfg.mention_role_id ? `<@&${cfg.mention_role_id}> ` : '';
  await channel.send({
    content: `${mention}<@${discordId}> vient de passer en live !`,
    embeds: [embed],
    allowedMentions: { users: [discordId], roles: cfg.mention_role_id ? [cfg.mention_role_id] : [] },
  }).catch(() => null);

  manualLiveCooldowns.set(discordId, Date.now());
  await supabase.from('live_stream_sessions').insert({
    discord_id: discordId, source: `manual:${meta.key}`, external_url: url,
  });
  await enqueuePush(discordId, `🔴 Tu es en direct sur ${meta.label}`, (title || 'Sans titre').slice(0, 200), url);
  return { ok: true };
}

// ---- Sweep ----
export async function runStreamAlertsSweep(client: Client): Promise<void> {
  const { data } = await supabase.from('stream_links').select('*');
  const links = (data ?? []) as StreamLink[];
  if (!links.length) return;

  // Twitch
  const twitchLinks = links.filter(l => l.platform === 'twitch');
  const twitchStreams = await twitchStreamsByLogin(twitchLinks.map(l => l.handle));
  for (const link of twitchLinks) {
    const stream = twitchStreams.get(link.handle.toLowerCase());
    if (!stream) continue;
    if (link.last_live_key === stream.id) continue;
    const url = `https://twitch.tv/${stream.user_login}`;
    const thumb = stream.thumbnail_url.replace('{width}', '640').replace('{height}', '360');
    await notifyLive(client, link.discord_id, link.handle, PLATFORM_META.twitch, {
      title: stream.title || 'Sans titre',
      url,
      thumbnail: thumb,
      extra: stream.game_name ? `🎮 ${stream.game_name}` : undefined,
    });
    await supabase.from('stream_links').update({ last_live_key: stream.id, last_live_at: new Date().toISOString() }).eq('discord_id', link.discord_id).eq('platform', 'twitch');
  }

  // YouTube — one API call per linked channel, so keep the poll gentle.
  const ytLinks = links.filter(l => l.platform === 'youtube');
  for (const link of ytLinks) {
    if (!link.external_id) continue;
    const live = await youtubeLiveForChannel(link.external_id);
    if (!live) continue;
    if (link.last_live_key === live.videoId) continue;
    const url = `https://youtube.com/watch?v=${live.videoId}`;
    await notifyLive(client, link.discord_id, link.handle, PLATFORM_META.youtube, {
      title: live.title, url, thumbnail: live.thumbnailUrl,
    });
    await supabase.from('stream_links').update({ last_live_key: live.videoId, last_live_at: new Date().toISOString() }).eq('discord_id', link.discord_id).eq('platform', 'youtube');
  }

  // X — Spaces. Skip entirely if no bearer token; auto-resolve missing user_ids
  // for any link that hasn't cached one yet.
  const xLinks = links.filter(l => l.platform === 'x');
  if (xLinks.length && process.env.X_BEARER_TOKEN) {
    for (const link of xLinks) {
      if (link.external_id) continue;
      const id = await xUserIdForHandle(link.handle);
      if (id) {
        link.external_id = id;
        await supabase.from('stream_links').update({ external_id: id }).eq('discord_id', link.discord_id).eq('platform', 'x');
      }
    }
    const withIds = xLinks.filter(l => l.external_id);
    const spaces = await xSpacesForCreatorIds(withIds.map(l => l.external_id!));
    for (const link of withIds) {
      const space = spaces.get(link.external_id!);
      if (!space) continue;
      if (link.last_live_key === space.id) continue;
      const url = `https://x.com/i/spaces/${space.id}`;
      await notifyLive(client, link.discord_id, link.handle, PLATFORM_META.x_spaces, {
        title: space.title || 'Space en direct',
        url,
        thumbnail: '',
      });
      await supabase.from('stream_links').update({ last_live_key: space.id, last_live_at: new Date().toISOString() }).eq('discord_id', link.discord_id).eq('platform', 'x');
    }
  }
}
