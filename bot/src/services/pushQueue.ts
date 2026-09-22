import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

/**
 * Enqueue a push notification. The dashboard hosts a serverless cron that
 * consumes push_queue rows and calls the actual Web Push API — the bot only
 * needs to write the intent here.
 * Fail-soft: never throws so callers don't have to try/catch.
 */
export async function enqueuePush(discordId: string, title: string, body: string, url = '/app'): Promise<void> {
  try {
    await supabase.from('push_queue').insert({ discord_id: discordId, title: title.slice(0, 80), body: body.slice(0, 300), url: url.slice(0, 200) });
  } catch (err) { log('ERROR', 'push enqueue failed', err); }
}
