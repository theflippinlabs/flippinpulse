import { getSession, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getBalance } from '@/lib/play';
import { loadItems } from '@/lib/shop';
import BackLink from '../BackLink';
import ShopClient from './ShopClient';

export const dynamic = 'force-dynamic';

export default async function ShopPage() {
  const session = getSession();
  if (!session || !isAdmin(session.id)) redirect('/');
  const [balance, items] = await Promise.all([getBalance(session.id), loadItems(false)]);

  return (
    <>
      <BackLink />
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-wide">
            <span className="text-pulse-gold">🛍️</span> Boutique
          </h1>
          <p className="text-pulse-mute text-sm mt-1">
            Dépense ton PULSE pour des titres, couleurs, perks et récompenses.
          </p>
        </div>
        <a href="/dashboard/shop/manage" className="text-xs bg-pulse-border/40 border border-pulse-border text-pulse-mute hover:text-pulse-gold hover:border-pulse-gold/40 px-3 py-1.5 rounded-lg whitespace-nowrap">
          ⚙️ Gérer
        </a>
      </div>

      <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-pulse-mute tracking-wide">Ton PULSE</div>
          <div className="text-3xl font-bold text-pulse-gold">{balance.toLocaleString('en-US')}</div>
        </div>
        <div className="text-xs text-pulse-mute text-right">
          <div>{items.length} article{items.length > 1 ? 's' : ''} en vente</div>
          <div>Paiement instantané</div>
        </div>
      </div>

      <ShopClient items={items} initialBalance={balance} />
    </>
  );
}
