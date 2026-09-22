import { supabase } from './supabase';
import type { Card, Rarity } from './tcgShared';
import { PACK_COST, PACK_SIZE } from './tcgShared';

export { PACK_COST, PACK_SIZE, RARITY_STYLE, rarityOrder } from './tcgShared';
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
