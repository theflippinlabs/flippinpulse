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
  avatar_url: string | null;
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
      .select('discord_id, username, points_total, balance_pulse, rank_name, avatar_url')
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

// Podium ring color per rank: gold / silver / bronze / rest.
const PODIUM_RING: Record<number, string> = {
  0: 'ring-4 ring-[#F5B62E] shadow-[0_0_25px_rgba(245,182,46,0.4)]',
  1: 'ring-4 ring-[#C0C0C0] shadow-[0_0_20px_rgba(192,192,192,0.35)]',
  2: 'ring-4 ring-[#CD7F32] shadow-[0_0_20px_rgba(205,127,50,0.35)]',
};
const MEDAL_BADGE: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' };

function Avatar({ url, name, rank }: { url: string | null; name: string; rank: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const ring = PODIUM_RING[rank] ?? 'ring-1 ring-pulse-border';
  return (
    <div className={`relative rounded-full ${ring} bg-pulse-bg flex-shrink-0`}>
      {url ? (
        <img src={url} alt="" className="w-12 h-12 rounded-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-pulse-gold bg-gradient-to-br from-pulse-gold/20 to-pulse-gold/5">
          {initial}
        </div>
      )}
      {MEDAL_BADGE[rank] && (
        <div className="absolute -bottom-1 -right-1 text-lg leading-none drop-shadow">{MEDAL_BADGE[rank]}</div>
      )}
      {!MEDAL_BADGE[rank] && (
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-pulse-bg border border-pulse-border text-[10px] font-bold text-pulse-mute flex items-center justify-center">
          {rank + 1}
        </div>
      )}
    </div>
  );
}

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

      {/* Top members — podium for top 3, then a clean list */}
      <section className="mt-6 md:mt-10">
        <div className="bg-gradient-to-b from-pulse-card to-pulse-bg border border-pulse-border rounded-2xl p-4 md:p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-lg">🏆 Leaderboard</h2>
              <div className="text-xs text-pulse-mute">Top members by points</div>
            </div>
            <Link href="/dashboard/members" className="text-xs text-pulse-mute hover:text-pulse-gold underline-offset-2 hover:underline">View all ›</Link>
          </div>

          {recent.topMembers.length === 0 ? (
            <div className="text-pulse-mute py-4 text-sm text-center">No members yet.</div>
          ) : (
            <>
              {/* Podium: #2 · #1 (raised, centered) · #3 */}
              <div className="grid grid-cols-3 gap-2 md:gap-4 items-end mb-5">
                {[1, 0, 2].map(idx => {
                  const m = recent.topMembers[idx];
                  if (!m) return <div key={idx} />;
                  const heights = { 0: 'h-24 md:h-28', 1: 'h-16 md:h-20', 2: 'h-12 md:h-16' };
                  const tints = {
                    0: 'from-[#F5B62E]/30 to-[#F5B62E]/5 border-[#F5B62E]/40',
                    1: 'from-[#C0C0C0]/20 to-[#C0C0C0]/5 border-[#C0C0C0]/30',
                    2: 'from-[#CD7F32]/20 to-[#CD7F32]/5 border-[#CD7F32]/30',
                  };
                  return (
                    <div key={m.discord_id} className="flex flex-col items-center">
                      <Avatar url={m.avatar_url} name={m.username} rank={idx} />
                      <div className="mt-2 text-center max-w-full">
                        <div className="font-bold text-sm truncate max-w-[100px] md:max-w-none">{m.username || m.discord_id.slice(-6)}</div>
                        <div className="text-[10px] md:text-xs text-pulse-mute font-mono">{fmt(m.points_total ?? 0)} pts</div>
                      </div>
                      <div className={`w-full mt-2 rounded-t-lg bg-gradient-to-t ${tints[idx as 0 | 1 | 2]} border border-b-0 ${heights[idx as 0 | 1 | 2]} flex items-start justify-center pt-1 md:pt-2`}>
                        <div className="text-lg md:text-2xl font-black text-pulse-text">
                          {idx === 0 ? '1' : idx === 1 ? '2' : '3'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rest: rows 4+ */}
              {recent.topMembers.length > 3 && (
                <ul className="space-y-2">
                  {recent.topMembers.slice(3).map((m, i) => (
                    <li key={m.discord_id} className="flex items-center gap-3 bg-pulse-bg/60 border border-pulse-border/60 rounded-xl px-3 py-2.5">
                      <Avatar url={m.avatar_url} name={m.username} rank={i + 3} />
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
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
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
