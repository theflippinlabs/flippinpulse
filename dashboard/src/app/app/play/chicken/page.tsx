import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { loadChannels } from '@/lib/channels';
import { getBalance } from '@/lib/play';
import ChickenClient from '@/app/dashboard/play/chicken/ChickenClient';

export const dynamic = 'force-dynamic';

export default async function ChickenPage() {
  const session = getSession();
  if (!session) redirect('/');
  const [balance, channels] = await Promise.all([getBalance(session.id), loadChannels()]);
  return (
    <>
      <Link href="/app/play" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>Retour aux jeux</span>
      </Link>
      <h1 className="text-xl md:text-2xl font-bold mb-4">🐔 Chicken Race</h1>
      <ChickenClient initialBalance={balance} channels={channels} />
    </>
  );
}
