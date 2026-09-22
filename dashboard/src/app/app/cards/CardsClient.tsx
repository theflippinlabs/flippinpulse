'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RARITY_STYLE, rarityOrder, type Card, type Rarity } from '@/lib/tcgShared';

interface Props {
  fr: boolean;
  catalog: Card[];
  ownedRaw: { id: number; quantity: number }[];
  balance: number;
  packCost: number;
}

const RARITY_FILTERS: (Rarity | 'all')[] = ['all', 'common', 'rare', 'epic', 'legendary', 'mythic'];

function CardTile({ card, quantity, revealed = true, fr }: { card: Card; quantity: number; revealed?: boolean; fr: boolean }) {
  const st = RARITY_STYLE[card.rarity];
  const dim = quantity === 0 ? 'opacity-30 grayscale' : '';
  return (
    <div className={`relative rounded-xl bg-gradient-to-br from-pulse-card to-black border border-pulse-border ring-1 ${st.ring} ${st.glow} ${dim} ${revealed ? '' : 'animate-pulse'} p-2 flex flex-col items-center`}>
      <div className="text-3xl mb-1">{revealed ? card.emoji : '❓'}</div>
      <div className={`text-[10px] uppercase tracking-wider font-bold ${st.color} text-center leading-tight`}>
        {revealed ? card.name : '???'}
      </div>
      {quantity > 1 && (
        <span className="absolute top-1 right-1 text-[9px] px-1 rounded bg-pulse-gold text-black font-black">×{quantity}</span>
      )}
      {quantity === 0 && (
        <span className="absolute top-1 right-1 text-[9px] px-1 rounded bg-black/60 text-pulse-mute font-mono">?</span>
      )}
      <div className="mt-1 text-[8px] text-pulse-mute font-mono text-center">
        {revealed ? `${card.attack}/${card.defense}/${card.speed}` : ''}
      </div>
    </div>
  );
}

export default function CardsClient({ fr, catalog, ownedRaw, balance: initialBalance, packCost }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<'all' | Rarity>('all');
  const [selected, setSelected] = useState<Card | null>(null);
  const [opening, setOpening] = useState<{ card: Card; isNew: boolean }[] | null>(null);
  const [revealIdx, setRevealIdx] = useState(0);
  const [balance, setBalance] = useState(initialBalance);
  const [error, setError] = useState<string | null>(null);

  const ownedMap = useMemo(() => new Map(ownedRaw.map(r => [r.id, r.quantity])), [ownedRaw]);

  const sorted = useMemo(() =>
    [...catalog].sort((a, b) => rarityOrder(a.rarity) - rarityOrder(b.rarity) || a.name.localeCompare(b.name)),
    [catalog]);
  const filtered = filter === 'all' ? sorted : sorted.filter(c => c.rarity === filter);

  const totalUnique = ownedRaw.filter(r => r.quantity > 0).length;

  const errorLabel = (code: string) => ({
    insufficient_pulse: fr ? 'PULSE insuffisant.' : 'Not enough PULSE.',
    catalog_empty: fr ? 'Catalogue vide.' : 'Empty catalog.',
    user_not_found: fr ? 'Compte introuvable.' : 'Account not found.',
    unauthorized: fr ? 'Non autorisé.' : 'Unauthorized.',
  }[code] ?? code);

  async function open() {
    setError(null);
    setOpening(null);
    setRevealIdx(0);
    const res = await fetch('/api/cards/open', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { setError(errorLabel(data.error ?? 'error')); return; }
    setBalance(data.newBalance);
    setOpening(data.pulled);
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setRevealIdx(i);
      if (i >= (data.pulled?.length ?? 0)) {
        clearInterval(timer);
        startTransition(() => router.refresh());
      }
    }, 550);
  }

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span><span>{fr ? 'Retour' : 'Back'}</span>
      </Link>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-bold">🎴 {fr ? 'Cartes' : 'Cards'}</h1>
        <div className="text-xs text-pulse-mute">
          {fr ? 'Collection' : 'Collection'} : <span className="text-pulse-gold font-mono">{totalUnique}/{catalog.length}</span> · <span className="font-mono">{balance} PULSE</span>
        </div>
      </div>

      <button
        onClick={open}
        disabled={isPending || balance < packCost}
        className="w-full rounded-2xl bg-gradient-to-r from-pulse-gold to-yellow-300 text-black font-black py-4 mb-4 shadow-[0_0_20px_rgba(245,182,46,.4)] disabled:opacity-60"
      >
        {fr ? `🎁 Ouvrir un booster (${packCost} PULSE)` : `🎁 Open a pack (${packCost} PULSE)`}
      </button>

      {error && <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</div>}

      {opening && (
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-purple-900/50 to-black border border-purple-500/40 p-4">
          <div className="text-sm mb-3">{fr ? '✨ Contenu du booster' : '✨ Pack contents'}</div>
          <div className="grid grid-cols-5 gap-2">
            {opening.map((p, i) => (
              <div key={i} className="relative">
                <CardTile card={p.card} quantity={ownedMap.get(p.card.id) ?? 1} revealed={i < revealIdx} fr={fr} />
                {p.isNew && i < revealIdx && (
                  <span className="absolute -top-1 -left-1 text-[8px] px-1.5 py-0.5 rounded bg-emerald-500 text-black font-black">NEW</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto mb-3 pb-1">
        {RARITY_FILTERS.map(r => (
          <button
            key={r}
            onClick={() => setFilter(r)}
            className={`shrink-0 px-3 py-1 rounded-full border text-xs ${filter === r ? 'bg-pulse-gold text-black border-pulse-gold' : 'bg-pulse-card border-pulse-border text-pulse-mute'}`}
          >
            {r === 'all' ? (fr ? 'Tout' : 'All') : RARITY_STYLE[r].label[fr ? 'fr' : 'en']}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {filtered.map(card => {
          const q = ownedMap.get(card.id) ?? 0;
          return (
            <button key={card.id} onClick={() => setSelected(card)} className="text-left">
              <CardTile card={card} quantity={q} fr={fr} />
            </button>
          );
        })}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div className={`max-w-xs w-full rounded-2xl p-6 bg-gradient-to-br from-pulse-card to-black border ring-1 ${RARITY_STYLE[selected.rarity].ring} ${RARITY_STYLE[selected.rarity].glow}`}>
            <div className="text-6xl text-center mb-2">{selected.emoji}</div>
            <div className={`text-lg font-bold text-center ${RARITY_STYLE[selected.rarity].color}`}>{selected.name}</div>
            <div className="text-xs text-center text-pulse-mute mt-1 uppercase tracking-wider">{RARITY_STYLE[selected.rarity].label[fr ? 'fr' : 'en']}</div>
            <p className="italic text-sm text-center text-pulse-mute mt-3">"{selected.flavor}"</p>
            <div className="mt-4 grid grid-cols-3 gap-1 text-center text-xs">
              <div><div className="text-lg font-mono">{selected.attack}</div><div className="text-pulse-mute">⚔️ ATK</div></div>
              <div><div className="text-lg font-mono">{selected.defense}</div><div className="text-pulse-mute">🛡️ DEF</div></div>
              <div><div className="text-lg font-mono">{selected.speed}</div><div className="text-pulse-mute">💨 SPD</div></div>
            </div>
            <div className="mt-4 text-center text-xs text-pulse-mute">
              {ownedMap.get(selected.id) ? (fr ? `Tu en possèdes ×${ownedMap.get(selected.id)}` : `You own ×${ownedMap.get(selected.id)}`) : (fr ? 'Pas encore possédée' : 'Not owned yet')}
            </div>
            <button
              onClick={() => setSelected(null)}
              className="mt-4 w-full rounded-xl bg-pulse-card border border-pulse-border py-2 text-sm"
            >
              {fr ? 'Fermer' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
