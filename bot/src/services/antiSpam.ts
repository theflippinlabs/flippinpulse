import { getAntiSpamConfig } from './settings.js';

const cooldowns = new Map<string, number>();

function key(discordId: string, type: string) {
  return `${discordId}:${type}`;
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
