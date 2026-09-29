import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getBalance } from '@/lib/play';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

interface Tile {
  href: string;
  emoji: string;
  title: string;
  hint: string;
  mode: 'web' | 'discord';
}

export default async function PlayHub() {
  const session = getSession();
  if (!session) redirect('/');
  const balance = await getBalance(session.id);
  const locale = getLocale();
  const fr = locale === 'fr';

  // Games playable directly on the web dashboard.
  const webTiles: Tile[] = [
    { href: '/app/play/chicken',     emoji: '🐔', title: t('play.games.chicken.title'),     hint: t('play.games.chicken.hint'),     mode: 'web' },
    { href: '/app/play/roulette',    emoji: '🎡', title: t('play.games.roulette.title'),    hint: t('play.games.roulette.hint'),    mode: 'web' },
    { href: '/app/play/blackjack',   emoji: '🃏', title: t('play.games.blackjack.title'),   hint: t('play.games.blackjack.hint'),   mode: 'web' },
    { href: '/app/play/slots',       emoji: '🎰', title: t('play.games.slots.title'),       hint: t('play.games.slots.hint'),       mode: 'web' },
    { href: '/app/play/coinflip',    emoji: '🪙', title: t('play.games.coinflip.title'),    hint: t('play.games.coinflip.hint'),    mode: 'web' },
    { href: '/app/play/higherlower', emoji: '🔼', title: t('play.games.higherlower.title'), hint: t('play.games.higherlower.hint'), mode: 'web' },
  ];

  // Games that live only on Discord — the tile links to the features
  // documentation page that lists the Discord commands to use.
  const discordTiles: Tile[] = [
    { href: '/app/features?f=poker',        emoji: '♠️', title: fr ? 'Poker'         : 'Poker',        hint: fr ? 'Texas Hold\'em multi' : 'Texas Hold\'em multi', mode: 'discord' },
    { href: '/app/features?f=party',        emoji: '💥', title: fr ? 'Crash'         : 'Crash',        hint: fr ? 'Cash out avant crash' : 'Cash out before crash', mode: 'discord' },
    { href: '/app/features?f=party',        emoji: '🎡', title: fr ? 'Roue Gacha'    : 'Gacha wheel',  hint: fr ? 'Jusqu\'à ×25'          : 'Up to ×25',              mode: 'discord' },
    { href: '/app/features?f=party',        emoji: '🏆', title: fr ? 'Battle Royale' : 'Battle Royale',hint: fr ? 'Dernier debout'         : 'Last one standing',      mode: 'discord' },
    { href: '/app/features?f=party',        emoji: '🎲', title: fr ? 'Dé Royale'     : 'Dice Royale',  hint: fr ? 'Meilleur lancer'        : 'Highest roll',           mode: 'discord' },
    { href: '/app/features?f=duel',         emoji: '⚔️', title: fr ? 'Duel'          : 'Duel',         hint: fr ? 'Défie un membre 1v1'   : 'Challenge 1v1',           mode: 'discord' },
    { href: '/app/features?f=duel',         emoji: '✊', title: fr ? 'Pierre-Feuille': 'Rock-Paper',   hint: fr ? '1v1 avec mise'          : '1v1 with a bet',         mode: 'discord' },
    { href: '/app/features?f=duel',         emoji: '⌨️', title: fr ? 'Typing Race'   : 'Typing race',  hint: fr ? 'Le plus rapide gagne'   : 'Fastest wins',           mode: 'discord' },
    { href: '/app/features?f=quiz',         emoji: '🧠', title: fr ? 'Quiz'          : 'Trivia',       hint: fr ? 'Culture générale'       : 'Trivia questions',       mode: 'discord' },
    { href: '/app/features?f=hunt',         emoji: '🗺️', title: fr ? 'Chasse au trésor' : 'Treasure hunt', hint: fr ? 'Résous l\'énigme'    : 'Solve the riddle',       mode: 'discord' },
  ];

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>{t('common.back')}</span>
      </Link>
      <h1 className="text-2xl font-bold mb-1">🎮 {t('play.title')}</h1>
      <p className="text-pulse-mute mb-4 text-sm">{t('play.subtitle')}</p>

      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 mb-5 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-pulse-mute tracking-wide">{t('common.your_pulse')}</div>
          <div className="text-3xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-xs text-pulse-mute text-right">
          <div>{t('play.bet_range')}</div>
          <div>{t('play.instant_result')}</div>
        </div>
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-pulse-mute mb-2">
        {fr ? '🌐 Jouables ici' : '🌐 Playable here'}
      </h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {webTiles.map(tile => (
          <TileLink key={tile.href} tile={tile} fr={fr} />
        ))}
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wide text-pulse-mute mb-2">
        {fr ? '💬 Sur Discord' : '💬 On Discord'}
      </h2>
      <p className="text-xs text-pulse-mute mb-3">
        {fr
          ? 'Ces jeux se lancent avec des commandes Discord. Tape sur une carte pour voir la commande.'
          : 'These games run through Discord commands. Tap a card to see the command.'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {discordTiles.map((tile, i) => (
          <TileLink key={`${tile.href}-${i}`} tile={tile} fr={fr} />
        ))}
      </div>
    </>
  );
}

function TileLink({ tile, fr }: { tile: Tile; fr: boolean }) {
  const badge = tile.mode === 'web'
    ? (fr ? 'Web' : 'Web')
    : (fr ? 'Discord' : 'Discord');
  const badgeClass = tile.mode === 'web'
    ? 'bg-pulse-gold/20 text-pulse-gold border-pulse-gold/40'
    : 'bg-pulse-violet/20 text-pulse-violet border-pulse-violet/40';
  return (
    <Link
      href={tile.href}
      className="group relative bg-pulse-card border border-pulse-border rounded-2xl p-4 flex items-center gap-3 hover:border-pulse-gold/40 active:scale-[0.98] transition-all"
    >
      <div className="text-4xl">{tile.emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{tile.title}</div>
        <div className="text-[11px] text-pulse-mute truncate">{tile.hint}</div>
      </div>
      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${badgeClass}`}>
        {badge}
      </span>
    </Link>
  );
}
