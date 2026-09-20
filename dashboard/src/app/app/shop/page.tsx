import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getBalance } from '@/lib/play';
import { loadItems } from '@/lib/shop';
import ShopClient from '@/app/dashboard/shop/ShopClient';

export const dynamic = 'force-dynamic';

export default async function MemberShopPage() {
  const session = getSession();
  if (!session) redirect('/');
  const [balance, items] = await Promise.all([getBalance(session.id), loadItems(false)]);

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>Retour</span>
      </Link>
      <h1 className="text-2xl md:text-3xl font-bold mb-1 tracking-wide">
        <span className="text-pulse-gold">🛍️</span> Boutique
      </h1>
      <p className="text-pulse-mute text-sm mt-1 mb-4">
        Dépense ton PULSE pour des titres, couleurs, perks et récompenses.
      </p>

      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-pulse-mute tracking-wide">Ton PULSE</div>
          <div className="text-3xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-xs text-pulse-mute text-right">
          <div>{items.length} article{items.length > 1 ? 's' : ''}</div>
          <div>Paiement instantané</div>
        </div>
      </div>

      <ShopClient items={items} initialBalance={balance} />
    </>
  );
}
