import { getAntiSpamConfig } from './settings.js';

const cooldowns = new Map<string, number>();
const CLEANUP_INTERVAL_MS = 5 * 60_000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function key(discordId: string, type: string) {
  return `${discordId}:${type}`;
}

function maxCooldownMs(): number {
  const config = getAntiSpamConfig();
  return Math.max(config.message_cooldown_seconds, config.reaction_cooldown_seconds) * 1000;
}

export function isOnCooldown(discordId: string, type: 'message' | 'reaction'): boolean {
  const config = getAntiSpamConfig();
  const cooldownSeconds = type === 'message'
    ? config.message_cooldown_seconds
    : config.reaction_cooldown_seconds;

  const k = key(discordId, type);
  const lastTime = cooldowns.get(k);
  const now = Date.now();

  if (lastTime && now - lastTime < cooldownSeconds * 1000) {
    return true;
  }

  cooldowns.set(k, now);
  return false;
}

export function startAntiSpamCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - maxCooldownMs();
    for (const [k, ts] of cooldowns) {
      if (ts < cutoff) cooldowns.delete(k);
    }
  }, CLEANUP_INTERVAL_MS);
}

export function stopAntiSpamCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
