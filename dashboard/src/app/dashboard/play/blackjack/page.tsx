import Link from 'next/link';
import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getBalance } from '@/lib/play';
import BlackjackClient from './BlackjackClient';

export const dynamic = 'force-dynamic';

export default async function BlackjackPage() {
  const session = getSession();
  if (!session || !isAdmin(session.id)) redirect('/');
  const balance = await getBalance(session.id);
  return (
    <>
      <Link href="/dashboard/play" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>Back to Play</span>
      </Link>
      <h1 className="text-xl md:text-2xl font-bold mb-4">🃏 Blackjack</h1>
      <BlackjackClient initialBalance={balance} />
    </>
  );
}
