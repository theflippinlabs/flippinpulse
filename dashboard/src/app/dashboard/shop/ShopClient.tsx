'use client';

import { useMemo, useState } from 'react';
import type { ShopItem, ShopCategory } from '@/lib/shop';

const CATEGORY_META: Record<ShopCategory, { emoji: string; label: string; tint: string }> = {
  role:     { emoji: '👑', label: 'Rôles',     tint: 'from-purple-500/20 to-purple-500/5 border-purple-500/30' },
  perk:     { emoji: '⚡', label: 'Perks',     tint: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30' },
  ticket:   { emoji: '🎟️', label: 'Tickets',   tint: 'from-orange-500/20 to-orange-500/5 border-orange-500/30' },
  cosmetic: { emoji: '✨', label: 'Cosmétique', tint: 'from-pink-500/20 to-pink-500/5 border-pink-500/30' },
  irl:      { emoji: '📦', label: 'IRL',       tint: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30' },
};

const fmt = (n: number) => n.toLocaleString('en-US');

export default function ShopClient({ items, initialBalance }: { items: ShopItem[]; initialBalance: number }) {
  const [balance, setBalance] = useState(initialBalance);
  const [filter, setFilter] = useState<ShopCategory | 'all'>('all');
  const [buying, setBuying] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ item: string; ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter(i => i.category === filter)),
    [items, filter],
  );

  const grouped = useMemo(() => {
    const m = new Map<ShopCategory, ShopItem[]>();
    for (const i of visible) {
      const arr = m.get(i.category) ?? [];
      arr.push(i);
      m.set(i.category, arr);
    }
    return m;
  }, [visible]);

  const buy = async (item: ShopItem) => {
    if (buying) return;
    if (balance < item.price_pulse) {
      setFeedback({ item: item.id, ok: false, text: `Il te manque ${fmt(item.price_pulse - balance)} PULSE.` });
      return;
    }
    if (!confirm(`Acheter "${item.name}" pour ${fmt(item.price_pulse)} PULSE ?`)) return;
    setBuying(item.id);
    setFeedback(null);
    try {
      const res = await fetch('/api/shop/buy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ item_id: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setBalance(data.newBalance);
      const msg = data.orderStatus === 'FULFILLED'
        ? '✅ Acheté — appliqué immédiatement !'
        : '✅ Acheté — en attente d\'approbation admin.';
      setFeedback({ item: item.id, ok: true, text: msg });
      if (data.orderStatus === 'PENDING') {
        setPending(p => new Set(p).add(item.id));
      }
    } catch (err) {
      setFeedback({ item: item.id, ok: false, text: err instanceof Error ? err.message : 'Échec.' });
    } finally {
      setBuying(null);
    }
  };

  return (
    <>
      {/* Balance chip visible while scrolling */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-pulse-bg/80 backdrop-blur border-b border-pulse-border/60 mb-3 flex items-center justify-between">
        <div className="text-xs uppercase text-pulse-mute">Ton solde</div>
        <div className="text-lg font-bold text-pulse-gold">{fmt(balance)} PULSE</div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4 pb-1">
        <button
          onClick={() => setFilter('all')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${filter === 'all' ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}
        >
          Tout
        </button>
        {(Object.keys(CATEGORY_META) as ShopCategory[]).map(c => {
          const meta = CATEGORY_META[c];
          const count = items.filter(i => i.category === c).length;
          if (count === 0) return null;
          return (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${filter === c ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}
            >
              <span>{meta.emoji}</span>
              <span>{meta.label}</span>
              <span className="opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-6 text-center">
          <div className="text-4xl mb-2">🕸️</div>
          <div className="font-semibold">Boutique vide</div>
          <div className="text-sm text-pulse-mute mt-1">Ajoute des articles via la page <a href="/dashboard/shop/manage" className="text-pulse-gold underline">Gérer</a>.</div>
        </div>
      )}

      {/* Sections by category */}
      {Array.from(grouped.entries()).map(([cat, list]) => {
        const meta = CATEGORY_META[cat];
        return (
          <section key={cat} className="mb-5">
            <div className="text-xs uppercase tracking-wide text-pulse-mute mb-2 flex items-center gap-2">
              <span className="text-base">{meta.emoji}</span>
              <span className="font-semibold">{meta.label}</span>
              <span className="text-pulse-border">·</span>
              <span>{list.length}</span>
            </div>
            <div className="space-y-2">
              {list.map(item => {
                const stock = item.stock_remaining;
                const outOfStock = stock !== null && stock <= 0;
                const cantAfford = balance < item.price_pulse;
                const isPending = pending.has(item.id);
                const isBuying = buying === item.id;
                const fb = feedback?.item === item.id ? feedback : null;
                return (
                  <div
                    key={item.id}
                    className={`bg-gradient-to-br ${meta.tint} border rounded-xl p-3 relative overflow-hidden`}
                  >
                    <div className="flex items-start gap-3">
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center text-2xl shrink-0">
                          {meta.emoji}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{item.name}</div>
                        {item.description && (
                          <div className="text-xs text-pulse-mute mt-0.5 line-clamp-2">{item.description}</div>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-pulse-mute">
                          {stock !== null && <span className={outOfStock ? 'text-red-300' : ''}>Stock: {stock}</span>}
                          {item.max_per_user && <span>· max {item.max_per_user}/pers</span>}
                          {!item.auto_apply && <span>· approbation manuelle</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-black text-pulse-gold">{fmt(item.price_pulse)}</div>
                        <div className="text-[9px] uppercase text-pulse-mute">PULSE</div>
                      </div>
                    </div>

                    <button
                      onClick={() => buy(item)}
                      disabled={isBuying || outOfStock || cantAfford || isPending}
                      className="w-full mt-3 py-2 rounded-lg bg-pulse-gold text-black font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed shadow-brand"
                    >
                      {isBuying ? 'Achat…' : isPending ? '✅ Acheté' : outOfStock ? 'Rupture' : cantAfford ? 'PULSE insuffisant' : `🛒 Acheter — ${fmt(item.price_pulse)}`}
                    </button>

                    {fb && (
                      <div className={`mt-2 text-xs px-2 py-1 rounded ${fb.ok ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'}`}>
                        {fb.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
