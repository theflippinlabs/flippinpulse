import { supabase } from './supabase';
import { currentGuildId } from './guildContext';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tables that DON'T carry a guild_id column (or where guild scoping would
 * be wrong). The proxy skips them and returns the raw builder.
 *   - audit_logs / profiles / stripe_events / user_roles: Supabase-level
 *     meta tables with no per-guild dimension.
 *   - guild_installs: keyed by guild_id as PK and used across guilds for
 *     listing a Lord's servers — scoping it to one guild would break the
 *     switcher.
 *   - subscriptions: keyed by guild_id as PK; checkout / webhook flows
 *     need to look up by stripe_subscription_id or stripe_customer_id
 *     across guilds.
 */
const UNSCOPED = new Set<string>([
  'audit_logs',
  'profiles',
  'stripe_events',
  'user_roles',
  'guild_installs',
  'subscriptions',
]);

/**
 * Returns a Supabase client that automatically scopes every query to the
 * given guild. SELECTs/UPDATEs/DELETEs get an implicit `.eq('guild_id', guildId)`.
 * INSERTs/UPSERTs get `{guild_id, ...payload}` so the caller never has to
 * remember to include it.
 *
 * Usage from a page/handler:
 *   const sb = scopedSupabase(currentGuildId());
 *   const { data } = await sb.from('shop_items').select('*');
 *
 * Call sites that must span guilds (webhook customer lookup, admin tools)
 * keep using the raw `supabase` client.
 */
/**
 * Shorthand for the common case: scope to the current request's guild.
 * Reads from cookie/session/env in that order via currentGuildId().
 */
export function sb(): SupabaseClient {
  return scopedSupabase(currentGuildId());
}

export function scopedSupabase(guildId: string): SupabaseClient {
  if (!guildId) throw new Error('scopedSupabase: guildId is required');
  return new Proxy(supabase, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (tableName: string) => {
          const builder = target.from(tableName);
          if (UNSCOPED.has(tableName)) return builder;
          return wrapBuilder(builder, guildId);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function wrapBuilder(builder: any, guildId: string): any {
  return new Proxy(builder, {
    get(target, prop) {
      const original = (target as any)[prop];
      if (typeof original !== 'function') return original;

      // SELECT: append .eq('guild_id', guildId) after the user's columns.
      if (prop === 'select') {
        return (...args: unknown[]) => {
          const q = original.apply(target, args);
          return q.eq('guild_id', guildId);
        };
      }

      // INSERT / UPSERT: splice guild_id into the payload. The user's
      // explicit value wins so a caller that genuinely needs to write to
      // another guild (unusual) can still do so by passing it.
      if (prop === 'insert' || prop === 'upsert') {
        return (payload: unknown, opts?: unknown) => {
          const inject = (p: unknown) => (p && typeof p === 'object')
            ? { guild_id: guildId, ...(p as object) }
            : p;
          const scoped = Array.isArray(payload) ? payload.map(inject) : inject(payload);
          return original.apply(target, opts !== undefined ? [scoped, opts] : [scoped]);
        };
      }

      // UPDATE / DELETE: scope by guild on the WHERE side.
      if (prop === 'update' || prop === 'delete') {
        return (...args: unknown[]) => {
          const q = original.apply(target, args);
          return q.eq('guild_id', guildId);
        };
      }

      return original.bind(target);
    },
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
