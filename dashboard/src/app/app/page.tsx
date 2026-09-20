import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function loadMemberStats(discordId: string) {
  const [me, activeTournois, lotteryRound, activeMissions, activeGiveaways] = await Promise.all([
    supabase.from('discord_users').select('username, balance_pulse, points_total, points_week, rank_name, streak').eq('discord_id', discordId).maybeSingle(),
    supabase.from('tournaments').select('*', { count: 'exact', head: true }).in('status', ['open', 'running']),
    supabase.from('lottery_rounds').select('pot_pulse').eq('status', 'active').maybeSingle(),
    supabase.from('pulse_challenges').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('giveaways').select('*', { count: 'exact', head: true }).eq('status', 'active'),
  ]);
  return {
    me: (me.data as { username: string; balance_pulse: number; points_total: number; points_week: number; rank_name: string | null; streak: number } | null) ?? null,
    activeTournois: activeTournois.count ?? 0,
    lotteryPot: (lotteryRound.data as { pot_pulse?: number } | null)?.pot_pulse ?? 0,
    activeMissions: activeMissions.count ?? 0,
    activeGiveaways: activeGiveaways.count ?? 0,
  };
}

const fmt = (n: number) => n.toLocaleString('en-US');

interface Tile { href: string; emoji: string; title: string; hint: string }

export default async function AppHub() {
  const session = getSession();
  if (!session) redirect('/');
  const s = await loadMemberStats(session.id);

  const tiles: Tile[] = [
    { href: '/app/play',        emoji: '🎮', title: 'Jouer',      hint: 'Slots · Coin · Roulette · BJ' },
    { href: '/app/shop',        emoji: '🛍️', title: 'Boutique',   hint: 'Dépense ton PULSE' },
    { href: '/app/tournaments', emoji: '🏟️', title: 'Tournois',   hint: `${s.activeTournois} en cours` },
    { href: '/app/lottery',     emoji: '🎫', title: 'Loterie',    hint: `${fmt(s.lotteryPot)} au pot` },
    { href: '/app/missions',    emoji: '🎯', title: 'Missions',   hint: `${s.activeMissions} actives` },
    { href: '/app/leaderboard', emoji: '🏆', title: 'Classement', hint: 'Top members' },
    { href: '/app/novus',       emoji: '🧠', title: 'Novus',      hint: 'Pose ta question' },
    { href: '/app/giveaways',   emoji: '🎉', title: 'Giveaways',  hint: `${s.activeGiveaways} actifs` },
  ];

  return (
    <>
      <h1 className="text-2xl font-bold mb-1 tracking-wide">
        Salut <span className="text-pulse-gold">{s.me?.username ?? session.username}</span>
      </h1>
      <p className="text-pulse-mute mb-4 text-sm">Ton hub Novarys.</p>

      {/* Balance card */}
      <div className="bg-gradient-to-br from-pulse-gold/25 to-pulse-gold/5 border border-pulse-gold/40 rounded-2xl p-4 mb-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-card-glow opacity-40 pointer-events-none" />
        <div className="relative">
          <div className="text-xs uppercase text-pulse-mute tracking-wide">Ton solde</div>
          <div className="text-4xl font-bold text-pulse-gold">{fmt(s.me?.balance_pulse ?? 0)} PULSE</div>
          <div className="flex items-center gap-3 text-xs text-pulse-mute mt-2">
            <span>🔥 Streak: <b className="text-pulse-text">{s.me?.streak ?? 0}</b></span>
            <span>·</span>
            <span>{fmt(s.me?.points_total ?? 0)} pts total</span>
            <span>·</span>
            <span>{fmt(s.me?.points_week ?? 0)} cette semaine</span>
          </div>
          {s.me?.rank_name && (
            <div className="mt-2 inline-block text-[10px] px-2 py-0.5 rounded bg-pulse-gold/20 text-pulse-gold border border-pulse-gold/40">
              {s.me.rank_name}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className="group relative aspect-square bg-pulse-card border border-pulse-border rounded-2xl overflow-hidden active:scale-[0.97] transition-transform hover:border-pulse-gold/50"
          >
            <div className="absolute inset-0 bg-card-glow opacity-60 pointer-events-none" />
            <div className="relative h-full flex flex-col items-center justify-center p-3 text-center">
              <div className="text-4xl leading-none mb-2">{t.emoji}</div>
              <div className="font-bold text-sm">{t.title}</div>
              <div className="text-[11px] text-pulse-mute mt-0.5 line-clamp-1">{t.hint}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
