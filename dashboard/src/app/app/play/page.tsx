import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getBalance } from '@/lib/play';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function PlayHub() {
  const session = getSession();
  if (!session) redirect('/');
  const balance = await getBalance(session.id);

  const TILES = [
    { href: '/app/play/chicken',     emoji: '🐔', title: t('play.games.chicken.title'),     hint: t('play.games.chicken.hint') },
    { href: '/app/play/roulette',    emoji: '🎡', title: t('play.games.roulette.title'),    hint: t('play.games.roulette.hint') },
    { href: '/app/play/blackjack',   emoji: '🃏', title: t('play.games.blackjack.title'),   hint: t('play.games.blackjack.hint') },
    { href: '/app/play/slots',       emoji: '🎰', title: t('play.games.slots.title'),       hint: t('play.games.slots.hint') },
    { href: '/app/play/coinflip',    emoji: '🪙', title: t('play.games.coinflip.title'),    hint: t('play.games.coinflip.hint') },
    { href: '/app/play/higherlower', emoji: '🔼', title: t('play.games.higherlower.title'), hint: t('play.games.higherlower.hint') },
  ];

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>{t('common.back')}</span>
      </Link>
      <h1 className="text-2xl font-bold mb-1">🎮 {t('play.title')}</h1>
      <p className="text-pulse-mute mb-4 text-sm">{t('play.subtitle')}</p>

      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-pulse-mute tracking-wide">{t('common.your_pulse')}</div>
          <div className="text-3xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-xs text-pulse-mute text-right">
          <div>{t('play.bet_range')}</div>
          <div>{t('play.instant_result')}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {TILES.map(tile => (
          <Link
            key={tile.href}
            href={tile.href}
            className="group relative bg-pulse-card border border-pulse-border rounded-2xl p-4 flex items-center gap-3 hover:border-pulse-gold/40 active:scale-[0.98] transition-all"
          >
            <div className="text-4xl">{tile.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{tile.title}</div>
              <div className="text-[11px] text-pulse-mute">{tile.hint}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
