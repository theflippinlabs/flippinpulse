'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  EQUIPMENT_SLOTS,
  MAX_EQUIPMENT_SLOTS,
  RARITY_STYLE,
  SLOT_LABEL,
  effectiveStats,
  rarityOrder,
  scaledBonuses,
  type Card,
  type EquipmentSlot,
  type EquippedItem,
} from '@/lib/tcgShared';

interface Member { discord_id: string; username: string; avatar_url: string | null; }

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (params: {
    opponentId: string;
    opponentName: string;
    wager: number;
    channelId: string;
    characterCardId: number;
    equipment: { cardId: number; level: number }[];
  }) => Promise<void> | void;
  fr: boolean;
  channels: { channel_id: string; name: string }[];
  defaultChannel: string;
  catalog: Card[];
  // (cardId → (level → quantity))
  ownedLevels: Map<number, Map<number, number>>;
  maxWager?: number;
}

export default function CardDuelDialog({
  open, onClose, onSubmit, fr, channels, defaultChannel, catalog, ownedLevels, maxWager = 10_000,
}: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Member[]>([]);
  const [picked, setPicked] = useState<Member | null>(null);
  const [wager, setWager] = useState(0);
  const [channelId, setChannelId] = useState(defaultChannel);
  const [character, setCharacter] = useState<Card | null>(null);
  const [loadout, setLoadout] = useState<Map<EquipmentSlot, EquippedItem>>(new Map());
  const [activeSlot, setActiveSlot] = useState<EquipmentSlot>('weapon');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQ(''); setResults([]); setPicked(null); setWager(0);
      setChannelId(defaultChannel); setCharacter(null); setLoadout(new Map());
      setActiveSlot('weapon'); setError(null);
    }
  }, [open, defaultChannel]);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) { setResults([]); return; }
    const h = setTimeout(async () => {
      const res = await fetch(`/api/members/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setResults(data.results ?? []);
    }, 200);
    return () => clearTimeout(h);
  }, [q, open]);

  const ownedCharacters = useMemo(() => {
    return catalog
      .filter(c => c.card_kind === 'character' && (ownedLevels.get(c.id)?.get(1) ?? 0) > 0)
      .sort((a, b) => rarityOrder(b.rarity) - rarityOrder(a.rarity) || a.name.localeCompare(b.name));
  }, [catalog, ownedLevels]);

  const equipmentBySlot = useMemo(() => {
    const map = new Map<EquipmentSlot, { card: Card; level: number; quantity: number }[]>();
    for (const slot of EQUIPMENT_SLOTS) map.set(slot, []);
    for (const c of catalog) {
      if (c.card_kind !== 'equipment' || !c.equipment_slot) continue;
      const levels = ownedLevels.get(c.id);
      if (!levels) continue;
      for (const [level, quantity] of levels) {
        if (quantity > 0) {
          map.get(c.equipment_slot)!.push({ card: c, level, quantity });
        }
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => rarityOrder(b.card.rarity) - rarityOrder(a.card.rarity) || b.level - a.level || a.card.name.localeCompare(b.card.name));
    }
    return map;
  }, [catalog, ownedLevels]);

  const equipmentArray = useMemo(() => Array.from(loadout.values()), [loadout]);
  const preview = character ? effectiveStats(character, equipmentArray) : null;

  function toggleEquipment(card: Card, level: number) {
    if (!card.equipment_slot) return;
    setLoadout(prev => {
      const next = new Map(prev);
      const cur = next.get(card.equipment_slot!);
      if (cur && cur.card.id === card.id && cur.level === level) {
        next.delete(card.equipment_slot!);
      } else {
        next.set(card.equipment_slot!, { card, level });
      }
      return next;
    });
  }

  async function submit() {
    if (!picked) { setError(fr ? 'Choisis un adversaire.' : 'Pick an opponent.'); return; }
    if (!character) { setError(fr ? 'Choisis un personnage champion.' : 'Pick a champion character.'); return; }
    if (!channelId) { setError(fr ? 'Choisis un salon.' : 'Pick a channel.'); return; }
    setError(null); setBusy(true);
    try {
      await onSubmit({
        opponentId: picked.discord_id,
        opponentName: picked.username,
        wager,
        channelId,
        characterCardId: character.id,
        equipment: equipmentArray.map(e => ({ cardId: e.card.id, level: e.level })),
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const activeSlotEquipment = equipmentBySlot.get(activeSlot) ?? [];
  const equippedInActiveSlot = loadout.get(activeSlot);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="max-w-md w-full max-h-[92vh] overflow-y-auto rounded-2xl bg-gradient-to-b from-pulse-card to-black border border-pulse-gold/40 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black">⚔️ {fr ? 'Duel de cartes' : 'Card duel'}</h2>
          <button onClick={onClose} className="text-2xl text-pulse-mute leading-none px-1">×</button>
        </div>

        {/* Opponent */}
        <div className="mb-4">
          <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Adversaire' : 'Opponent'}</label>
          {picked ? (
            <div className="mt-1 rounded-lg bg-pulse-gold/10 border border-pulse-gold/40 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {picked.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={picked.avatar_url} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                  : <div className="w-6 h-6 rounded-full bg-pulse-border" />}
                <span className="font-semibold">{picked.username}</span>
              </div>
              <button onClick={() => setPicked(null)} className="text-xs text-pulse-mute">{fr ? 'Changer' : 'Change'}</button>
            </div>
          ) : (
            <>
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder={fr ? 'Tape un pseudo…' : 'Type a username…'}
                className="w-full mt-1 rounded-lg bg-black border border-pulse-border px-3 py-2 text-sm"
              />
              {results.length > 0 && (
                <ul className="mt-1 rounded-lg bg-black/60 border border-pulse-border divide-y divide-pulse-border/60 max-h-40 overflow-y-auto">
                  {results.map(m => (
                    <li
                      key={m.discord_id}
                      onClick={() => setPicked(m)}
                      className="cursor-pointer px-3 py-2 hover:bg-pulse-gold/10 flex items-center gap-2 text-sm"
                    >
                      {m.avatar_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={m.avatar_url} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                        : <div className="w-6 h-6 rounded-full bg-pulse-border" />}
                      <span>{m.username}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Champion (character) picker */}
        <div className="mb-4">
          <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Champion (personnage)' : 'Champion (character)'}</label>
          {ownedCharacters.length === 0 ? (
            <div className="mt-1 rounded-lg bg-red-500/10 border border-red-500/40 p-3 text-xs text-red-100">
              {fr
                ? 'Tu ne possèdes aucun personnage. Ouvre un booster.'
                : 'You do not own any character yet. Open a pack.'}
            </div>
          ) : (
            <div className="mt-1 grid grid-cols-4 gap-2 max-h-52 overflow-y-auto p-1">
              {ownedCharacters.map(c => {
                const st = RARITY_STYLE[c.rarity];
                const isPicked = character?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCharacter(isPicked ? null : c)}
                    className={`relative rounded-lg p-2 border ring-1 ${st.ring} ${st.glow} ${
                      isPicked ? 'border-pulse-gold bg-pulse-gold/10' : 'border-pulse-border bg-pulse-card'
                    } flex flex-col items-center`}
                  >
                    <div className="text-2xl leading-none">{c.emoji}</div>
                    <div className={`text-[9px] uppercase tracking-wider font-bold ${st.color} text-center leading-tight mt-1`}>
                      {c.name}
                    </div>
                    <div className="text-[8px] text-pulse-mute font-mono mt-0.5">
                      {c.attack}/{c.defense}/{c.speed}
                    </div>
                    {isPicked && (
                      <span className="absolute -top-1 -right-1 text-[8px] px-1.5 py-0.5 rounded bg-pulse-gold text-black font-black">★</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Equipment slots — one row of slot tabs, then the roster for the active slot */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-pulse-mute uppercase tracking-wider">
              {fr ? 'Équipement' : 'Equipment'}{' '}
              <span className="text-pulse-mute/70">({loadout.size}/{MAX_EQUIPMENT_SLOTS})</span>
            </label>
          </div>

          <div className="grid grid-cols-6 gap-1 mb-2">
            {EQUIPMENT_SLOTS.map(slot => {
              const equipped = loadout.get(slot);
              const isActive = activeSlot === slot;
              const label = SLOT_LABEL[slot];
              return (
                <button
                  key={slot}
                  onClick={() => setActiveSlot(slot)}
                  className={`h-14 rounded-lg border flex flex-col items-center justify-center gap-0.5 ${
                    isActive ? 'border-pulse-gold bg-pulse-gold/10' :
                    equipped ? 'border-emerald-500/40 bg-emerald-500/5' :
                    'border-pulse-border bg-pulse-card'
                  }`}
                  title={label[fr ? 'fr' : 'en']}
                >
                  <span className="text-base leading-none">{equipped?.card.emoji ?? label.icon}</span>
                  <span className="text-[7px] uppercase tracking-wider text-pulse-mute">
                    {label[fr ? 'fr' : 'en']}
                    {equipped && equipped.level > 1 ? ` lv${equipped.level}` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {!character ? (
            <div className="rounded-lg border border-pulse-border bg-black/40 p-3 text-xs text-pulse-mute text-center">
              {fr ? 'Choisis un personnage pour équiper.' : 'Pick a character before equipping.'}
            </div>
          ) : activeSlotEquipment.length === 0 ? (
            <div className="rounded-lg border border-pulse-border bg-black/40 p-3 text-xs text-pulse-mute text-center">
              {fr
                ? `Pas encore d'${SLOT_LABEL[activeSlot].fr.toLowerCase()} dans ta collection.`
                : `No ${SLOT_LABEL[activeSlot].en.toLowerCase()} in your collection yet.`}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto p-1">
              {activeSlotEquipment.map(({ card, level, quantity }) => {
                const st = RARITY_STYLE[card.rarity];
                const isEquipped = equippedInActiveSlot?.card.id === card.id && equippedInActiveSlot.level === level;
                const b = scaledBonuses(card, level);
                return (
                  <button
                    key={`${card.id}:${level}`}
                    onClick={() => toggleEquipment(card, level)}
                    className={`relative rounded-md p-1.5 border ring-1 ${st.ring} ${
                      isEquipped ? 'border-pulse-gold bg-pulse-gold/10' : 'border-pulse-border bg-pulse-card'
                    } flex flex-col items-center`}
                    title={`${card.name} lv${level} ×${quantity}`}
                  >
                    <span className="text-lg leading-none">{card.emoji}</span>
                    <span className="text-[8px] font-bold text-pulse-gold mt-0.5">lv{level}</span>
                    <span className="text-[7px] font-mono text-pulse-mute">
                      {b.atk ? `+${b.atk}⚔ ` : ''}{b.def ? `+${b.def}🛡 ` : ''}{b.spd ? `+${b.spd}💨` : ''}
                    </span>
                    {quantity > 1 && (
                      <span className="absolute top-0.5 right-0.5 text-[7px] px-1 rounded bg-black/60 text-pulse-mute font-mono">×{quantity}</span>
                    )}
                    {isEquipped && (
                      <span className="absolute -top-1 -right-1 text-[7px] px-1 rounded bg-pulse-gold text-black font-black">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Live effective-stats preview */}
        {character && preview && (
          <div className="mb-4 rounded-lg border border-pulse-gold/40 bg-pulse-gold/10 p-3">
            <div className="text-[10px] text-pulse-gold uppercase tracking-wider mb-1 text-center">
              {fr ? 'Stats effectives en duel' : 'Effective duel stats'}
            </div>
            <div className="grid grid-cols-3 gap-1 text-center text-xs">
              <div>
                <div className="text-lg font-mono">{preview.attack}</div>
                <div className="text-pulse-mute">⚔️ ATK{preview.attack > character.attack ? ` (+${preview.attack - character.attack})` : ''}</div>
              </div>
              <div>
                <div className="text-lg font-mono">{preview.defense}</div>
                <div className="text-pulse-mute">🛡️ DEF{preview.defense > character.defense ? ` (+${preview.defense - character.defense})` : ''}</div>
              </div>
              <div>
                <div className="text-lg font-mono">{preview.speed}</div>
                <div className="text-pulse-mute">💨 SPD{preview.speed > character.speed ? ` (+${preview.speed - character.speed})` : ''}</div>
              </div>
            </div>
          </div>
        )}

        {/* Wager */}
        <div className="mb-3">
          <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Mise (PULSE)' : 'Wager (PULSE)'}</label>
          <input
            type="number"
            min={0}
            max={maxWager}
            value={wager}
            onChange={e => setWager(Math.max(0, Math.min(maxWager, Math.floor(Number(e.target.value) || 0))))}
            className="w-full mt-1 rounded-lg bg-black border border-pulse-border px-3 py-2 text-sm"
          />
        </div>

        {/* Channel */}
        <div className="mb-4">
          <label className="text-xs text-pulse-mute uppercase tracking-wider">{fr ? 'Salon' : 'Channel'}</label>
          <select
            value={channelId}
            onChange={e => setChannelId(e.target.value)}
            className="w-full mt-1 rounded-lg bg-black border border-pulse-border px-3 py-2 text-sm"
          >
            {channels.map(c => <option key={c.channel_id} value={c.channel_id}>#{c.name}</option>)}
          </select>
        </div>

        {error && <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs">{error}</div>}

        <button
          onClick={submit}
          disabled={busy}
          className="w-full rounded-xl bg-pulse-gold text-black font-bold py-2.5 disabled:opacity-60"
        >
          {busy ? (fr ? 'Envoi…' : 'Sending…') : (fr ? '⚔️ Envoyer le défi' : '⚔️ Send challenge')}
        </button>
      </div>
    </div>
  );
}
