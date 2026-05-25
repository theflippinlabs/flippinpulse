import { AsyncLocalStorage } from 'node:async_hooks';

// Carries the "current Discord server" through async calls so services can
// scope every DB read/write to one guild without threading guildId everywhere.
const storage = new AsyncLocalStorage<string>();

export function runWithGuild<T>(guildId: string, fn: () => T): T {
  return storage.run(guildId, fn);
}

export function currentGuildIdOrNull(): string | null {
  return storage.getStore() ?? null;
}

/** Use in data paths that must be guild-scoped (throws if context is missing — surfaces bugs in testing). */
export function currentGuildId(): string {
  const g = storage.getStore();
  if (!g) throw new Error('guild context missing: a guild-scoped operation ran outside runWithGuild()');
  return g;
}

/**
 * Wraps an event-emitter callback (e.g. discord.js collector `collect`/`end`)
 * so it runs inside the guild context. Collector callbacks fire from the
 * gateway context and otherwise lose the AsyncLocalStorage store.
 */
export function bindGuild<A extends unknown[]>(
  guildId: string,
  fn: (...args: A) => unknown | Promise<unknown>,
): (...args: A) => void {
  return (...args: A) => {
    void runWithGuild(guildId, () => fn(...args));
  };
}
