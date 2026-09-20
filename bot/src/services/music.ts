import { log } from '../utils/logger.js';

export interface Track {
  title: string;
  artist: string;
  album?: string;
  cover_url?: string;
  duration_ms?: number;
  links: {
    spotify?: string;
    apple?: string;
    deezer?: string;
    youtube?: string;
  };
}

// ---------- Spotify (client_credentials) ----------

let spotifyToken: { access_token: string; expires_at: number } | null = null;

async function spotifyToken_(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (spotifyToken && spotifyToken.expires_at > Date.now() + 30_000) return spotifyToken.access_token;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) { log('WARN', 'spotify token fetch failed', await res.text()); return null; }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  spotifyToken = { access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 };
  return spotifyToken.access_token;
}

interface SpotifyTrack {
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string; width: number; height: number }[] };
  external_urls: { spotify: string };
  duration_ms: number;
}

export async function searchSpotify(query: string): Promise<SpotifyTrack | null> {
  const token = await spotifyToken_();
  if (!token) return null;
  const url = new URL('https://api.spotify.com/v1/search');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'track');
  url.searchParams.set('limit', '1');
  const res = await fetch(url.toString(), { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = (await res.json()) as { tracks?: { items?: SpotifyTrack[] } };
  return data.tracks?.items?.[0] ?? null;
}

// ---------- Deezer (public, no auth) ----------

interface DeezerTrack {
  title: string;
  artist: { name: string };
  album: { title: string; cover_xl?: string; cover_medium?: string };
  link: string;
  duration: number; // seconds
}

export async function searchDeezer(query: string): Promise<DeezerTrack | null> {
  const url = new URL('https://api.deezer.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: DeezerTrack[] };
  return data.data?.[0] ?? null;
}

// ---------- iTunes / Apple Music (public search API) ----------

interface AppleTrack {
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  trackViewUrl: string;
  trackTimeMillis: number;
}

export async function searchApple(query: string): Promise<AppleTrack | null> {
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', query);
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', '1');
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: AppleTrack[] };
  return data.results?.[0] ?? null;
}

// ---------- Unified search — best-of across all providers ----------

export async function searchTrack(query: string): Promise<Track | null> {
  const [sp, dz, ap] = await Promise.all([
    searchSpotify(query).catch(() => null),
    searchDeezer(query).catch(() => null),
    searchApple(query).catch(() => null),
  ]);

  if (!sp && !dz && !ap) return null;

  const title = sp?.name ?? dz?.title ?? ap?.trackName ?? query;
  const artist = sp?.artists?.[0]?.name ?? dz?.artist?.name ?? ap?.artistName ?? '';
  const album = sp?.album?.name ?? dz?.album?.title ?? ap?.collectionName;
  const cover_url =
    sp?.album?.images?.[0]?.url ??
    dz?.album?.cover_xl ??
    dz?.album?.cover_medium ??
    (ap?.artworkUrl100 ? ap.artworkUrl100.replace('100x100bb', '600x600bb') : undefined);
  const duration_ms = sp?.duration_ms ?? (dz ? dz.duration * 1000 : undefined) ?? ap?.trackTimeMillis;

  return {
    title,
    artist,
    album,
    cover_url,
    duration_ms,
    links: {
      spotify: sp?.external_urls?.spotify,
      deezer: dz?.link,
      apple: ap?.trackViewUrl,
    },
  };
}

export function formatDuration(ms?: number): string {
  if (!ms) return '';
  const total = Math.floor(ms / 1000);
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
