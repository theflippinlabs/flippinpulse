import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function loadQuickStats() {
  const [games, tournois, cosmetics, lottery, pulsar, missions, mod, jails] = await Promise.all([
    supabase.from('games_config').select('is_enabled'),
    supabase.from('tournaments').select('*', { count: 'exact', head: true }),
    supabase.from('user_cosmetics').select('*', { count: 'exact', head: true }),
    supabase.from('lottery_rounds').select('pot_pulse').eq('status', 'active').maybeSingle(),
    supabase.from('settings').select('value_json').eq('key', 'pulsar_config').maybeSingle(),
    supabase.from('pulse_challenges').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('settings').select('value_json').eq('key', 'mod_config').maybeSingle(),
    supabase.from('jailed_members').select('*', { count: 'exact', head: true }),
  ]);
  const enabled = (games.data ?? []).filter(g => (g as { is_enabled?: boolean }).is_enabled).length;
  const pulsarCfg = (pulsar.data as { value_json?: { enabled?: boolean } } | null)?.value_json ?? {};
  const modCfg = (mod.data as { value_json?: { automod_enabled?: boolean } } | null)?.value_json ?? {};
  return {
    gamesEnabled: enabled,
    gamesTotal: games.data?.length ?? 0,
    tournois: tournois.count ?? 0,
    cosmetics: cosmetics.count ?? 0,
    lotteryPot: (lottery.data as { pot_pulse?: number } | null)?.pot_pulse ?? 0,
    novusOn: pulsarCfg.enabled === true,
    activeMissions: missions.count ?? 0,
    automodOn: modCfg.automod_enabled === true,
    jailed: jails.count ?? 0,
  };
}

interface Tile {
  href: string;
  emoji: string;
  title: string;
  hint: string;
  accent?: string;
}

export default async function HubPage() {
  const s = await loadQuickStats();
  const tiles: Tile[] = [
    { href: '/dashboard/play',        emoji: '🎮', title: 'Play',        hint: 'Slots · Coin · H/L — live PULSE' },
    { href: '/dashboard/shop',        emoji: '🛍️', title: 'Boutique',    hint: 'Dépense ton PULSE' },
    { href: '/dashboard/reserve',     emoji: '💰', title: 'Réserve',     hint: 'Drops · Giveaways · PULSE gift' },
    { href: '/dashboard/games',       emoji: '⚙️', title: 'Games',       hint: `${s.gamesEnabled} / ${s.gamesTotal} ON` },
    { href: '/dashboard/tournaments', emoji: '🏟️', title: 'Tournaments', hint: `${s.tournois} held` },
    { href: '/dashboard/lottery',     emoji: '🎫', title: 'Lottery',     hint: `${s.lotteryPot.toLocaleString('en-US')} pot` },
    { href: '/dashboard/novus',       emoji: '🧠', title: 'Novus',       hint: s.novusOn ? 'ON — AI running' : 'OFF' },
    { href: '/dashboard/missions',    emoji: '🎯', title: 'Missions',    hint: `${s.activeMissions} active` },
    { href: '/dashboard/cosmetics',   emoji: '✨', title: 'Cosmetics',   hint: `${s.cosmetics} bought` },
    { href: '/dashboard/automod',     emoji: '🛡️', title: 'Auto-mod',    hint: s.automodOn ? 'ON — guarding chat' : 'OFF' },
    { href: '/dashboard/jails',       emoji: '🔒', title: 'Jails',       hint: `${s.jailed} jailed` },
  ];

  return (
    <>
      <h1 className="text-2xl md:text-3xl font-bold mb-1 tracking-wide">
        <span className="text-pulse-gold">⚡</span> Hub
      </h1>
      <p className="text-pulse-mute mb-6 text-sm">Tune every knob of the community from here.</p>

      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className="group relative aspect-square bg-pulse-card border border-pulse-border rounded-2xl overflow-hidden active:scale-[0.97] transition-transform hover:border-pulse-gold/50"
          >
            <div className="absolute inset-0 bg-card-glow opacity-60 pointer-events-none" />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-brand-glow pointer-events-none" />

            <div className="relative h-full flex flex-col items-center justify-center p-2 text-center">
              <div className="text-3xl leading-none mb-1">{t.emoji}</div>
              <div className="font-bold text-xs tracking-wide">{t.title}</div>
              <div className="text-[10px] text-pulse-mute mt-0.5 line-clamp-1 px-1">{t.hint}</div>
            </div>
          </Link>
        ))}
      </div>

    </>
  );
}
