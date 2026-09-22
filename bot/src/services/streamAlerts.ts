import { Client, EmbedBuilder } from 'discord.js';
import { supabase } from '../supabase.js';
import { getRawSetting } from './settings.js';
import { earnPulse } from './games.js';
import { enqueuePush } from './pushQueue.js';
import { log } from '../utils/logger.js';

/**
 * Stream alerts — polls Twitch and YouTube every ~90 seconds for members who
 * linked their handle via /stream link, and posts an embed in the Lord-
 * configured alert channel when someone goes live. First-time-up during a
 * poll cycle is what triggers the notif; subsequent polls where the same
 * live_key (Twitch stream_id / YouTube videoId) is seen stay silent.
 *
 * Requires env vars:
 *   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET  → Twitch app credentials
 *   YOUTUBE_API_KEY                          → YouTube Data v3 API key
 * Missing keys degrade gracefully: only the platforms that have credentials
 * are polled, the other are silently skipped.
 */

interface StreamLink {
  discord_id: string;
  platform: 'twitch' | 'youtube';
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

// ---- Notification ----
async function notifyLive(client: Client, link: StreamLink, kind: 'twitch' | 'youtube', payload: { title: string; url: string; thumbnail: string; extra?: string }): Promise<void> {
  const cfg = getStreamConfig();
  const channelId = cfg.alert_channel_id;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased() || !channel.isSendable()) return;

  const emoji = kind === 'twitch' ? '🟣' : '🔴';
  const platform = kind === 'twitch' ? 'Twitch' : 'YouTube';
  const embed = new EmbedBuilder()
    .setColor(kind === 'twitch' ? 0x9146FF : 0xFF0000)
    .setTitle(`${emoji} ${link.handle} est en direct sur ${platform} !`)
    .setDescription(`**${payload.title}**${payload.extra ? `\n${payload.extra}` : ''}\n\n[▶️ Regarder](${payload.url})`)
    .setURL(payload.url)
    .setThumbnail(payload.thumbnail || null)
    .setTimestamp();

  const mention = cfg.mention_role_id ? `<@&${cfg.mention_role_id}> ` : '';
  await channel.send({ content: `${mention}<@${link.discord_id}> vient de passer en live !`, embeds: [embed], allowedMentions: { users: [link.discord_id], roles: cfg.mention_role_id ? [cfg.mention_role_id] : [] } }).catch(() => null);

  await supabase.from('live_stream_sessions').insert({
    discord_id: link.discord_id, source: kind, external_url: payload.url,
  });
  await enqueuePush(link.discord_id, '🔴 Tu es en direct sur ' + platform, payload.title.slice(0, 200), payload.url);
}

// ---- Sweep ----
export async function runStreamAlertsSweep(client: Client): Promise<void> {
  const { data } = await supabase.from('stream_links').select('*');
  const links = (data ?? []) as StreamLink[];
  if (!links.length) return;

  const twitchLinks = links.filter(l => l.platform === 'twitch');
  const twitchStreams = await twitchStreamsByLogin(twitchLinks.map(l => l.handle));
  for (const link of twitchLinks) {
    const stream = twitchStreams.get(link.handle.toLowerCase());
    if (!stream) continue;
    if (link.last_live_key === stream.id) continue;
    const url = `https://twitch.tv/${stream.user_login}`;
    const thumb = stream.thumbnail_url.replace('{width}', '640').replace('{height}', '360');
    await notifyLive(client, link, 'twitch', {
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
    if (!link.external_id) continue; // YouTube requires channel_id, stored on link
    const live = await youtubeLiveForChannel(link.external_id);
    if (!live) continue;
    if (link.last_live_key === live.videoId) continue;
    const url = `https://youtube.com/watch?v=${live.videoId}`;
    await notifyLive(client, link, 'youtube', { title: live.title, url, thumbnail: live.thumbnailUrl });
    await supabase.from('stream_links').update({ last_live_key: live.videoId, last_live_at: new Date().toISOString() }).eq('discord_id', link.discord_id).eq('platform', 'youtube');
  }
}
