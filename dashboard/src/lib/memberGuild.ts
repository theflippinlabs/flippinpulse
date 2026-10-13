import { cookies } from 'next/headers';
import { supabase } from './supabase';
import { getSession } from './auth';
import { GUILD_COOKIE } from './guildContext';

/**
 * Resolve the Discord guild a member is browsing right now.
 *
 * Order of resolution:
 *   1. `novarys_guild` cookie, if its value is in the user's own guild list
 *      AND the bot is installed there — the member's explicit choice.
 *   2. The intersection of the member's Discord guilds (we need to re-read
 *      them with the user's access_token — only stored in session for
 *      admins today; non-admins get a lookup via guild_installs owner_id
 *      membership instead).
 *   3. The DEFAULT_GUILD_ID env var — single-tenant fallback.
 *
 * For Phase 2 we use a cheap-but-correct proxy: the member's active guild
 * is whatever guild they have a `discord_users` row in, picking the most
 * recently active one when there are several. This avoids re-fetching
 * Discord's /users/@me/guilds for every page load.
 */
export async function resolveMemberGuild(discordId: string): Promise<string | null> {
  // 1. Explicit cookie wins.
  const cookieVal = cookies().get(GUILD_COOKIE)?.value;
  if (cookieVal && /^\d{15,20}$/.test(cookieVal)) {
    // Verify the member actually belongs there (prevents a crafted cookie
    // from reading another guild's data).
    const { data } = await supabase
      .from('discord_users')
      .select('guild_id')
      .eq('discord_id', discordId)
      .eq('guild_id', cookieVal)
      .maybeSingle();
    if (data) return cookieVal;
  }

  // 2. Pick the member's most-recently-active row across all guilds.
  const { data: rows } = await supabase
    .from('discord_users')
    .select('guild_id, last_message_at')
    .eq('discord_id', discordId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(5);
  const first = (rows ?? []).find(r => (r.guild_id as string | null));
  if (first?.guild_id) return first.guild_id as string;

  // 3. Fallback — the original single-tenant deployment.
  return process.env.DEFAULT_GUILD_ID ?? process.env.GUILD_ID ?? null;
}

/**
 * Helper for pages/API routes: get the current member's guild or throw a
 * meaningful error. For non-throwing use, call resolveMemberGuild directly.
 */
export async function requireMemberGuild(): Promise<string> {
  const session = getSession();
  if (!session) throw new Error('No session');
  const g = await resolveMemberGuild(session.id);
  if (!g) throw new Error('Member has no guild context');
  return g;
}
