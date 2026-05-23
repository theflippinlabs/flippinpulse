import { getPulseHourConfig } from './settings.js';

export function isPulseHourActive(now: Date = new Date()): boolean {
  const config = getPulseHourConfig();
  if (!config.enabled || !config.schedule?.length) return false;

  const day = now.getUTCDay();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const durationMin = config.duration_minutes ?? 60;

  for (const slot of config.schedule) {
    if (slot.day !== day) continue;
    const startMin = slot.hour * 60;
    if (nowMin >= startMin && nowMin < startMin + durationMin) return true;
  }
  return false;
}

export function getPulseHourMultiplier(): number {
  const config = getPulseHourConfig();
  if (!isPulseHourActive()) return 1;
  return Math.max(1, config.multiplier);
}
