import { supabase } from '@/lib/supabase';
import { loadChannels } from '@/lib/channels';
import BackLink from '../BackLink';
import ReserveClient, { type MemberOption } from './ReserveClient';

export const dynamic = 'force-dynamic';

interface RecentGiveaway {
  id: string;
  prize: string;
  prize_pulse: number | null;
  winners_count: number;
  status: 'active' | 'ended' | 'cancelled';
  end_at: string;
  created_at: string;
}

async function loadReserveStats() {
  const [totalMinted, totalInWallets, giveaways, memberCount, members] = await Promise.all([
    // Every positive pulse_transactions row is PULSE that entered the economy.
    supabase.from('pulse_transactions').select('amount').gt('amount', 0),
    supabase.from('discord_users').select('balance_pulse'),
    supabase
      .from('giveaways')
      .select('id, prize, prize_pulse, winners_count, status, end_at, created_at')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase.from('discord_users').select('*', { count: 'exact', head: true }),
    supabase
      .from('discord_users')
      .select('discord_id, username, avatar_url, balance_pulse')
      .order('points_total', { ascending: false })
      .limit(500),
  ]);

  const minted = (totalMinted.data ?? []).reduce(
    (s, r) => s + ((r as { amount?: number }).amount ?? 0),
    0,
  );
  const inWallets = (totalInWallets.data ?? []).reduce(
    (s, r) => s + ((r as { balance_pulse?: number }).balance_pulse ?? 0),
    0,
  );
  return {
    minted,
    inWallets,
    giveaways: (giveaways.data ?? []) as RecentGiveaway[],
    memberCount: memberCount.count ?? 0,
    members: (members.data ?? []) as MemberOption[],
  };
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function ReservePage() {
  const [stats, channels] = await Promise.all([loadReserveStats(), loadChannels()]);
  return (
    <>
      <BackLink href="/dashboard/hub" />
      <h1 className="text-2xl md:text-3xl font-bold mb-1 tracking-wide">
        <span className="text-pulse-gold">💰</span> Réserve
      </h1>
      <p className="text-pulse-mute mb-5 text-sm">
        Distribute PULSE from the community reserve. Giveaways run a timed contest with random winners; drops give N random members X PULSE right now.
      </p>

      {/* Reserve headline */}
      <div className="bg-gradient-to-br from-pulse-gold/25 to-pulse-gold/5 border border-pulse-gold/40 rounded-2xl p-5 mb-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-card-glow opacity-40 pointer-events-none" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-pulse-mute">PULSE minted (all-time)</div>
            <div className="text-4xl font-bold text-pulse-gold mt-1">{fmt(stats.minted)}</div>
            <div className="text-xs text-pulse-mute mt-1">
              {fmt(stats.inWallets)} currently in wallets · {stats.memberCount} members
            </div>
          </div>
          <div className="text-5xl">💰</div>
        </div>
      </div>

      <ReserveClient channels={channels} memberCount={stats.memberCount} members={stats.members} />

      {/* Recent giveaways */}
      <section className="mt-6">
        <h2 className="font-semibold mb-3">🎉 Recent giveaways</h2>
        {stats.giveaways.length === 0 ? (
          <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 text-sm text-pulse-mute text-center">
            No giveaways yet. Launch one above.
          </div>
        ) : (
          <ul className="space-y-2">
            {stats.giveaways.map(g => (
              <li key={g.id} className="bg-pulse-card border border-pulse-border rounded-xl p-3 flex items-center gap-3">
                <div className="text-2xl">
                  {g.status === 'active' ? '⏳' : g.status === 'ended' ? '✅' : '✖️'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{g.prize}</div>
                  <div className="text-xs text-pulse-mute">
                    {g.winners_count} winner{g.winners_count > 1 ? 's' : ''}
                    {g.prize_pulse ? ` · ${fmt(g.prize_pulse)} PULSE each` : ''}
                    {' · '}
                    {new Date(g.end_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded ${
                  g.status === 'active'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : g.status === 'ended'
                    ? 'bg-pulse-border/30 text-pulse-mute border border-pulse-border'
                    : 'bg-red-500/20 text-red-300 border border-red-500/40'
                }`}>
                  {g.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
