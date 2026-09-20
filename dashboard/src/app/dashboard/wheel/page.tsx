import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { loadChannels } from '@/lib/channels';
import BackLink from '../BackLink';
import WheelClient, { type MemberOpt } from './WheelClient';

export const dynamic = 'force-dynamic';

async function loadTopMembers(): Promise<MemberOpt[]> {
  const { data } = await supabase
    .from('discord_users')
    .select('discord_id, username, avatar_url')
    .order('points_total', { ascending: false })
    .limit(200);
  return (data ?? []) as MemberOpt[];
}

export default async function WheelPage() {
  const session = getSession();
  if (!session || !isAdmin(session.id)) redirect('/');
  const [members, channels] = await Promise.all([loadTopMembers(), loadChannels()]);

  return (
    <>
      <BackLink href="/dashboard/hub" />
      <h1 className="text-2xl md:text-3xl font-bold mb-1 tracking-wide">
        <span className="text-pulse-gold">🎡</span> Roue du destin
      </h1>
      <p className="text-pulse-mute mb-5 text-sm">
        Ajoute des options (une par ligne), ou importe les membres, puis lance la roue.
      </p>
      <WheelClient members={members} channels={channels} />
    </>
  );
}
