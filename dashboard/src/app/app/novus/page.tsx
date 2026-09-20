import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { t } from '@/lib/i18n';
import NovusClient from './NovusClient';

export const dynamic = 'force-dynamic';

export default function NovusPage() {
  const session = getSession();
  if (!session) redirect('/');
  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>{t('common.back')}</span>
      </Link>
      <h1 className="text-2xl font-bold mb-1">🧠 {t('novus.title')}</h1>
      <p className="text-pulse-mute text-sm mb-4">{t('novus.subtitle')}</p>
      <NovusClient />
    </>
  );
}
