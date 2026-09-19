import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function loadStats() {
  const [members, pulseInWallets, activeTournois, activeJails, roundPot, achievementsUnlocked] = await Promise.all([
    supabase.from('discord_users').select('*', { count: 'exact', head: true }),
    supabase.from('discord_users').select('balance_pulse'),
    supabase.from('tournaments').select('*', { count: 'exact', head: true }).in('status', ['open', 'running']),
    supabase.from('jailed_members').select('*', { count: 'exact', head: true }),
    supabase.from('lottery_rounds').select('pot_pulse').eq('status', 'active').maybeSingle(),
    supabase.from('user_achievements').select('*', { count: 'exact', head: true }),
  ]);

  const totalPulseInWallets = (pulseInWallets.data ?? []).reduce(
    (s, r) => s + ((r as { balance_pulse?: number }).balance_pulse ?? 0),
    0,
  );

  return {
    members: members.count ?? 0,
    totalPulseInWallets,
    activeTournois: activeTournois.count ?? 0,
    activeJails: activeJails.count ?? 0,
    lotteryPot: (roundPot.data as { pot_pulse?: number } | null)?.pot_pulse ?? 0,
    achievementsUnlocked: achievementsUnlocked.count ?? 0,
  };
}

interface TopMember {
  discord_id: string;
  username: string;
  points_total: number;
  balance_pulse: number;
  rank_name: string | null;
}

interface RecentJail {
  discord_id: string;
  jailed_at: string;
  expires_at: string | null;
  reason: string | null;
}

interface RecentTour {
  id: string;
  title: string;
  status: string;
  pot_pulse: number;
  winner_id: string | null;
  created_at: string;
}

async function loadRecent() {
  const [topMembers, recentJails, lastTournois] = await Promise.all([
    supabase
      .from('discord_users')
      .select('discord_id, username, points_total, balance_pulse, rank_name')
      .order('points_total', { ascending: false })
      .limit(5),
    supabase
      .from('jailed_members')
      .select('discord_id, jailed_at, expires_at, reason')
      .order('jailed_at', { ascending: false })
      .limit(3),
    supabase
      .from('tournaments')
      .select('id, title, status, pot_pulse, winner_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);
  return {
    topMembers: (topMembers.data ?? []) as TopMember[],
    recentJails: (recentJails.data ?? []) as RecentJail[],
    lastTournois: (lastTournois.data ?? []) as RecentTour[],
  };
}

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-pulse-card border border-pulse-border rounded-xl p-3 md:p-5 relative overflow-hidden">
      <div className="absolute inset-0 bg-card-glow pointer-events-none" />
      <div className="relative text-[10px] md:text-xs uppercase tracking-wide text-pulse-mute">{label}</div>
      <div className="relative mt-1 text-xl md:text-3xl font-bold text-pulse-gold">{value}</div>
      {hint && <div className="relative mt-1 text-[10px] md:text-xs text-pulse-mute">{hint}</div>}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('en-US');

const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`);

export default async function Overview() {
  const [stats, recent] = await Promise.all([loadStats(), loadRecent()]);
  return (
    <>
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 tracking-wide">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <Card label="Members tracked" value={fmt(stats.members)} />
        <Card label="PULSE in wallets" value={fmt(stats.totalPulseInWallets)} hint="Sum of every balance" />
        <Card label="Active tournois" value={fmt(stats.activeTournois)} hint="open + running" />
        <Card label="Members jailed" value={fmt(stats.activeJails)} />
        <Card label="Lottery pot" value={fmt(stats.lotteryPot)} hint="Current round" />
        <Card label="Badges unlocked" value={fmt(stats.achievementsUnlocked)} hint="Across the community" />
      </div>

      {/* Top members — clean two-line rows, no wrapping mess */}
      <section className="mt-6 md:mt-10">
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">🏆 Top members</h2>
            <Link href="/dashboard/members" className="text-xs text-pulse-mute hover:text-pulse-gold">View all ›</Link>
          </div>
          <ul className="divide-y divide-pulse-border/60">
            {recent.topMembers.map((m, i) => (
              <li key={m.discord_id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-full bg-pulse-bg border border-pulse-border flex items-center justify-center text-sm">
                    {medal(i)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold truncate">{m.username || m.discord_id.slice(-6)}</div>
                      {m.rank_name && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-pulse-gold/10 text-pulse-gold border border-pulse-gold/20">
                          {m.rank_name}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-pulse-mute font-mono mt-0.5 truncate">
                      {fmt(m.points_total ?? 0)} pts · {fmt(m.balance_pulse ?? 0)} PULSE
                    </div>
                  </div>
                </div>
              </li>
            ))}
            {recent.topMembers.length === 0 && (
              <li className="text-pulse-mute py-2 text-sm">No members yet.</li>
            )}
          </ul>
        </div>
      </section>

      {/* Recent jails — collapsible, only shows 3 with a link to see all */}
      <section className="mt-4 md:mt-6">
        <details className="bg-pulse-card border border-pulse-border rounded-xl group open:rounded-b-none">
          <summary className="list-none cursor-pointer p-4 md:p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-lg">🔒</div>
              <div>
                <div className="font-semibold">Recent jails</div>
                <div className="text-xs text-pulse-mute">
                  {stats.activeJails} member{stats.activeJails === 1 ? '' : 's'} currently jailed
                </div>
              </div>
            </div>
            <span className="text-pulse-mute text-xl group-open:rotate-180 transition-transform">›</span>
          </summary>
          <div className="px-4 pb-4 md:px-5 md:pb-5 border-t border-pulse-border/60">
            <ul className="divide-y divide-pulse-border/60">
              {recent.recentJails.map(j => (
                <li key={j.discord_id + j.jailed_at} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="text-lg">🔒</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-mono truncate">{j.discord_id}</div>
                      <div className="text-xs text-pulse-mute truncate">{j.reason ?? 'No reason'}</div>
                    </div>
                    <div className="text-xs text-right shrink-0">
                      {j.expires_at
                        ? <span className="text-pulse-mute">{new Date(j.expires_at).toLocaleDateString()}</span>
                        : <span className="text-pulse-gold">⛓️ Life</span>}
                    </div>
                  </div>
                </li>
              ))}
              {recent.recentJails.length === 0 && (
                <li className="text-pulse-mute py-2 text-sm text-center">Nobody in jail. Peaceful.</li>
              )}
            </ul>
            {stats.activeJails > 3 && (
              <Link href="/dashboard/jails" className="block mt-3 text-center text-xs text-pulse-gold hover:underline">
                See all {stats.activeJails} jails ›
              </Link>
            )}
          </div>
        </details>
      </section>

      {/* Latest tournaments — compact list */}
      <section className="mt-4 md:mt-6">
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">🏟️ Latest tournaments</h2>
            <Link href="/dashboard/tournaments" className="text-xs text-pulse-mute hover:text-pulse-gold">View all ›</Link>
          </div>
          <ul className="divide-y divide-pulse-border/60">
            {recent.lastTournois.map(t => (
              <li key={t.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{t.title}</div>
                  <div className="text-xs text-pulse-mute capitalize">
                    {t.status} · {new Date(t.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="font-mono text-sm text-pulse-gold shrink-0">{fmt(t.pot_pulse)} PULSE</div>
              </li>
            ))}
            {recent.lastTournois.length === 0 && (
              <li className="text-pulse-mute py-2 text-sm">No tournaments yet.</li>
            )}
          </ul>
        </div>
      </section>
    </>
  );
}
