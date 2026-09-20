import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getBalance } from '@/lib/play';

export const dynamic = 'force-dynamic';

const TILES = [
  { href: '/app/play/chicken',     emoji: '🐔', title: 'Chicken Race',   hint: 'Jusqu\'à 50×' },
  { href: '/app/play/roulette',    emoji: '🎡', title: 'Roulette',       hint: 'Jusqu\'à 36×' },
  { href: '/app/play/blackjack',   emoji: '🃏', title: 'Blackjack',      hint: 'BJ paie 2.5×' },
  { href: '/app/play/slots',       emoji: '🎰', title: 'Slots',          hint: 'Jusqu\'à 50×' },
  { href: '/app/play/coinflip',    emoji: '🪙', title: 'Coin Flip',      hint: '2×' },
  { href: '/app/play/higherlower', emoji: '🔼', title: 'Higher / Lower', hint: 'Jusqu\'à 90×' },
];

export default async function PlayHub() {
  const session = getSession();
  if (!session) redirect('/');
  const balance = await getBalance(session.id);

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>Retour</span>
      </Link>
      <h1 className="text-2xl font-bold mb-1">🎮 Jouer</h1>
      <p className="text-pulse-mute mb-4 text-sm">Choisis un jeu. Les mises débitent, les gains créditent, tout suit ton compte PULSE.</p>

      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-pulse-mute tracking-wide">Ton PULSE</div>
          <div className="text-3xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-xs text-pulse-mute text-right">
          <div>Mise 1–500</div>
          <div>Résultat immédiat</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {TILES.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className="group relative bg-pulse-card border border-pulse-border rounded-2xl p-4 flex items-center gap-3 hover:border-pulse-gold/40 active:scale-[0.98] transition-all"
          >
            <div className="text-4xl">{t.emoji}</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{t.title}</div>
              <div className="text-[11px] text-pulse-mute">{t.hint}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
