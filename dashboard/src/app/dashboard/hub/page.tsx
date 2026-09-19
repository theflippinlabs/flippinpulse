import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function loadQuickStats() {
  const [games, tournois, cosmetics, lottery] = await Promise.all([
    supabase.from('games_config').select('is_enabled', { count: 'exact' }),
    supabase.from('tournaments').select('*', { count: 'exact', head: true }),
    supabase.from('user_cosmetics').select('*', { count: 'exact', head: true }),
    supabase.from('lottery_rounds').select('pot_pulse').eq('status', 'active').maybeSingle(),
  ]);
  const enabled = (games.data ?? []).filter(g => (g as { is_enabled?: boolean }).is_enabled).length;
  return {
    gamesEnabled: enabled,
    gamesTotal: games.data?.length ?? 0,
    tournois: tournois.count ?? 0,
    cosmetics: cosmetics.count ?? 0,
    lotteryPot: (lottery.data as { pot_pulse?: number } | null)?.pot_pulse ?? 0,
  };
}

const CARDS: { href: string; emoji: string; title: string; hint: (s: Awaited<ReturnType<typeof loadQuickStats>>) => string; tint: string }[] = [
  {
    href: '/dashboard/games',
    emoji: '🎮',
    title: 'Games',
    hint: s => `${s.gamesEnabled} / ${s.gamesTotal} enabled — tap to toggle & tune`,
    tint: 'from-pulse-brand/20 to-pulse-brand/5 border-pulse-brand/30',
  },
  {
    href: '/dashboard/tournaments',
    emoji: '🏟️',
    title: 'Tournaments',
    hint: s => `${s.tournois} tournaments held so far`,
    tint: 'from-pulse-violet/20 to-pulse-violet/5 border-pulse-violet/30',
  },
  {
    href: '/dashboard/cosmetics',
    emoji: '✨',
    title: 'Cosmetics',
    hint: s => `${s.cosmetics} member${s.cosmetics === 1 ? '' : 's'} personalized`,
    tint: 'from-pulse-magenta/20 to-pulse-magenta/5 border-pulse-magenta/30',
  },
  {
    href: '/dashboard/lottery',
    emoji: '🎫',
    title: 'Lottery',
    hint: s => `Pot: ${s.lotteryPot.toLocaleString('en-US')} PULSE`,
    tint: 'from-pulse-gold/20 to-pulse-gold/5 border-pulse-gold/30',
  },
];

export default async function HubPage() {
  const s = await loadQuickStats();
  return (
    <>
      <h1 className="text-2xl md:text-3xl font-bold mb-1">
        <span className="brand-text">⚡ Hub</span>
      </h1>
      <p className="text-pulse-mute mb-6 text-sm">Tune every knob of the community from here.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CARDS.map(c => (
          <Link
            key={c.href}
            href={c.href}
            className={`block bg-gradient-to-br ${c.tint} border rounded-2xl p-4 active:scale-[0.98] transition-transform`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-3xl">{c.emoji}</div>
                <div>
                  <div className="font-bold">{c.title}</div>
                  <div className="text-xs text-pulse-mute mt-0.5">{c.hint(s)}</div>
                </div>
              </div>
              <span className="text-pulse-mute">›</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 bg-pulse-card border border-pulse-border rounded-xl p-4">
        <div className="text-xs uppercase tracking-wide text-pulse-mute mb-2">Coming soon in the Hub</div>
        <div className="text-sm text-pulse-mute">
          🧠 Novus (AI Community Manager) · 🛡️ Auto-mod tuning · 📊 Charts &amp; trends · 🎯 Missions launcher
        </div>
      </div>
    </>
  );
}
