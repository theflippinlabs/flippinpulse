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
      .limit(5),
    supabase
      .from('tournaments')
      .select('id, title, status, pot_pulse, winner_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);
  return {
    topMembers: (topMembers.data ?? []) as Array<{ discord_id: string; username: string; points_total: number; balance_pulse: number; rank_name: string | null }>,
    recentJails: (recentJails.data ?? []) as Array<{ discord_id: string; jailed_at: string; expires_at: string | null; reason: string | null }>,
    lastTournois: (lastTournois.data ?? []) as Array<{ id: string; title: string; status: string; pot_pulse: number; winner_id: string | null; created_at: string }>,
  };
}

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-pulse-card border border-pulse-border rounded-xl p-3 md:p-5">
      <div className="text-[10px] md:text-xs uppercase tracking-wide text-pulse-mute">{label}</div>
      <div className="mt-1 text-xl md:text-3xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-[10px] md:text-xs text-pulse-mute">{hint}</div>}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function Overview() {
  const [stats, recent] = await Promise.all([loadStats(), loadRecent()]);
  return (
    <>
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <Card label="Members tracked" value={fmt(stats.members)} />
        <Card label="PULSE in wallets" value={fmt(stats.totalPulseInWallets)} hint="Sum of every balance" />
        <Card label="Active tournois" value={fmt(stats.activeTournois)} hint="open + running" />
        <Card label="Members jailed" value={fmt(stats.activeJails)} />
        <Card label="Lottery pot" value={fmt(stats.lotteryPot)} hint="Current round" />
        <Card label="Badges unlocked" value={fmt(stats.achievementsUnlocked)} hint="Across the community" />
      </div>

      <section className="mt-6 md:mt-10 grid md:grid-cols-2 gap-4 md:gap-6">
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-5">
          <h2 className="font-semibold mb-3">🏆 Top members</h2>
          <ol className="space-y-2 text-sm">
            {recent.topMembers.map((m, i) => (
              <li key={m.discord_id} className="flex justify-between border-b border-pulse-border/60 pb-2 last:border-b-0">
                <span>#{i + 1} · {m.username || m.discord_id.slice(-6)} <span className="text-pulse-mute">· {m.rank_name ?? '—'}</span></span>
                <span className="font-mono">{fmt(m.points_total ?? 0)} pts · {fmt(m.balance_pulse ?? 0)} PULSE</span>
              </li>
            ))}
            {recent.topMembers.length === 0 && <li className="text-pulse-mute">No members yet.</li>}
          </ol>
        </div>

        <div className="bg-pulse-card border border-pulse-border rounded-xl p-5">
          <h2 className="font-semibold mb-3">🔒 Recent jails</h2>
          <ol className="space-y-2 text-sm">
            {recent.recentJails.map(j => (
              <li key={j.discord_id + j.jailed_at} className="border-b border-pulse-border/60 pb-2 last:border-b-0">
                <div className="font-mono text-xs text-pulse-mute">{new Date(j.jailed_at).toLocaleString()}</div>
                <div><span className="text-pulse-brand">{j.discord_id.slice(-6)}</span> · {j.reason ?? '_no reason_'}</div>
                <div className="text-xs text-pulse-mute">
                  {j.expires_at ? `Ends ${new Date(j.expires_at).toLocaleString()}` : '⛓️ For life'}
                </div>
              </li>
            ))}
            {recent.recentJails.length === 0 && <li className="text-pulse-mute">No jails on record.</li>}
          </ol>
        </div>
      </section>

      <section className="mt-4 md:mt-6">
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 md:p-5">
          <h2 className="font-semibold mb-3">🏟️ Latest tournaments</h2>
          <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <table className="w-full text-sm min-w-[520px]">
            <thead className="text-pulse-mute uppercase text-xs">
              <tr><th className="text-left py-2">Title</th><th className="text-left">Status</th><th className="text-right">Pot</th><th className="text-right">Created</th></tr>
            </thead>
            <tbody>
              {recent.lastTournois.map(t => (
                <tr key={t.id} className="border-t border-pulse-border/60">
                  <td className="py-2">{t.title}</td>
                  <td className="capitalize">{t.status}</td>
                  <td className="text-right font-mono">{fmt(t.pot_pulse)} PULSE</td>
                  <td className="text-right text-pulse-mute">{new Date(t.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {recent.lastTournois.length === 0 && (
                <tr><td colSpan={4} className="text-pulse-mute py-2">No tournaments yet.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>
    </>
  );
}
