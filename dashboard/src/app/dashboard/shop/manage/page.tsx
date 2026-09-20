import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { loadItems } from '@/lib/shop';
import Link from 'next/link';
import ManageClient from './ManageClient';

export const dynamic = 'force-dynamic';

export default async function ShopManagePage() {
  const session = getSession();
  if (!session || !isAdmin(session.id)) redirect('/');
  const items = await loadItems(true);

  return (
    <>
      <Link href="/dashboard/shop" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>Retour à la boutique</span>
      </Link>
      <h1 className="text-2xl md:text-3xl font-bold mb-1 tracking-wide">
        <span className="text-pulse-gold">⚙️</span> Gérer la boutique
      </h1>
      <p className="text-pulse-mute mb-5 text-sm">
        Ajoute, modifie ou retire des articles. Les changements sont immédiats.
      </p>
      <ManageClient initial={items} />
    </>
  );
}
