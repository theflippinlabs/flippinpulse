// In-memory sliding-window rate limiter, per-process.
// Fine for a single Vercel serverless region; if we ever spread to many
// regions with independent memory, swap this for a Redis/Upstash bucket.

const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs?: number;
  remaining?: number;
}

// key: a stable identifier (e.g. `ai:write:<discord_id>`), limit: number of
// events allowed within windowMs.
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const arr = buckets.get(key) ?? [];
  const fresh = arr.filter(ts => now - ts < windowMs);
  if (fresh.length >= limit) {
    return { ok: false, retryAfterMs: windowMs - (now - fresh[0]), remaining: 0 };
  }
  fresh.push(now);
  buckets.set(key, fresh);
  if (buckets.size > 1000) {
    for (const [k, v] of buckets) {
      const keep = v.filter(ts => now - ts < windowMs);
      if (!keep.length) buckets.delete(k);
      else buckets.set(k, keep);
    }
  }
  return { ok: true, remaining: limit - fresh.length };
}
