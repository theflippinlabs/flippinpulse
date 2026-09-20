import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { redirect } from 'next/navigation';
import { loadChannels } from '@/lib/channels';
import { getBalance } from '@/lib/play';
import RouletteClient from '@/app/dashboard/play/roulette/RouletteClient';

export const dynamic = 'force-dynamic';

export default async function RoulettePage() {
  const session = getSession();
  if (!session) redirect('/');
  const [balance, channels] = await Promise.all([getBalance(session.id), loadChannels()]);
  return (
    <>
      <Link href="/app/play" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>{t('play.back_to_games')}</span>
      </Link>
      <h1 className="text-xl md:text-2xl font-bold mb-4">🎡 Roulette</h1>
      <RouletteClient initialBalance={balance} channels={channels} />
    </>
  );
}
