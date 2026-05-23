import { Message, PermissionFlagsBits } from 'discord.js';
import { getModConfig } from './settings.js';
import { logAndAnnounce } from './moderation.js';
import { log } from '../utils/logger.js';

interface MessageBuffer {
  timestamps: number[];
}
const userMessageBuffers = new Map<string, MessageBuffer>();

interface JoinBuffer {
  timestamps: number[];
  lockdownUntil: number;
}
const guildJoinBuffers = new Map<string, JoinBuffer>();

const URL_REGEX = /https?:\/\/([^\s/]+)/gi;
const INVITE_REGEX = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/\S+/gi;

function extractDomains(content: string): string[] {
  const matches = [...content.matchAll(URL_REGEX)];
  return matches.map(m => m[1].toLowerCase().replace(/^www\./, ''));
}

function isWhitelisted(domain: string, whitelist: string[]): boolean {
  return whitelist.some(w => domain === w || domain.endsWith(`.${w}`));
}

export async function runAutomod(message: Message): Promise<boolean> {
  const config = getModConfig();
  if (!config.automod_enabled) return false;
  if (!message.guild || message.author.bot || !message.member) return false;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  const content = message.content;

  if (config.anti_mass_mentions.enabled) {
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount > config.anti_mass_mentions.max_mentions) {
      await message.delete().catch(() => null);
      await logAndAnnounce(message.guild, {
        guildId: message.guild.id,
        type: 'automod',
        targetId: message.author.id,
        reason: `Mass mentions (${mentionCount} > ${config.anti_mass_mentions.max_mentions})`,
        metadata: { trigger: 'mass_mentions', channel_id: message.channelId },
      });
      return true;
    }
  }

  if (config.anti_invites.enabled && INVITE_REGEX.test(content)) {
    await message.delete().catch(() => null);
    await logAndAnnounce(message.guild, {
      guildId: message.guild.id,
      type: 'automod',
      targetId: message.author.id,
      reason: 'Discord invite link',
      metadata: { trigger: 'invite_link', channel_id: message.channelId },
    });
    return true;
  }

  if (config.anti_links.enabled) {
    const domains = extractDomains(content);
    const blocked = domains.find(d => !isWhitelisted(d, config.anti_links.whitelist_domains));
    if (blocked) {
      await message.delete().catch(() => null);
      await logAndAnnounce(message.guild, {
        guildId: message.guild.id,
        type: 'automod',
        targetId: message.author.id,
        reason: `Non-whitelisted link: ${blocked}`,
        metadata: { trigger: 'link', domain: blocked, channel_id: message.channelId },
      });
      return true;
    }
  }

  if (config.anti_spam.enabled) {
    const now = Date.now();
    const windowMs = config.anti_spam.window_seconds * 1000;
    const buffer = userMessageBuffers.get(message.author.id) ?? { timestamps: [] };
    buffer.timestamps = buffer.timestamps.filter(t => now - t < windowMs);
    buffer.timestamps.push(now);
    userMessageBuffers.set(message.author.id, buffer);

    if (buffer.timestamps.length > config.anti_spam.max_messages) {
      buffer.timestamps = [];
      const muteMs = config.anti_spam.mute_seconds * 1000;
      if (message.member.moderatable) {
        await message.member.timeout(muteMs, 'Automod: spam').catch(err => log('ERROR', 'Automod mute failed', err));
      }
      await logAndAnnounce(message.guild, {
        guildId: message.guild.id,
        type: 'automod',
        targetId: message.author.id,
        durationSeconds: config.anti_spam.mute_seconds,
        reason: `Spam (>${config.anti_spam.max_messages} msgs in ${config.anti_spam.window_seconds}s) — muted`,
        metadata: { trigger: 'spam', channel_id: message.channelId },
      });
      return true;
    }
  }

  return false;
}

export function recordJoin(guildId: string): { lockdown: boolean; joinsInWindow: number } {
  const config = getModConfig();
  const now = Date.now();
  const buffer = guildJoinBuffers.get(guildId) ?? { timestamps: [], lockdownUntil: 0 };

  if (!config.anti_raid.enabled) {
    guildJoinBuffers.set(guildId, buffer);
    return { lockdown: now < buffer.lockdownUntil, joinsInWindow: 0 };
  }

  const windowMs = config.anti_raid.window_seconds * 1000;
  buffer.timestamps = buffer.timestamps.filter(t => now - t < windowMs);
  buffer.timestamps.push(now);

  if (buffer.timestamps.length > config.anti_raid.max_joins && now > buffer.lockdownUntil) {
    buffer.lockdownUntil = now + config.anti_raid.lockdown_minutes * 60_000;
  }

  guildJoinBuffers.set(guildId, buffer);
  return { lockdown: now < buffer.lockdownUntil, joinsInWindow: buffer.timestamps.length };
}

export function isInLockdown(guildId: string): boolean {
  const buf = guildJoinBuffers.get(guildId);
  return !!buf && Date.now() < buf.lockdownUntil;
}

const AUTOMOD_CLEANUP_INTERVAL_MS = 10 * 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startAutomodCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [userId, buf] of userMessageBuffers) {
      const fresh = buf.timestamps.filter(t => now - t < 60_000);
      if (fresh.length === 0) userMessageBuffers.delete(userId);
      else buf.timestamps = fresh;
    }
    for (const [guildId, buf] of guildJoinBuffers) {
      const fresh = buf.timestamps.filter(t => now - t < 5 * 60_000);
      if (fresh.length === 0 && now > buf.lockdownUntil) guildJoinBuffers.delete(guildId);
      else buf.timestamps = fresh;
    }
  }, AUTOMOD_CLEANUP_INTERVAL_MS);
}

export function stopAutomodCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
