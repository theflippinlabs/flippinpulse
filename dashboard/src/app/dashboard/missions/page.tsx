import { supabase } from '@/lib/supabase';
import BackLink from '../BackLink';
import MissionsClient, { type Mission } from './MissionsClient';

export const dynamic = 'force-dynamic';

async function load(): Promise<Mission[]> {
  const { data } = await supabase
    .from('pulse_challenges')
    .select('id, kind, title, reward, goal, metric, winners_count, expires_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  return (data ?? []) as Mission[];
}

export default async function MissionsPage() {
  const active = await load();
  return (
    <>
      <BackLink />
      <h1 className="text-xl md:text-2xl font-bold mb-2">🎯 Missions</h1>
      <p className="text-pulse-mute mb-6 text-sm">
        Launch a mission now — Novus posts it in the community channel and the bot tracks progress.
      </p>
      <MissionsClient initial={active} />
    </>
  );
}
