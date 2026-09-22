import { supabase } from './supabase';
import type { Card, Rarity } from './tcgShared';
import { PACK_COST, PACK_SIZE, NEXT_RARITY, SELL_VALUE } from './tcgShared';

export { PACK_COST, PACK_SIZE, RARITY_STYLE, rarityOrder, SELL_VALUE, NEXT_RARITY } from './tcgShared';
export type { Card, Rarity } from './tcgShared';

const WEIGHTS: Record<Rarity, number> = {
  common: 680, rare: 230, epic: 70, legendary: 18, mythic: 2,
};

export async function loadCatalog(): Promise<Card[]> {
  const { data } = await supabase.from('tcg_cards').select('*').eq('is_active', true);
  return (data ?? []) as Card[];
}

export async function loadCollection(discordId: string): Promise<Map<number, number>> {
  const { data } = await supabase.from('tcg_collection').select('card_id, quantity').eq('discord_id', discordId);
  const map = new Map<number, number>();
  for (const r of data ?? []) map.set(r.card_id, r.quantity);
  return map;
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
  const { data: user } = await supabase.from('discord_users').select('balance_pulse, lifetime_spent_pulse').eq('discord_id', discordId).single();
  if (!user) return { ok: false, error: 'user_not_found' };
  if (user.balance_pulse < PACK_COST) return { ok: false, error: 'insufficient_pulse' };
  const nb = user.balance_pulse - PACK_COST;
  await supabase.from('discord_users').update({ balance_pulse: nb, lifetime_spent_pulse: (user.lifetime_spent_pulse ?? 0) + PACK_COST }).eq('discord_id', discordId);
  await supabase.from('pulse_transactions').insert({ discord_id: discordId, type: 'SPEND_SHOP', amount: -PACK_COST, reason: 'TCG pack', balance_after: nb });

  const pulls: { card: Card; isNew: boolean }[] = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    let r: Rarity = pickRarity();
    if (i === PACK_SIZE - 1 && pulls.every(p => p.card.rarity === 'common')) r = r === 'common' ? 'rare' : r;
    const pool = catalog.filter(c => c.rarity === r);
    if (!pool.length) continue;
    pulls.push({ card: pool[Math.floor(Math.random() * pool.length)], isNew: false });
  }

  const ids = [...new Set(pulls.map(p => p.card.id))];
  const { data: existing } = await supabase.from('tcg_collection').select('card_id, quantity').eq('discord_id', discordId).in('card_id', ids);
  const owned = new Map<number, number>();
  for (const r of existing ?? []) owned.set(r.card_id, r.quantity);

  const counts = new Map<number, number>();
  for (const p of pulls) counts.set(p.card.id, (counts.get(p.card.id) ?? 0) + 1);
  for (const [cardId, qty] of counts) {
    const wasOwned = owned.has(cardId);
    if (wasOwned) {
      await supabase.from('tcg_collection').update({ quantity: (owned.get(cardId) ?? 0) + qty }).eq('discord_id', discordId).eq('card_id', cardId);
    } else {
      await supabase.from('tcg_collection').insert({ discord_id: discordId, card_id: cardId, quantity: qty });
    }
  }

  const seen = new Set<number>();
  for (const p of pulls) {
    if (!owned.has(p.card.id) && !seen.has(p.card.id)) { p.isNew = true; seen.add(p.card.id); }
  }

  return { ok: true, pulled: pulls, newBalance: nb };
}

// ---- Sell duplicates ----
export interface SellResult { ok: boolean; error?: string; sold?: number; pulseEarned?: number; newBalance?: number; }

async function credit(discordId: string, amount: number, reason: string): Promise<number> {
  const { data: user } = await supabase.from('discord_users').select('balance_pulse, lifetime_earned_pulse').eq('discord_id', discordId).single();
  const bal = (user?.balance_pulse ?? 0) + amount;
  await supabase.from('discord_users').update({ balance_pulse: bal, lifetime_earned_pulse: (user?.lifetime_earned_pulse ?? 0) + amount }).eq('discord_id', discordId);
  await supabase.from('pulse_transactions').insert({ discord_id: discordId, type: 'EARN_EVENT', amount, reason, balance_after: bal });
  return bal;
}

export async function sellCards(discordId: string, cardId: number, quantity: number): Promise<SellResult> {
  const qty = Math.max(1, Math.floor(quantity));
  const { data: card } = await supabase.from('tcg_cards').select('*').eq('id', cardId).maybeSingle();
  if (!card) return { ok: false, error: 'card_not_found' };
  const { data: row } = await supabase.from('tcg_collection').select('quantity').eq('discord_id', discordId).eq('card_id', cardId).maybeSingle();
  const owned = row?.quantity ?? 0;
  if (owned <= 0) return { ok: false, error: 'not_owned' };
  const maxSellable = Math.max(0, owned - 1);
  if (maxSellable <= 0) return { ok: false, error: 'keep_last_copy' };
  const sold = Math.min(qty, maxSellable);
  const rarity = (card as Card).rarity;
  const pulseEarned = sold * SELL_VALUE[rarity];
  const newQty = owned - sold;
  if (newQty <= 0) {
    await supabase.from('tcg_collection').delete().eq('discord_id', discordId).eq('card_id', cardId);
  } else {
    await supabase.from('tcg_collection').update({ quantity: newQty }).eq('discord_id', discordId).eq('card_id', cardId);
  }
  const newBalance = await credit(discordId, pulseEarned, `TCG sell ${sold}× ${(card as Card).code}`);
  return { ok: true, sold, pulseEarned, newBalance };
}

// ---- Fuse (3 same-rarity → 1 higher-rarity, random pick) ----
export interface FuseResult { ok: boolean; error?: string; consumed?: Card[]; result?: Card; }

export async function fuse(discordId: string, cardIds: number[]): Promise<FuseResult> {
  if (cardIds.length !== 3) return { ok: false, error: 'need_3_cards' };
  const catalog = await loadCatalog();
  const inputs = cardIds.map(id => catalog.find(c => c.id === id)).filter((c): c is Card => !!c);
  if (inputs.length !== 3) return { ok: false, error: 'card_not_found' };
  const rarity = inputs[0].rarity;
  if (!inputs.every(c => c.rarity === rarity)) return { ok: false, error: 'mixed_rarity' };
  const target = NEXT_RARITY[rarity];
  if (!target) return { ok: false, error: 'max_rarity' };

  const counts = new Map<number, number>();
  for (const c of inputs) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  const ids = [...counts.keys()];
  const { data: owned } = await supabase.from('tcg_collection').select('card_id, quantity').eq('discord_id', discordId).in('card_id', ids);
  const ownedMap = new Map((owned ?? []).map(r => [r.card_id, r.quantity as number]));
  for (const [id, need] of counts) {
    if ((ownedMap.get(id) ?? 0) < need) return { ok: false, error: 'not_enough_copies' };
  }
  for (const [id, need] of counts) {
    const cur = ownedMap.get(id)!;
    const next = cur - need;
    if (next <= 0) await supabase.from('tcg_collection').delete().eq('discord_id', discordId).eq('card_id', id);
    else await supabase.from('tcg_collection').update({ quantity: next }).eq('discord_id', discordId).eq('card_id', id);
  }
  const targetPool = catalog.filter(c => c.rarity === target);
  if (!targetPool.length) return { ok: false, error: 'no_target_pool' };
  const rolled = targetPool[Math.floor(Math.random() * targetPool.length)];
  const { data: existing } = await supabase.from('tcg_collection').select('quantity').eq('discord_id', discordId).eq('card_id', rolled.id).maybeSingle();
  if (existing) await supabase.from('tcg_collection').update({ quantity: (existing.quantity as number) + 1 }).eq('discord_id', discordId).eq('card_id', rolled.id);
  else await supabase.from('tcg_collection').insert({ discord_id: discordId, card_id: rolled.id, quantity: 1 });
  return { ok: true, consumed: inputs, result: rolled };
}
