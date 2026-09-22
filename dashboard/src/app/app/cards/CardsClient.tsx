'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { NEXT_RARITY, RARITY_STYLE, SELL_VALUE, rarityOrder, type Card, type Rarity } from '@/lib/tcgShared';
import CardDuelDialog from './CardDuelDialog';

interface Props {
  fr: boolean;
  catalog: Card[];
  ownedRaw: { id: number; quantity: number }[];
  balance: number;
  packCost: number;
  channels: { channel_id: string; name: string }[];
  defaultChannel: string;
}

const RARITY_FILTERS: (Rarity | 'all')[] = ['all', 'common', 'rare', 'epic', 'legendary', 'mythic'];

function CardTile({ card, quantity, revealed = true, fr }: { card: Card; quantity: number; revealed?: boolean; fr: boolean }) {
  const st = RARITY_STYLE[card.rarity];
  const dim = quantity === 0 ? 'opacity-30 grayscale' : '';
  const isEquipment = card.card_kind === 'equipment';
  const statLine = isEquipment
    ? [
        card.atk_bonus ? `+${card.atk_bonus}⚔` : null,
        card.def_bonus ? `+${card.def_bonus}🛡` : null,
        card.spd_bonus ? `+${card.spd_bonus}💨` : null,
      ].filter(Boolean).join(' ') || '·'
    : `${card.attack}/${card.defense}/${card.speed}`;
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
      {revealed && isEquipment && (
        <span className="absolute top-1 left-1 text-[8px] px-1 rounded bg-purple-500/30 text-purple-100 font-black uppercase tracking-wider">
          {fr ? 'ÉQUIP' : 'EQP'}
        </span>
      )}
      <div className="mt-1 text-[8px] text-pulse-mute font-mono text-center">
        {revealed ? statLine : ''}
      </div>
    </div>
  );
}

export default function CardsClient({ fr, catalog, ownedRaw, balance: initialBalance, packCost, channels, defaultChannel }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<'all' | Rarity>('all');
  const [selected, setSelected] = useState<Card | null>(null);
  const [opening, setOpening] = useState<{ card: Card; isNew: boolean }[] | null>(null);
  const [revealIdx, setRevealIdx] = useState(0);
  const [balance, setBalance] = useState(initialBalance);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [fuseMode, setFuseMode] = useState(false);
  const [fuseSelection, setFuseSelection] = useState<number[]>([]);
  const [fuseResult, setFuseResult] = useState<Card | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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
    not_owned: fr ? 'Tu ne possèdes pas cette carte.' : 'You do not own this card.',
    keep_last_copy: fr ? 'Tu ne peux pas vendre ta dernière copie.' : 'You cannot sell your last copy.',
    card_not_found: fr ? 'Carte introuvable.' : 'Card not found.',
    need_3_cards: fr ? 'Sélectionne 3 cartes.' : 'Select 3 cards.',
    mixed_rarity: fr ? 'Les 3 cartes doivent être de même rareté.' : 'All 3 cards must share rarity.',
    max_rarity: fr ? 'Les mythiques ne se fusionnent plus.' : 'Mythics cannot fuse further.',
    not_enough_copies: fr ? 'Copies insuffisantes.' : 'Not enough copies.',
    not_a_character: fr ? 'Ton champion doit être un personnage.' : 'Your champion must be a character card.',
    not_an_equipment: fr ? "L'objet choisi n'est pas un équipement." : 'That card is not an equipment.',
    too_many_equipment: fr ? 'Maximum 3 équipements.' : 'Max 3 equipment items.',
    bad_equipment: fr ? "Équipement invalide." : 'Invalid equipment.',
    bad_card: fr ? 'Choisis un personnage.' : 'Pick a character.',
    bad_opponent: fr ? 'Adversaire invalide.' : 'Invalid opponent.',
    self_challenge: fr ? 'Tu ne peux pas te défier toi-même.' : "You can't challenge yourself.",
    no_channel: fr ? 'Choisis un salon.' : 'Pick a channel.',
  }[code] ?? code);

  async function sellSelected(qty: number) {
    if (!selected) return;
    setError(null); setFlash(null);
    const res = await fetch('/api/cards/sell', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cardId: selected.id, quantity: qty }),
    });
    const data = await res.json();
    if (!res.ok) { setError(errorLabel(data.error ?? 'error')); return; }
    setBalance(data.newBalance);
    setFlash(fr ? `💰 Vendu ${data.sold}× pour +${data.pulseEarned} PULSE.` : `💰 Sold ${data.sold}× for +${data.pulseEarned} PULSE.`);
    setSelected(null);
    startTransition(() => router.refresh());
  }

  function toggleFuseCard(id: number) {
    setFuseSelection(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function runFuse() {
    setError(null); setFlash(null); setFuseResult(null);
    const res = await fetch('/api/cards/fuse', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cardIds: fuseSelection }),
    });
    const data = await res.json();
    if (!res.ok) { setError(errorLabel(data.error ?? 'error')); return; }
    setFuseResult(data.result);
    setFuseSelection([]);
    startTransition(() => router.refresh());
  }

  const fuseSelectionCards = fuseSelection
    .map(id => catalog.find(c => c.id === id))
    .filter((c): c is Card => !!c);
  const fuseRarity = fuseSelectionCards[0]?.rarity;
  const fuseValid = fuseSelectionCards.length === 3 && fuseSelectionCards.every(c => c.rarity === fuseRarity) && !!fuseRarity && NEXT_RARITY[fuseRarity] !== null;

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
        <div className="flex items-center gap-2 text-xs">
          <button onClick={() => setShowRules(true)} className="text-pulse-gold underline underline-offset-2">
            {fr ? 'Règles' : 'Rules'}
          </button>
          <span className="text-pulse-mute">
            <span className="text-pulse-gold font-mono">{totalUnique}/{catalog.length}</span> · <span className="font-mono">{balance} PULSE</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <button
          onClick={open}
          disabled={isPending || balance < packCost || fuseMode}
          className="rounded-2xl bg-gradient-to-r from-pulse-gold to-yellow-300 text-black font-black py-3 shadow-[0_0_18px_rgba(245,182,46,.4)] disabled:opacity-60"
        >
          {fr ? `🎁 Booster` : `🎁 Pack`}
          <div className="text-[9px] font-bold opacity-80 mt-0.5">{packCost}</div>
        </button>
        <button
          onClick={() => { setFuseMode(v => !v); setFuseSelection([]); setFuseResult(null); }}
          className={`rounded-2xl font-black py-3 border-2 ${fuseMode ? 'bg-purple-500 text-white border-purple-400' : 'bg-purple-500/10 text-purple-200 border-purple-500/40'}`}
        >
          {fr ? '🔀 Fusion' : '🔀 Fuse'}
          <div className="text-[9px] font-bold opacity-80 mt-0.5">{fuseMode ? '0/3' : '3→+1'}</div>
        </button>
        <button
          onClick={() => setChallengeOpen(true)}
          className="rounded-2xl font-black py-3 border-2 bg-red-500/10 text-red-100 border-red-500/40"
        >
          {fr ? '⚔️ Défier' : '⚔️ Duel'}
          <div className="text-[9px] font-bold opacity-80 mt-0.5">{fr ? 'pot ×2' : 'pot ×2'}</div>
        </button>
      </div>

      {fuseMode && (
        <div className="mb-4 rounded-2xl border border-purple-500/40 bg-purple-500/10 p-3">
          <div className="flex items-center gap-2 mb-2 text-sm">
            <span className="font-semibold text-purple-200">{fr ? 'Sélection' : 'Selection'}:</span>
            <span className="text-pulse-mute">{fuseSelection.length} / 3</span>
          </div>
          <div className="flex gap-2 mb-2">
            {[0, 1, 2].map(i => {
              const card = fuseSelectionCards[i];
              if (!card) {
                return <div key={i} className="flex-1 h-14 rounded-lg border border-dashed border-pulse-border flex items-center justify-center text-pulse-mute text-xs">?</div>;
              }
              return (
                <button key={i} onClick={() => toggleFuseCard(card.id)} className="flex-1 h-14 rounded-lg bg-black/40 border border-pulse-border flex items-center justify-center gap-1 text-lg">
                  <span>{card.emoji}</span><span className="text-xs">{card.name.slice(0, 8)}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={runFuse}
            disabled={isPending || !fuseValid}
            className="w-full rounded-lg bg-purple-500 text-white font-bold py-2 disabled:opacity-60"
          >
            {fuseValid
              ? (fr ? `✨ Fusionner → ${NEXT_RARITY[fuseRarity!]?.toUpperCase()}` : `✨ Fuse → ${NEXT_RARITY[fuseRarity!]?.toUpperCase()}`)
              : (fr ? '3 cartes de même rareté' : '3 cards of the same rarity')}
          </button>
          {fuseResult && (
            <div className="mt-3 rounded-lg bg-black/40 border border-pulse-gold/40 p-3 text-center">
              <div className="text-xs text-pulse-gold uppercase tracking-wider">{fr ? 'Obtenue' : 'Earned'}</div>
              <div className="text-4xl">{fuseResult.emoji}</div>
              <div className="font-bold">{fuseResult.name}</div>
              <div className="text-xs text-pulse-mute">{fuseResult.rarity}</div>
            </div>
          )}
        </div>
      )}

      {flash && <div className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">{flash}</div>}
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
          const inFuse = fuseSelection.includes(card.id);
          const disabledForFuse = fuseMode && (q === 0 || (!inFuse && fuseSelection.length >= 3));
          const onClick = () => {
            if (fuseMode) {
              if (q > 0) toggleFuseCard(card.id);
            } else {
              setSelected(card);
            }
          };
          return (
            <button
              key={card.id}
              onClick={onClick}
              disabled={disabledForFuse}
              className={`text-left relative ${inFuse ? 'ring-2 ring-purple-400 rounded-xl' : ''} ${disabledForFuse ? 'opacity-40' : ''}`}
            >
              <CardTile card={card} quantity={q} fr={fr} />
              {inFuse && (
                <span className="absolute -top-1 -left-1 text-[8px] px-1.5 py-0.5 rounded bg-purple-500 text-white font-black">
                  {fuseSelection.indexOf(card.id) + 1}
                </span>
              )}
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
            {(() => {
              const owned = ownedMap.get(selected.id) ?? 0;
              const spareOne = owned > 1;
              const spareAll = Math.max(0, owned - 1);
              const unitValue = SELL_VALUE[selected.rarity];
              if (spareOne) {
                return (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); sellSelected(1); }}
                      className="rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 py-2 text-xs font-semibold"
                    >
                      {fr ? `💰 Vendre 1 (+${unitValue})` : `💰 Sell 1 (+${unitValue})`}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); sellSelected(spareAll); }}
                      className="rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 py-2 text-xs font-semibold"
                    >
                      {fr ? `💰 Vendre ×${spareAll} (+${unitValue * spareAll})` : `💰 Sell ×${spareAll} (+${unitValue * spareAll})`}
                    </button>
                  </div>
                );
              }
              return null;
            })()}
            <button
              onClick={(e) => { e.stopPropagation(); setSelected(null); }}
              className="mt-4 w-full rounded-xl bg-pulse-card border border-pulse-border py-2 text-sm"
            >
              {fr ? 'Fermer' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {showRules && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowRules(false)}
        >
          <div
            className="max-w-md w-full max-h-[85vh] overflow-y-auto rounded-2xl bg-gradient-to-b from-pulse-card to-black border border-pulse-gold/40 p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-black">🎴 {fr ? 'Comment jouer' : 'How to play'}</h2>
              <button onClick={() => setShowRules(false)} className="text-2xl text-pulse-mute leading-none px-1">×</button>
            </div>

            <div className="space-y-4 text-sm">
              <section>
                <div className="text-pulse-gold font-bold mb-1">🎯 {fr ? 'But du jeu' : 'Goal'}</div>
                <p className="text-pulse-mute">
                  {fr
                    ? 'Collectionne les 32 cartes, défie les autres membres, et gagne du PULSE.'
                    : 'Collect all 32 cards, challenge other members, and earn PULSE.'}
                </p>
              </section>

              <section>
                <div className="text-pulse-gold font-bold mb-1">🎁 {fr ? 'Ouvrir un booster' : 'Open a pack'}</div>
                <p className="text-pulse-mute">
                  {fr
                    ? `${packCost} PULSE = 5 cartes aléatoires. Anti-loose : si tes 4 premières sont communes, la 5ᵉ est garantie Rare+.`
                    : `${packCost} PULSE = 5 random cards. Pity: if the first 4 pulls are all commons, the 5th is guaranteed Rare or better.`}
                </p>
                <div className="mt-2 text-[10px] font-mono text-pulse-mute">
                  ⚪ 68% · 🔵 23% · 🟣 7% · 🟠 1.8% · 🔴 0.2%
                </div>
              </section>

              <section>
                <div className="text-pulse-gold font-bold mb-1">⚔️ {fr ? 'Défier un membre' : 'Challenge a member'}</div>
                <p className="text-pulse-mute">
                  {fr
                    ? 'Bouton **⚔️ Défier** ci-dessus, ou sur Discord : `/cards challenge`. Choisis un **personnage** champion et attache jusqu\'à **3 équipements** pour booster ses stats. Les stats effectives (base + bonus) s\'affrontent sur ATK / DEF / SPD → gagnant sur 2 rounds prend le pot (2× la mise).'
                    : 'Use the **⚔️ Duel** button above, or on Discord: `/cards challenge`. Pick a **character** champion and attach up to **3 equipment** to boost its stats. Effective stats (base + bonuses) clash on ATK / DEF / SPD → best of 3 takes the pot (2× wager).'}
                </p>
              </section>

              <section>
                <div className="text-pulse-gold font-bold mb-1">🎽 {fr ? 'Personnages & équipements' : 'Characters & equipment'}</div>
                <p className="text-pulse-mute">
                  {fr
                    ? 'Deux familles de cartes : **Personnages** (attaquent, ont des stats ATK/DEF/SPD) et **Équipements** (s\'attachent à un personnage, ajoutent des bonus). Un équipement ne peut PAS combattre seul. Empile jusqu\'à 3 équipements sur ton champion pour transformer un personnage rare en tueur légendaire.'
                    : 'Two card families: **Characters** (attack, carry ATK/DEF/SPD stats) and **Equipment** (attach to a character, add stat bonuses). Equipment cannot fight alone. Stack up to 3 equipment items on your champion to turn a rare into a legendary killer.'}
                </p>
              </section>

              <section>
                <div className="text-pulse-gold font-bold mb-1">💰 {fr ? 'Vendre les doublons' : 'Sell duplicates'}</div>
                <p className="text-pulse-mute mb-1">
                  {fr
                    ? 'Tape sur une carte que tu as en plusieurs exemplaires → bouton **Vendre**. Ta dernière copie est protégée.'
                    : 'Tap a card you own multiple times → **Sell** button. Your last copy is always protected.'}
                </p>
                <div className="grid grid-cols-5 gap-1 text-[10px] font-mono text-center">
                  <div><div className="text-gray-400">⚪</div><div>{SELL_VALUE.common}</div></div>
                  <div><div className="text-blue-400">🔵</div><div>{SELL_VALUE.rare}</div></div>
                  <div><div className="text-purple-400">🟣</div><div>{SELL_VALUE.epic}</div></div>
                  <div><div className="text-amber-400">🟠</div><div>{SELL_VALUE.legendary}</div></div>
                  <div><div className="text-red-400">🔴</div><div>{SELL_VALUE.mythic}</div></div>
                </div>
              </section>

              <section>
                <div className="text-pulse-gold font-bold mb-1">🔀 {fr ? 'Fusionner' : 'Fuse'}</div>
                <p className="text-pulse-mute">
                  {fr
                    ? '3 cartes de la MÊME rareté → 1 carte aléatoire de la rareté supérieure. Idéal pour monter en gamme sans dépendre du hasard des boosters.'
                    : '3 cards of the SAME rarity → 1 random card of the next rarity. Perfect for climbing without pack RNG.'}
                </p>
              </section>

              <section>
                <div className="text-pulse-gold font-bold mb-1">💡 {fr ? 'Astuces' : 'Tips'}</div>
                <ul className="text-pulse-mute list-disc list-inside space-y-0.5">
                  <li>{fr ? 'Vends tes doublons commun/rare pour refinancer des boosters.' : 'Sell extra commons/rares to fund new packs.'}</li>
                  <li>{fr ? 'Fusionne 3 rares pour aller chercher une épique sans booster.' : 'Fuse 3 rares to chase an epic without opening packs.'}</li>
                  <li>{fr ? 'Utilise `/cards challenge` sur Discord pour battre un ami et doubler ta mise.' : 'Use `/cards challenge` on Discord to fight a friend and double your wager.'}</li>
                  <li>{fr ? 'Complète les 32 cartes du catalogue — la collection compte pour le prestige.' : 'Complete all 32 cards — collection completion is prestige.'}</li>
                </ul>
              </section>
            </div>

            <button
              onClick={() => setShowRules(false)}
              className="mt-5 w-full rounded-xl bg-pulse-gold text-black font-bold py-2.5"
            >
              {fr ? 'Compris !' : 'Got it!'}
            </button>
          </div>
        </div>
      )}

      <CardDuelDialog
        open={challengeOpen}
        onClose={() => setChallengeOpen(false)}
        fr={fr}
        channels={channels}
        defaultChannel={defaultChannel}
        catalog={catalog}
        ownedRaw={ownedRaw}
        onSubmit={async ({ opponentId, wager, channelId, characterCardId, equipmentCardIds, opponentName }) => {
          setError(null); setFlash(null);
          const res = await fetch('/api/cards/challenge', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ opponentId, wager, channelId, characterCardId, equipmentCardIds }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(errorLabel(data.error ?? 'error'));
          setFlash(fr ? `⚔️ Défi envoyé à ${opponentName}. Il apparaît sur Discord.` : `⚔️ Challenge sent to ${opponentName}. Check Discord.`);
        }}
      />
    </>
  );
}
