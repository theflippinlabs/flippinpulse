import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getBalance } from '@/lib/play';
import BlackjackClient from '@/app/dashboard/play/blackjack/BlackjackClient';

export const dynamic = 'force-dynamic';

export default async function BlackjackPage() {
  const session = getSession();
  if (!session) redirect('/');
  const balance = await getBalance(session.id);
  return (
    <>
      <Link href="/app/play" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>Retour aux jeux</span>
      </Link>
      <h1 className="text-xl md:text-2xl font-bold mb-4">🃏 Blackjack</h1>
      <BlackjackClient initialBalance={balance} />
    </>
  );
}
