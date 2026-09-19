import { supabase } from '@/lib/supabase';
import JailsClient, { type Jail } from './JailsClient';

export const dynamic = 'force-dynamic';

async function loadJails(): Promise<Jail[]> {
  const { data } = await supabase
    .from('jailed_members')
    .select('discord_id, guild_id, moderator_id, reason, jailed_at, expires_at')
    .order('jailed_at', { ascending: false });
  return (data ?? []) as Jail[];
}

export default async function JailsPage() {
  const jails = await loadJails();
  return (
    <>
      <h1 className="text-xl md:text-2xl font-bold mb-2">Jails</h1>
      <p className="text-pulse-mute mb-4 md:mb-6 text-sm">
        {jails.length} member{jails.length === 1 ? '' : 's'} currently jailed. Tap Release to free them.
      </p>
      <JailsClient initial={jails} />
    </>
  );
}
