/**
 * Client-side rate limiter using a sliding window algorithm.
 * For production, enforce rate limits server-side in Edge Functions too.
 */

interface RateLimitEntry {
  timestamps: number[];
  limit: number;
  windowMs: number;
}

const store = new Map<string, RateLimitEntry>();

export function createRateLimiter(key: string, limit: number, windowMs: number) {
  if (!store.has(key)) {
    store.set(key, { timestamps: [], limit, windowMs });
  }

  return {
    /** Returns true if the action is allowed */
    check(): boolean {
      const entry = store.get(key)!;
      const now = Date.now();
      // Remove timestamps outside window
      entry.timestamps = entry.timestamps.filter((t) => now - t < entry.windowMs);
      return entry.timestamps.length < entry.limit;
    },

    /** Records the action. Returns false if rate limit exceeded. */
    consume(): boolean {
      const entry = store.get(key)!;
      const now = Date.now();
      entry.timestamps = entry.timestamps.filter((t) => now - t < entry.windowMs);

      if (entry.timestamps.length >= entry.limit) {
        return false;
      }

      entry.timestamps.push(now);
      return true;
    },

    /** Milliseconds until the oldest window entry expires */
    retryAfterMs(): number {
      const entry = store.get(key)!;
      if (entry.timestamps.length === 0) return 0;
      const oldest = Math.min(...entry.timestamps);
      return Math.max(0, entry.windowMs - (Date.now() - oldest));
    },

    /** Remaining allowed calls in current window */
    remaining(): number {
      const entry = store.get(key)!;
      const now = Date.now();
      const active = entry.timestamps.filter((t) => now - t < entry.windowMs);
      return Math.max(0, entry.limit - active.length);
    },
  };
}

// Pre-configured limiters
export const aiContentLimiter = createRateLimiter("ai-content", 10, 60_000);   // 10/min
export const aiReplyLimiter = createRateLimiter("ai-reply", 15, 60_000);       // 15/min
export const trendsFetchLimiter = createRateLimiter("trends-fetch", 30, 60_000); // 30/min
