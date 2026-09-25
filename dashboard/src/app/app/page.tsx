import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

async function loadMemberStats(discordId: string) {
  const [me, activeTournois, lotteryRound, activeMissions, activeGiveaways, activeSagas, activeHunts, upcomingEvents] = await Promise.all([
    supabase.from('discord_users').select('username, balance_pulse, points_total, points_week, rank_name, streak').eq('discord_id', discordId).maybeSingle(),
    supabase.from('tournaments').select('*', { count: 'exact', head: true }).in('status', ['open', 'running']),
    supabase.from('lottery_rounds').select('pot_pulse').eq('status', 'active').maybeSingle(),
    supabase.from('pulse_challenges').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('giveaways').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('sagas').select('*', { count: 'exact', head: true }).eq('status', 'running'),
    supabase.from('treasure_hunts').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('server_events').select('*', { count: 'exact', head: true }).eq('status', 'scheduled'),
  ]);
  return {
    me: (me.data as { username: string; balance_pulse: number; points_total: number; points_week: number; rank_name: string | null; streak: number } | null) ?? null,
    activeTournois: activeTournois.count ?? 0,
    lotteryPot: (lotteryRound.data as { pot_pulse?: number } | null)?.pot_pulse ?? 0,
    activeMissions: activeMissions.count ?? 0,
    activeGiveaways: activeGiveaways.count ?? 0,
    activeSagas: activeSagas.count ?? 0,
    activeHunts: activeHunts.count ?? 0,
    upcomingEvents: upcomingEvents.count ?? 0,
  };
}

const fmt = (n: number) => n.toLocaleString('en-US');

interface Tile { href: string; emoji: string; title: string; hint: string }

export default async function AppHub() {
  const session = getSession();
  if (!session) redirect('/');
  const s = await loadMemberStats(session.id);

  const locale = t('nav.home') === 'Home' ? 'en' : 'fr';
  const fr = locale === 'fr';

  // Play / Shop / Leaderboard / Novus already live in the bottom nav, so keep
  // the home tiles for content that is NOT reachable from that nav.
  const tiles: Tile[] = [
    { href: '/app/battlepass',       emoji: '🎫', title: fr ? 'Battle Pass'   : 'Battle Pass', hint: fr ? 'Saison en cours'   : 'Current season' },
    { href: '/app/pet',              emoji: '🐾', title: fr ? 'Compagnon'     : 'Pet',         hint: fr ? 'Nourris, entraîne' : 'Feed, train'      },
    { href: '/app/cards',            emoji: '🎴', title: fr ? 'Cartes'        : 'Cards',       hint: fr ? 'Collection & packs': 'Collection & packs' },
    { href: '/app/compagnon',        emoji: '💫', title: fr ? 'Compagnon IA'  : 'AI Companion',hint: fr ? 'Ton IA perso'      : 'Your personal AI'  },
    { href: '/app/tournaments',      emoji: '🏟️', title: t('home.tiles.tournaments.title'), hint: `${s.activeTournois} ${t('home.tiles.tournaments.hint_active')}` },
    { href: '/app/lottery',          emoji: '🎰', title: t('home.tiles.lottery.title'),     hint: `${fmt(s.lotteryPot)} ${t('home.tiles.lottery.hint_pot')}` },
    { href: '/app/missions',         emoji: '🎯', title: t('home.tiles.missions.title'),    hint: `${s.activeMissions} ${t('home.tiles.missions.hint_active')}` },
    { href: '/app/giveaways',        emoji: '🎉', title: t('home.tiles.giveaways.title'),   hint: `${s.activeGiveaways} ${t('home.tiles.giveaways.hint_active')}` },
    { href: '/app/features?f=sagas',    emoji: '📖', title: fr ? 'Sagas'           : 'Sagas',           hint: `${s.activeSagas} ${fr ? 'en cours' : 'running'}` },
    { href: '/app/features?f=hunt',     emoji: '🗺️', title: fr ? 'Chasses au trésor' : 'Treasure hunts', hint: `${s.activeHunts} ${fr ? 'énigmes' : 'riddles'}` },
    { href: '/app/features?f=guilds',   emoji: '🏰', title: fr ? 'Guildes'         : 'Guilds',          hint: fr ? 'Rejoins ou crée'  : 'Join or create'    },
    { href: '/app/features?f=events',   emoji: '📅', title: fr ? 'Calendrier'      : 'Calendar',        hint: `${s.upcomingEvents} ${fr ? 'à venir' : 'upcoming'}` },
    { href: '/app/features?f=marriage', emoji: '💒', title: fr ? 'Mariages'        : 'Marriages',       hint: fr ? '500 PULSE la bague': 'Ring: 500 PULSE'    },
    { href: '/app/features?f=bank',     emoji: '🏦', title: fr ? 'Banque & prêts'  : 'Bank & loans',    hint: fr ? '1%/sem sur épargne': '1%/wk on savings'   },
    { href: '/app/features?f=birthday', emoji: '🎂', title: fr ? 'Anniversaires'   : 'Birthdays',       hint: fr ? '+500 PULSE le jour J' : '+500 PULSE on D-day' },
    { href: '/app/features?f=stream',   emoji: '🎥', title: fr ? 'Streams'         : 'Streams',         hint: fr ? 'Twitch/YouTube/X'   : 'Twitch/YouTube/X'   },
  ];

  return (
    <>
      <h1 className="text-2xl font-bold mb-1 tracking-wide">
        {t('home.hi')} <span className="text-pulse-gold">{s.me?.username ?? session.username}</span>
      </h1>
      <p className="text-pulse-mute mb-4 text-sm">{t('home.hub_sub')}</p>

      <div className="bg-gradient-to-br from-pulse-gold/25 to-pulse-gold/5 border border-pulse-gold/40 rounded-2xl p-4 mb-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-card-glow opacity-40 pointer-events-none" />
        <div className="relative">
          <div className="text-xs uppercase text-pulse-mute tracking-wide">{t('common.balance')}</div>
          <div className="text-4xl font-bold text-pulse-gold">{fmt(s.me?.balance_pulse ?? 0)} PULSE</div>
          <div className="flex items-center gap-3 text-xs text-pulse-mute mt-2">
            <span>🔥 {t('home.streak')}: <b className="text-pulse-text">{s.me?.streak ?? 0}</b></span>
            <span>·</span>
            <span>{fmt(s.me?.points_total ?? 0)} {t('home.points_total')}</span>
            <span>·</span>
            <span>{fmt(s.me?.points_week ?? 0)} {t('home.this_week')}</span>
          </div>
          {s.me?.rank_name && (
            <div className="mt-2 inline-block text-[10px] px-2 py-0.5 rounded bg-pulse-gold/20 text-pulse-gold border border-pulse-gold/40">
              {s.me.rank_name}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map(tile => (
          <Link
            key={tile.href}
            href={tile.href}
            className="group relative bg-pulse-card border border-pulse-border rounded-2xl overflow-hidden active:scale-[0.98] transition-all hover:border-pulse-gold/50"
          >
            <div className="absolute inset-0 bg-card-glow opacity-50 pointer-events-none" />
            <div className="relative flex items-center gap-3 p-4">
              <div className="text-4xl leading-none shrink-0">{tile.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm truncate">{tile.title}</div>
                <div className="text-[11px] text-pulse-mute truncate">{tile.hint}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
