import { supabase } from '@/lib/supabase';
import MembersClient, { type Member } from './MembersClient';

export const dynamic = 'force-dynamic';

async function loadMembers(): Promise<Member[]> {
  const { data } = await supabase
    .from('discord_users')
    .select('discord_id, username, rank_name, points_total, points_week, points_month, balance_pulse, lifetime_earned_pulse, streak, last_activity_at')
    .order('points_total', { ascending: false })
    .limit(200);
  return (data ?? []) as Member[];
}

export default async function MembersPage() {
  const members = await loadMembers();
  return (
    <>
      <h1 className="text-xl md:text-2xl font-bold mb-2">Members</h1>
      <p className="text-pulse-mute mb-4 md:mb-6 text-sm">
        Top {members.length} by lifetime points. Tap a member to give or take PULSE.
      </p>
      <MembersClient initial={members} />
    </>
  );
}
