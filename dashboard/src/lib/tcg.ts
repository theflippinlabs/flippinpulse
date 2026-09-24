import { supabase } from './supabase';
import type { Card, Rarity } from './tcgShared';
import { PACK_COST, PACK_SIZE, NEXT_RARITY, SELL_VALUE, MAX_LEVEL, MERGE_COST_COPIES } from './tcgShared';
import { atomicSpend, atomicEarn } from './atomicPulse';

export { PACK_COST, PACK_SIZE, RARITY_STYLE, rarityOrder, SELL_VALUE, NEXT_RARITY, MAX_LEVEL, MERGE_COST_COPIES } from './tcgShared';
export type { Card, Rarity, EquipmentSlot } from './tcgShared';

const WEIGHTS: Record<Rarity, number> = {
  common: 680, rare: 230, epic: 70, legendary: 18, mythic: 2,
};

export async function loadCatalog(): Promise<Card[]> {
  const { data } = await supabase.from('tcg_cards').select('*').eq('is_active', true);
  return (data ?? []) as Card[];
}

// Per-level ownership map: (cardId → (level → quantity)). The web app uses
// this to render each equipment stack at its actual level.
export async function loadCollectionLevels(discordId: string): Promise<Map<number, Map<number, number>>> {
  const { data } = await supabase
    .from('tcg_collection')
    .select('card_id, level, quantity')
    .eq('discord_id', discordId);
  const map = new Map<number, Map<number, number>>();
  for (const r of data ?? []) {
    const cardId = r.card_id as number;
    const level = (r.level as number) ?? 1;
    const qty = r.quantity as number;
    let inner = map.get(cardId);
    if (!inner) { inner = new Map(); map.set(cardId, inner); }
    inner.set(level, (inner.get(level) ?? 0) + qty);
  }
  return map;
}

// Legacy flat map: total quantity across all levels for a given card.
// Kept for older callers that don't care about per-level detail.
export async function loadCollection(discordId: string): Promise<Map<number, number>> {
  const levels = await loadCollectionLevels(discordId);
  const flat = new Map<number, number>();
  for (const [cardId, inner] of levels) {
    let total = 0;
    for (const q of inner.values()) total += q;
    flat.set(cardId, total);
  }
  return flat;
}

function pickRarity(): Rarity {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const roll = Math.random() * total;
  let acc = 0;
  for (const [r, w] of Object.entries(WEIGHTS) as [Rarity, number][]) {
    acc += w;
    if (roll < acc) return r;
  }
  return 'common';
}

export async function openPack(discordId: string): Promise<{ ok: boolean; error?: string; pulled?: { card: Card; isNew: boolean }[]; newBalance?: number }> {
  const catalog = await loadCatalog();
  if (!catalog.length) return { ok: false, error: 'catalog_empty' };
  // Atomic debit — refuses if balance < PACK_COST without ever leaking a
  // "check then update" window a concurrent request could exploit.
  const debit = await atomicSpend(discordId, PACK_COST, 'TCG pack');
  if (!debit.ok) return { ok: false, error: debit.error ?? 'insufficient_pulse' };
  const nb = debit.newBalance;

  const pulls: { card: Card; isNew: boolean }[] = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    let r: Rarity = pickRarity();
    if (i === PACK_SIZE - 1 && pulls.every(p => p.card.rarity === 'common')) r = r === 'common' ? 'rare' : r;
    const pool = catalog.filter(c => c.rarity === r);
    if (!pool.length) continue;
    pulls.push({ card: pool[Math.floor(Math.random() * pool.length)], isNew: false });
  }

  const ids = [...new Set(pulls.map(p => p.card.id))];
  const { data: anyLevel } = await supabase.from('tcg_collection').select('card_id').eq('discord_id', discordId).in('card_id', ids);
  const knewBefore = new Set<number>((anyLevel ?? []).map(r => r.card_id as number));

  const { data: existingLv1 } = await supabase
    .from('tcg_collection').select('card_id, quantity')
    .eq('discord_id', discordId).eq('level', 1).in('card_id', ids);
  const ownedLv1 = new Map<number, number>((existingLv1 ?? []).map(r => [r.card_id as number, r.quantity as number]));

  const counts = new Map<number, number>();
  for (const p of pulls) counts.set(p.card.id, (counts.get(p.card.id) ?? 0) + 1);
  for (const [cardId, qty] of counts) {
    if (ownedLv1.has(cardId)) {
      await supabase.from('tcg_collection')
        .update({ quantity: (ownedLv1.get(cardId) ?? 0) + qty })
        .eq('discord_id', discordId).eq('card_id', cardId).eq('level', 1);
    } else {
      await supabase.from('tcg_collection').insert({ discord_id: discordId, card_id: cardId, level: 1, quantity: qty });
    }
  }

  const seen = new Set<number>();
  for (const p of pulls) {
    if (!knewBefore.has(p.card.id) && !seen.has(p.card.id)) { p.isNew = true; seen.add(p.card.id); }
  }

  return { ok: true, pulled: pulls, newBalance: nb };
}

// ---- Sell duplicates ----
export interface SellResult { ok: boolean; error?: string; sold?: number; pulseEarned?: number; newBalance?: number; }

async function credit(discordId: string, amount: number, reason: string): Promise<number> {
  return atomicEarn(discordId, amount, reason);
}

// Sells lowest-level copies first so upgraded equipment stays safe. The
// last copy across all levels is always protected.
export async function sellCards(discordId: string, cardId: number, quantity: number): Promise<SellResult> {
  const qty = Math.max(1, Math.floor(quantity));
  const { data: card } = await supabase.from('tcg_cards').select('*').eq('id', cardId).maybeSingle();
  if (!card) return { ok: false, error: 'card_not_found' };
  const rarity = (card as Card).rarity;

  const { data: rows } = await supabase
    .from('tcg_collection').select('quantity, level')
    .eq('discord_id', discordId).eq('card_id', cardId);
  const totalOwned = (rows ?? []).reduce((s, r) => s + (r.quantity as number), 0);
  if (totalOwned <= 0) return { ok: false, error: 'not_owned' };
  const maxSellable = Math.max(0, totalOwned - 1);
  if (maxSellable <= 0) return { ok: false, error: 'keep_last_copy' };

  const wanted = Math.min(qty, maxSellable);
  let remaining = wanted;
  const sorted = [...(rows ?? [])].sort((a, b) => (a.level as number) - (b.level as number));
  for (const r of sorted) {
    if (remaining <= 0) break;
    const have = r.quantity as number;
    const take = Math.min(have, remaining);
    if (take === have) {
      await supabase.from('tcg_collection').delete().eq('discord_id', discordId).eq('card_id', cardId).eq('level', r.level);
    } else {
      await supabase.from('tcg_collection').update({ quantity: have - take }).eq('discord_id', discordId).eq('card_id', cardId).eq('level', r.level);
    }
    remaining -= take;
  }

  const pulseEarned = wanted * SELL_VALUE[rarity];
  const newBalance = await credit(discordId, pulseEarned, `TCG sell ${wanted}× ${(card as Card).code}`);
  return { ok: true, sold: wanted, pulseEarned, newBalance };
}

// ---- Fuse (3 same-rarity characters → 1 higher-rarity character, random pick) ----
export interface FuseResult { ok: boolean; error?: string; consumed?: Card[]; result?: Card; }

export async function fuse(discordId: string, cardIds: number[]): Promise<FuseResult> {
  if (cardIds.length !== 3) return { ok: false, error: 'need_3_cards' };
  const catalog = await loadCatalog();
  const inputs = cardIds.map(id => catalog.find(c => c.id === id)).filter((c): c is Card => !!c);
  if (inputs.length !== 3) return { ok: false, error: 'card_not_found' };
  if (!inputs.every(c => c.card_kind === 'character')) return { ok: false, error: 'not_a_character' };
  const rarity = inputs[0].rarity;
  if (!inputs.every(c => c.rarity === rarity)) return { ok: false, error: 'mixed_rarity' };
  const target = NEXT_RARITY[rarity];
  if (!target) return { ok: false, error: 'max_rarity' };

  const counts = new Map<number, number>();
  for (const c of inputs) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  const ids = [...counts.keys()];
  const { data: owned } = await supabase.from('tcg_collection')
    .select('card_id, quantity')
    .eq('discord_id', discordId).eq('level', 1).in('card_id', ids);
  const ownedMap = new Map((owned ?? []).map(r => [r.card_id, r.quantity as number]));
  for (const [id, need] of counts) {
    if ((ownedMap.get(id) ?? 0) < need) return { ok: false, error: 'not_enough_copies' };
  }
  for (const [id, need] of counts) {
    const cur = ownedMap.get(id)!;
    const next = cur - need;
    if (next <= 0) await supabase.from('tcg_collection').delete().eq('discord_id', discordId).eq('card_id', id).eq('level', 1);
    else await supabase.from('tcg_collection').update({ quantity: next }).eq('discord_id', discordId).eq('card_id', id).eq('level', 1);
  }
  const targetPool = catalog.filter(c => c.rarity === target && c.card_kind === 'character');
  if (!targetPool.length) return { ok: false, error: 'no_target_pool' };
  const rolled = targetPool[Math.floor(Math.random() * targetPool.length)];
  const { data: existing } = await supabase.from('tcg_collection')
    .select('quantity')
    .eq('discord_id', discordId).eq('card_id', rolled.id).eq('level', 1).maybeSingle();
  if (existing) await supabase.from('tcg_collection').update({ quantity: (existing.quantity as number) + 1 }).eq('discord_id', discordId).eq('card_id', rolled.id).eq('level', 1);
  else await supabase.from('tcg_collection').insert({ discord_id: discordId, card_id: rolled.id, level: 1, quantity: 1 });
  return { ok: true, consumed: inputs, result: rolled };
}

// ---- Upgrade equipment (3× at level N → 1× at level N+1) ----
export interface UpgradeResult { ok: boolean; error?: string; card?: Card; fromLevel?: number; toLevel?: number; }

export async function upgradeEquipment(discordId: string, cardId: number, fromLevel: number): Promise<UpgradeResult> {
  const { data: card } = await supabase.from('tcg_cards').select('*').eq('id', cardId).maybeSingle();
  if (!card) return { ok: false, error: 'card_not_found' };
  if ((card as Card).card_kind !== 'equipment') return { ok: false, error: 'not_an_equipment' };
  const from = Math.floor(fromLevel);
  if (from < 1 || from >= MAX_LEVEL) return { ok: false, error: 'bad_level' };
  const to = from + 1;

  const { data: row } = await supabase.from('tcg_collection')
    .select('quantity')
    .eq('discord_id', discordId).eq('card_id', cardId).eq('level', from).maybeSingle();
  const have = (row?.quantity as number) ?? 0;
  if (have < MERGE_COST_COPIES) return { ok: false, error: 'not_enough_copies' };

  const newFromQty = have - MERGE_COST_COPIES;
  if (newFromQty <= 0) {
    await supabase.from('tcg_collection').delete().eq('discord_id', discordId).eq('card_id', cardId).eq('level', from);
  } else {
    await supabase.from('tcg_collection').update({ quantity: newFromQty }).eq('discord_id', discordId).eq('card_id', cardId).eq('level', from);
  }
  const { data: dest } = await supabase.from('tcg_collection')
    .select('quantity')
    .eq('discord_id', discordId).eq('card_id', cardId).eq('level', to).maybeSingle();
  if (dest) {
    await supabase.from('tcg_collection').update({ quantity: (dest.quantity as number) + 1 }).eq('discord_id', discordId).eq('card_id', cardId).eq('level', to);
  } else {
    await supabase.from('tcg_collection').insert({ discord_id: discordId, card_id: cardId, level: to, quantity: 1 });
  }
  return { ok: true, card: card as Card, fromLevel: from, toLevel: to };
}
