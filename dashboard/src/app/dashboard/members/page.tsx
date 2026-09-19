import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface Member {
  discord_id: string;
  username: string | null;
  rank_name: string | null;
  points_total: number;
  points_week: number;
  points_month: number;
  balance_pulse: number;
  lifetime_earned_pulse: number;
  streak: number;
  last_activity_at: string | null;
}

async function loadMembers(): Promise<Member[]> {
  const { data } = await supabase
    .from('discord_users')
    .select('discord_id, username, rank_name, points_total, points_week, points_month, balance_pulse, lifetime_earned_pulse, streak, last_activity_at')
    .order('points_total', { ascending: false })
    .limit(200);
  return (data ?? []) as Member[];
}

const fmt = (n: number) => (n ?? 0).toLocaleString('en-US');

export default async function MembersPage() {
  const members = await loadMembers();
  return (
    <>
      <h1 className="text-2xl font-bold mb-2">Members</h1>
      <p className="text-pulse-mute mb-6 text-sm">Top {members.length} by lifetime activity points.</p>
      <div className="bg-pulse-card border border-pulse-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-pulse-border/40 text-pulse-mute uppercase text-xs">
            <tr>
              <th className="text-left px-4 py-2">#</th>
              <th className="text-left px-4 py-2">Member</th>
              <th className="text-left px-4 py-2">Rank</th>
              <th className="text-right px-4 py-2">Points</th>
              <th className="text-right px-4 py-2">Week</th>
              <th className="text-right px-4 py-2">PULSE</th>
              <th className="text-right px-4 py-2">Lifetime</th>
              <th className="text-right px-4 py-2">🔥 Streak</th>
              <th className="text-right px-4 py-2">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr key={m.discord_id} className="border-t border-pulse-border/50 hover:bg-pulse-border/20">
                <td className="px-4 py-2 text-pulse-mute">{i + 1}</td>
                <td className="px-4 py-2">
                  <div className="font-semibold">{m.username ?? m.discord_id.slice(-6)}</div>
                  <div className="text-xs font-mono text-pulse-mute">{m.discord_id}</div>
                </td>
                <td className="px-4 py-2">{m.rank_name ?? '—'}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(m.points_total)}</td>
                <td className="px-4 py-2 text-right font-mono text-pulse-brand">{fmt(m.points_week)}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(m.balance_pulse)}</td>
                <td className="px-4 py-2 text-right font-mono text-pulse-mute">{fmt(m.lifetime_earned_pulse)}</td>
                <td className="px-4 py-2 text-right">{m.streak ?? 0}</td>
                <td className="px-4 py-2 text-right text-xs text-pulse-mute">
                  {m.last_activity_at ? new Date(m.last_activity_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr><td colSpan={9} className="text-center py-6 text-pulse-mute">No members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
