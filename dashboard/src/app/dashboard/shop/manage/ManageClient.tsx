'use client';

import { useState } from 'react';
import type { ShopItem, ShopCategory } from '@/lib/shop';

const CATEGORIES: { value: ShopCategory; emoji: string; label: string }[] = [
  { value: 'role',     emoji: '👑', label: 'Rôle' },
  { value: 'perk',     emoji: '⚡', label: 'Perk' },
  { value: 'ticket',   emoji: '🎟️', label: 'Ticket' },
  { value: 'cosmetic', emoji: '✨', label: 'Cosmétique' },
  { value: 'irl',      emoji: '📦', label: 'IRL' },
];

interface Draft {
  id?: string;
  name: string;
  description: string;
  category: ShopCategory;
  price_pulse: number;
  stock_total: number | null;
  max_per_user: number | null;
  is_active: boolean;
  auto_apply: boolean;
  image_url: string | null;
}

const empty = (): Draft => ({
  name: '',
  description: '',
  category: 'perk',
  price_pulse: 100,
  stock_total: null,
  max_per_user: 1,
  is_active: true,
  auto_apply: true,
  image_url: null,
});

const fmt = (n: number) => n.toLocaleString('en-US');

export default function ManageClient({ initial }: { initial: ShopItem[] }) {
  const [items, setItems] = useState<ShopItem[]>(initial);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openNew = () => { setEditing(empty()); setError(null); };
  const openEdit = (i: ShopItem) => {
    setError(null);
    setEditing({
      id: i.id,
      name: i.name,
      description: i.description,
      category: i.category,
      price_pulse: i.price_pulse,
      stock_total: i.stock_total,
      max_per_user: i.max_per_user,
      is_active: i.is_active,
      auto_apply: i.auto_apply,
      image_url: i.image_url,
    });
  };
  const close = () => { setEditing(null); setError(null); };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { setError('Le nom est obligatoire.'); return; }
    if (editing.price_pulse < 0) { setError('Prix invalide.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/shop/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: editing.id ? 'update' : 'create',
          item: editing,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Refresh local list — simplest: reload the page. But we also want a
      // snappy UX, so do it optimistically here too.
      if (editing.id) {
        setItems(prev => prev.map(x => x.id === editing.id ? {
          ...x, ...editing,
          stock_remaining: editing.stock_total === null ? x.stock_remaining : editing.stock_total,
          updated_at: new Date().toISOString(),
        } as ShopItem : x));
      } else {
        setItems(prev => [{
          id: data.id,
          name: editing.name, description: editing.description,
          category: editing.category, price_pulse: editing.price_pulse,
          stock_total: editing.stock_total, stock_remaining: editing.stock_total,
          max_per_user: editing.max_per_user, cooldown_hours: 0,
          is_active: editing.is_active, auto_apply: editing.auto_apply,
          image_url: editing.image_url,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, ...prev]);
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec.');
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm('Supprimer cet article ? Cette action est définitive.')) return;
    try {
      const res = await fetch('/api/shop/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', item: { id } }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setItems(prev => prev.filter(x => x.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Échec.');
    }
  };

  const toggle = async (i: ShopItem) => {
    try {
      const res = await fetch('/api/shop/items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'update', item: { id: i.id, is_active: !i.is_active } }),
      });
      if (!res.ok) throw new Error();
      setItems(prev => prev.map(x => x.id === i.id ? { ...x, is_active: !i.is_active } : x));
    } catch {
      alert('Échec de la mise à jour.');
    }
  };

  return (
    <>
      <button
        onClick={openNew}
        className="w-full bg-pulse-gold text-black font-bold py-3 rounded-xl mb-4 shadow-brand"
      >
        ➕ Nouvel article
      </button>

      {items.length === 0 && (
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-6 text-center text-pulse-mute text-sm">
          Aucun article. Crées-en un pour ouvrir la boutique.
        </div>
      )}

      <div className="space-y-2">
        {items.map(i => {
          const cat = CATEGORIES.find(c => c.value === i.category)!;
          return (
            <div key={i.id} className={`bg-pulse-card border ${i.is_active ? 'border-pulse-border' : 'border-red-900/50 opacity-70'} rounded-xl p-3`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-black/30 flex items-center justify-center text-xl shrink-0">
                  {cat.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-bold truncate">{i.name}</div>
                    {!i.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/60 text-red-200">OFF</span>}
                  </div>
                  <div className="text-xs text-pulse-mute truncate">{i.description || '—'}</div>
                  <div className="text-[10px] text-pulse-mute mt-0.5">
                    {fmt(i.price_pulse)} PULSE
                    {i.stock_total !== null && ` · Stock ${i.stock_remaining}/${i.stock_total}`}
                    {i.max_per_user && ` · Max ${i.max_per_user}/pers`}
                    {' · '}
                    {i.auto_apply ? 'auto' : 'approbation'}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <button onClick={() => toggle(i)} className="py-1.5 rounded-lg bg-pulse-border/40 text-xs text-pulse-text">
                  {i.is_active ? '⏸️ Off' : '▶️ On'}
                </button>
                <button onClick={() => openEdit(i)} className="py-1.5 rounded-lg bg-pulse-border/40 text-xs text-pulse-text">
                  ✏️ Éditer
                </button>
                <button onClick={() => del(i.id)} className="py-1.5 rounded-lg bg-red-900/40 text-xs text-red-200">
                  🗑️ Supprimer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal editor (bottom sheet on mobile) */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center p-0 md:p-6" onClick={close}>
          <div className="w-full md:max-w-lg bg-pulse-card border border-pulse-border rounded-t-2xl md:rounded-2xl p-5 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="font-bold text-lg">{editing.id ? 'Éditer l\'article' : 'Nouvel article'}</div>
              <button onClick={close} className="text-pulse-mute text-2xl">✕</button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-xs uppercase text-pulse-mute">Nom</span>
                <input
                  type="text"
                  value={editing.name}
                  onChange={e => setEditing(d => d && { ...d, name: e.target.value })}
                  className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase text-pulse-mute">Description</span>
                <textarea
                  value={editing.description}
                  onChange={e => setEditing(d => d && { ...d, description: e.target.value })}
                  rows={2}
                  className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
                />
              </label>

              <div>
                <span className="text-xs uppercase text-pulse-mute">Catégorie</span>
                <div className="grid grid-cols-5 gap-1 mt-1">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setEditing(d => d && { ...d, category: c.value })}
                      className={`py-2 rounded-lg text-[10px] font-semibold flex flex-col items-center gap-0.5 ${editing.category === c.value ? 'bg-pulse-gold text-black' : 'bg-pulse-border/40 text-pulse-mute'}`}
                    >
                      <span className="text-lg">{c.emoji}</span>
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs uppercase text-pulse-mute">Prix (PULSE)</span>
                  <input
                    type="number"
                    min={0}
                    value={editing.price_pulse}
                    onChange={e => setEditing(d => d && { ...d, price_pulse: Math.max(0, Number(e.target.value) || 0) })}
                    className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase text-pulse-mute">Max par personne</span>
                  <input
                    type="number"
                    min={1}
                    value={editing.max_per_user ?? 1}
                    onChange={e => setEditing(d => d && { ...d, max_per_user: Math.max(1, Number(e.target.value) || 1) })}
                    className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs uppercase text-pulse-mute">Stock total (vide = illimité)</span>
                <input
                  type="number"
                  min={0}
                  value={editing.stock_total ?? ''}
                  onChange={e => setEditing(d => d && { ...d, stock_total: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })}
                  className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase text-pulse-mute">URL image (facultatif)</span>
                <input
                  type="url"
                  value={editing.image_url ?? ''}
                  onChange={e => setEditing(d => d && { ...d, image_url: e.target.value || null })}
                  placeholder="https://…"
                  className="mt-1 w-full bg-pulse-bg border border-pulse-border rounded-lg px-3 py-2 text-sm"
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.auto_apply}
                  onChange={e => setEditing(d => d && { ...d, auto_apply: e.target.checked })}
                  className="accent-pulse-gold"
                />
                Livraison automatique (sinon l&apos;achat passe en attente d&apos;approbation)
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.is_active}
                  onChange={e => setEditing(d => d && { ...d, is_active: e.target.checked })}
                  className="accent-pulse-gold"
                />
                Article actif (visible dans la boutique)
              </label>
            </div>

            {error && <div className="mt-3 text-xs text-red-300 bg-red-900/40 border border-red-800 rounded-lg p-2">{error}</div>}

            <button
              onClick={save}
              disabled={busy}
              className="w-full mt-4 bg-pulse-gold text-black font-bold py-3 rounded-xl disabled:opacity-50 shadow-brand"
            >
              {busy ? 'Enregistrement…' : editing.id ? 'Enregistrer' : 'Créer l\'article'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
