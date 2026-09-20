import Link from 'next/link';
import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getBalance } from '@/lib/play';
import BackLink from '../BackLink';

export const dynamic = 'force-dynamic';

const TILES: { href: string; emoji: string; title: string; hint: string }[] = [
  { href: '/dashboard/play/chicken',     emoji: '🐔', title: 'Chicken Race', hint: 'Cash out before the chicken flies · up to 50×' },
  { href: '/dashboard/play/roulette',    emoji: '🎡', title: 'Roulette',     hint: 'European wheel · up to 36×' },
  { href: '/dashboard/play/blackjack',   emoji: '🃏', title: 'Blackjack',    hint: 'Beat the dealer · natural pays 2.5×' },
  { href: '/dashboard/play/slots',       emoji: '🎰', title: 'Slots',        hint: 'Spin the reels · up to 50×' },
  { href: '/dashboard/play/coinflip',    emoji: '🪙', title: 'Coin Flip',    hint: 'Heads or tails · 2×' },
  { href: '/dashboard/play/higherlower', emoji: '🔼', title: 'Higher/Lower', hint: 'Beat the number · up to 90×' },
];

export default async function PlayHub() {
  const session = getSession();
  if (!session || !isAdmin(session.id)) redirect('/');
  const balance = await getBalance(session.id);

  return (
    <>
      <BackLink />
      <h1 className="text-2xl md:text-3xl font-bold mb-1 tracking-wide">
        <span className="text-pulse-gold">🎮</span> Play
      </h1>
      <p className="text-pulse-mute mb-4 text-sm">
        Pick a game. Bets debit your PULSE balance, wins credit it, and big wins can announce in Discord.
      </p>

      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-pulse-mute tracking-wide">Your PULSE</div>
          <div className="text-3xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-xs text-pulse-mute text-right">
          <div>Bet range: <span className="text-pulse-text font-semibold">1–500</span></div>
          <div>Results sync live to Discord</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TILES.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className="group relative bg-pulse-card border border-pulse-border rounded-2xl p-4 flex items-center gap-3 hover:border-pulse-gold/40 active:scale-[0.98] transition-all"
          >
            <div className="text-4xl">{t.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold">{t.title}</div>
              <div className="text-xs text-pulse-mute">{t.hint}</div>
            </div>
            <span className="text-pulse-mute group-hover:text-pulse-gold transition-colors">›</span>
          </Link>
        ))}
      </div>
    </>
  );
}
