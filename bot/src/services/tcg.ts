import { supabase } from '../supabase.js';
import { spendPulse } from './economy.js';
import { log } from '../utils/logger.js';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface Card {
  id: number;
  code: string;
  name: string;
  emoji: string;
  rarity: Rarity;
  attack: number;
  defense: number;
  speed: number;
  flavor: string;
  is_active: boolean;
}

export interface CollectionRow {
  card_id: number;
  quantity: number;
  card?: Card;
}

export const PACK_COST = 100;
export const PACK_SIZE = 5;

// Pull weights per rarity (must sum to 1000 for stable arithmetic).
const WEIGHTS: Record<Rarity, number> = {
  common: 680,
  rare: 230,
  epic: 70,
  legendary: 18,
  mythic: 2,
};

export const RARITY_STYLE: Record<Rarity, { color: number; emoji: string }> = {
  common:    { color: 0x9CA3AF, emoji: '⚪' },
  rare:      { color: 0x3B82F6, emoji: '🔵' },
  epic:      { color: 0xA855F7, emoji: '🟣' },
  legendary: { color: 0xF59E0B, emoji: '🟠' },
  mythic:    { color: 0xEF4444, emoji: '🔴' },
};

let cache: Card[] | null = null;
let cacheTs = 0;
const CACHE_TTL_MS = 60_000;

async function allCards(): Promise<Card[]> {
  if (cache && Date.now() - cacheTs < CACHE_TTL_MS) return cache;
  const { data, error } = await supabase.from('tcg_cards').select('*').eq('is_active', true);
  if (error) { log('ERROR', 'tcg allCards failed', error); return cache ?? []; }
  cache = (data ?? []) as Card[];
  cacheTs = Date.now();
  return cache;
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

function pickCardOfRarity(pool: Card[], rarity: Rarity): Card | null {
  const matches = pool.filter(c => c.rarity === rarity);
  if (!matches.length) return null;
  return matches[Math.floor(Math.random() * matches.length)];
}

export interface OpenResult { ok: boolean; error?: string; pulled: { card: Card; isNew: boolean }[]; }

export async function openPack(discordId: string): Promise<OpenResult> {
  const pool = await allCards();
  if (!pool.length) return { ok: false, error: 'No cards available.', pulled: [] };

  const debit = await spendPulse(discordId, PACK_COST, 'TCG pack');
  if (!debit.success) return { ok: false, error: debit.error ?? 'Cannot debit pack cost.', pulled: [] };

  const pulls: { card: Card; isNew: boolean }[] = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    let card: Card | null = null;
    // Guarantee: at least one rare or better among the 5 pulls.
    if (i === PACK_SIZE - 1 && pulls.every(p => p.card.rarity === 'common')) {
      const forced = pickRarity();
      card = pickCardOfRarity(pool, forced === 'common' ? 'rare' : forced);
    }
    if (!card) card = pickCardOfRarity(pool, pickRarity());
    if (!card) continue;
    pulls.push({ card, isNew: false });
  }

  // Persist to collection; determine "new" flag by looking up existing rows first.
  const cardIds = [...new Set(pulls.map(p => p.card.id))];
  const { data: existing } = await supabase.from('tcg_collection').select('card_id').eq('discord_id', discordId).in('card_id', cardIds);
  const owned = new Set((existing ?? []).map(r => r.card_id));

  const counts = new Map<number, number>();
  for (const p of pulls) counts.set(p.card.id, (counts.get(p.card.id) ?? 0) + 1);

  for (const [cardId, qty] of counts) {
    const already = owned.has(cardId);
    if (already) {
      const { data: cur } = await supabase.from('tcg_collection').select('quantity').eq('discord_id', discordId).eq('card_id', cardId).maybeSingle();
      const nextQty = (cur?.quantity ?? 0) + qty;
      await supabase.from('tcg_collection').update({ quantity: nextQty }).eq('discord_id', discordId).eq('card_id', cardId);
    } else {
      await supabase.from('tcg_collection').insert({ discord_id: discordId, card_id: cardId, quantity: qty });
    }
  }

  // Mark isNew on the first occurrence of each not-previously-owned card in the pull list.
  const seen = new Set<number>();
  for (const p of pulls) {
    if (!owned.has(p.card.id) && !seen.has(p.card.id)) {
      p.isNew = true;
      seen.add(p.card.id);
    }
  }

  return { ok: true, pulled: pulls };
}

export interface CollectionSummary {
  totalCards: number;
  totalUnique: number;
  totalCatalog: number;
  byRarity: Record<Rarity, { owned: number; total: number }>;
  rows: (CollectionRow & { card: Card })[];
}

export async function getCollection(discordId: string): Promise<CollectionSummary> {
  const pool = await allCards();
  const { data } = await supabase.from('tcg_collection').select('card_id, quantity').eq('discord_id', discordId);
  const rows = (data ?? []) as CollectionRow[];
  const cardById = new Map(pool.map(c => [c.id, c]));
  const enriched = rows
    .map(r => ({ ...r, card: cardById.get(r.card_id) }))
    .filter((r): r is CollectionRow & { card: Card } => !!r.card);

  const byRarity: CollectionSummary['byRarity'] = {
    common:    { owned: 0, total: 0 },
    rare:      { owned: 0, total: 0 },
    epic:      { owned: 0, total: 0 },
    legendary: { owned: 0, total: 0 },
    mythic:    { owned: 0, total: 0 },
  };
  for (const c of pool) byRarity[c.rarity].total += 1;
  for (const r of enriched) byRarity[r.card.rarity].owned += 1;

  return {
    totalCards: enriched.reduce((a, r) => a + r.quantity, 0),
    totalUnique: enriched.length,
    totalCatalog: pool.length,
    byRarity,
    rows: enriched.sort((a, b) => rarityOrder(b.card.rarity) - rarityOrder(a.card.rarity) || a.card.name.localeCompare(b.card.name)),
  };
}

export function rarityOrder(r: Rarity): number {
  return { common: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 }[r];
}

// ---- Duel (fast card fight, best 2/3 stat rolls) ----
export interface DuelResult { ok: boolean; error?: string; myCard?: Card; oppCard?: Card; myScore?: number; oppScore?: number; won?: boolean; }

export async function duel(discordId: string, myCardId: number, oppCardId: number): Promise<DuelResult> {
  const pool = await allCards();
  const my = pool.find(c => c.id === myCardId);
  const opp = pool.find(c => c.id === oppCardId);
  if (!my || !opp) return { ok: false, error: 'Card not found.' };
  const { data: owned } = await supabase.from('tcg_collection').select('quantity').eq('discord_id', discordId).eq('card_id', myCardId).maybeSingle();
  if (!owned || (owned.quantity ?? 0) < 1) return { ok: false, error: 'You do not own that card.' };
  const stats: (keyof Pick<Card, 'attack' | 'defense' | 'speed'>)[] = ['attack', 'defense', 'speed'];
  let myScore = 0, oppScore = 0;
  for (const s of stats) {
    const mr = my[s] + Math.random() * 4;
    const or = opp[s] + Math.random() * 4;
    if (mr >= or) myScore += 1; else oppScore += 1;
  }
  return { ok: true, myCard: my, oppCard: opp, myScore, oppScore, won: myScore > oppScore };
}
