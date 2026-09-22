import { supabase } from '../supabase.js';
import { spendPulse } from './economy.js';
import { earnPulse } from './games.js';
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

// ---- Sell duplicates ----
export const SELL_VALUE: Record<Rarity, number> = {
  common: 10, rare: 30, epic: 100, legendary: 300, mythic: 1000,
};

export interface SellResult { ok: boolean; error?: string; card?: Card; quantity?: number; pulseEarned?: number; }

export async function sellCard(discordId: string, cardCode: string, quantity: number): Promise<SellResult> {
  const qty = Math.max(1, Math.floor(quantity));
  const { data: card } = await supabase.from('tcg_cards').select('*').eq('code', cardCode).maybeSingle();
  if (!card) return { ok: false, error: 'card_not_found' };
  const { data: row } = await supabase.from('tcg_collection').select('quantity').eq('discord_id', discordId).eq('card_id', (card as Card).id).maybeSingle();
  const owned = row?.quantity ?? 0;
  if (owned <= 0) return { ok: false, error: 'not_owned' };
  // Protect the last copy so the collection can't be emptied by mistake.
  const maxSellable = Math.max(0, owned - 1);
  if (maxSellable <= 0) return { ok: false, error: 'keep_last_copy' };
  const sold = Math.min(qty, maxSellable);
  const pulseEarned = sold * SELL_VALUE[(card as Card).rarity];
  const newQty = owned - sold;
  if (newQty <= 0) {
    await supabase.from('tcg_collection').delete().eq('discord_id', discordId).eq('card_id', (card as Card).id);
  } else {
    await supabase.from('tcg_collection').update({ quantity: newQty }).eq('discord_id', discordId).eq('card_id', (card as Card).id);
  }
  await earnPulse(discordId, pulseEarned, `TCG sell ${sold}× ${cardCode}`, `tcg_sell:${cardCode}`);
  return { ok: true, card: card as Card, quantity: sold, pulseEarned };
}

// ---- Fusion (3 same-rarity cards → 1 random higher-rarity card) ----
const NEXT_RARITY: Record<Rarity, Rarity | null> = {
  common: 'rare', rare: 'epic', epic: 'legendary', legendary: 'mythic', mythic: null,
};
export const FUSE_COST_MULT: Record<Rarity, number> = { common: 1, rare: 2, epic: 4, legendary: 8, mythic: 0 };

export interface FusionResult { ok: boolean; error?: string; consumed?: Card[]; result?: Card; }

export async function fuseCards(discordId: string, codes: string[]): Promise<FusionResult> {
  if (codes.length !== 3) return { ok: false, error: 'need_3_cards' };
  const pool = await allCards();
  const inputs = codes.map(c => pool.find(x => x.code === c)).filter((c): c is Card => !!c);
  if (inputs.length !== 3) return { ok: false, error: 'card_not_found' };

  const rarity = inputs[0].rarity;
  if (!inputs.every(c => c.rarity === rarity)) return { ok: false, error: 'mixed_rarity' };
  const target = NEXT_RARITY[rarity];
  if (!target) return { ok: false, error: 'max_rarity' };

  // Verify ownership: each card must be owned ≥ its occurrence count in the input.
  const counts = new Map<number, number>();
  for (const c of inputs) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  const ids = [...counts.keys()];
  const { data: owned } = await supabase.from('tcg_collection').select('card_id, quantity').eq('discord_id', discordId).in('card_id', ids);
  const ownedMap = new Map((owned ?? []).map(r => [r.card_id, r.quantity as number]));
  for (const [id, need] of counts) {
    if ((ownedMap.get(id) ?? 0) < need) return { ok: false, error: 'not_enough_copies' };
  }

  // Deduct the 3 cards (delete rows that hit zero).
  for (const [id, need] of counts) {
    const cur = ownedMap.get(id)!;
    const next = cur - need;
    if (next <= 0) await supabase.from('tcg_collection').delete().eq('discord_id', discordId).eq('card_id', id);
    else await supabase.from('tcg_collection').update({ quantity: next }).eq('discord_id', discordId).eq('card_id', id);
  }

  // Roll a random card of the target rarity.
  const targetPool = pool.filter(c => c.rarity === target);
  if (!targetPool.length) return { ok: false, error: 'no_target_pool' };
  const rolled = targetPool[Math.floor(Math.random() * targetPool.length)];

  // Add it to the collection.
  const { data: existing } = await supabase.from('tcg_collection').select('quantity').eq('discord_id', discordId).eq('card_id', rolled.id).maybeSingle();
  if (existing) await supabase.from('tcg_collection').update({ quantity: (existing.quantity as number) + 1 }).eq('discord_id', discordId).eq('card_id', rolled.id);
  else await supabase.from('tcg_collection').insert({ discord_id: discordId, card_id: rolled.id, quantity: 1 });

  return { ok: true, consumed: inputs, result: rolled };
}

// ---- PvP challenges ----
interface CardChallenge {
  id: string;
  challengerId: string;
  challengerName: string;
  targetId: string;
  challengerCardId: number;
  wager: number;
  createdAt: number;
}
const cardChallenges = new Map<string, CardChallenge>();
const CARD_CHALLENGE_TTL_MS = 3 * 60_000;

function pruneCardChallenges(): void {
  const now = Date.now();
  for (const [id, c] of cardChallenges) if (now - c.createdAt > CARD_CHALLENGE_TTL_MS) cardChallenges.delete(id);
}

export interface OpenCardChallengeResult { ok: boolean; error?: string; challengeId?: string; challengerCard?: Card; }

export async function openCardChallenge(challengerId: string, challengerName: string, targetId: string, cardCode: string, wager: number): Promise<OpenCardChallengeResult> {
  pruneCardChallenges();
  if (challengerId === targetId) return { ok: false, error: 'self_challenge' };
  if (wager < 0 || wager > 10_000) return { ok: false, error: 'bad_wager' };

  const pool = await allCards();
  const card = pool.find(c => c.code === cardCode);
  if (!card) return { ok: false, error: 'card_not_found' };
  const { data: owned } = await supabase.from('tcg_collection').select('quantity').eq('discord_id', challengerId).eq('card_id', card.id).maybeSingle();
  if (!owned || (owned.quantity ?? 0) < 1) return { ok: false, error: 'not_owned' };

  for (const c of cardChallenges.values()) {
    if ((c.challengerId === challengerId && c.targetId === targetId) || (c.challengerId === targetId && c.targetId === challengerId)) {
      return { ok: false, error: 'pending_challenge' };
    }
  }
  if (wager > 0) {
    const d = await spendPulse(challengerId, wager, 'TCG duel wager (pending)');
    if (!d.success) return { ok: false, error: d.error ?? 'debit_failed' };
  }
  const id = `tcgpvp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  cardChallenges.set(id, { id, challengerId, challengerName, targetId, challengerCardId: card.id, wager, createdAt: Date.now() });
  return { ok: true, challengeId: id, challengerCard: card };
}

export function getCardChallenge(id: string): CardChallenge | undefined {
  pruneCardChallenges();
  return cardChallenges.get(id);
}

export async function declineCardChallenge(id: string, byUserId: string): Promise<{ ok: boolean; error?: string; refundedTo?: string }> {
  const c = cardChallenges.get(id);
  if (!c) return { ok: false, error: 'not_found' };
  if (byUserId !== c.targetId && byUserId !== c.challengerId) return { ok: false, error: 'not_yours' };
  if (c.wager > 0) await earnPulse(c.challengerId, c.wager, `TCG duel declined refund`, `tcg_pvp:${id}`);
  cardChallenges.delete(id);
  return { ok: true, refundedTo: c.challengerId };
}

export interface PvPCardResult {
  ok: boolean;
  error?: string;
  challengerCard?: Card;
  targetCard?: Card;
  turns?: { stat: 'attack' | 'defense' | 'speed'; challengerRoll: number; targetRoll: number; }[];
  challengerScore?: number;
  targetScore?: number;
  winnerId?: string;
  pot?: number;
}

export async function acceptCardChallenge(id: string, byUserId: string, targetCardCode: string): Promise<PvPCardResult> {
  const c = cardChallenges.get(id);
  if (!c) return { ok: false, error: 'not_found' };
  if (byUserId !== c.targetId) return { ok: false, error: 'not_target' };
  const pool = await allCards();
  const targetCard = pool.find(x => x.code === targetCardCode);
  const challengerCard = pool.find(x => x.id === c.challengerCardId);
  if (!targetCard || !challengerCard) return { ok: false, error: 'card_not_found' };
  const { data: owned } = await supabase.from('tcg_collection').select('quantity').eq('discord_id', c.targetId).eq('card_id', targetCard.id).maybeSingle();
  if (!owned || (owned.quantity ?? 0) < 1) return { ok: false, error: 'not_owned' };

  if (c.wager > 0) {
    const d = await spendPulse(c.targetId, c.wager, 'TCG duel accepted wager');
    if (!d.success) {
      await earnPulse(c.challengerId, c.wager, `TCG duel refund (target debit failed)`, `tcg_pvp:${id}`);
      cardChallenges.delete(id);
      return { ok: false, error: 'target_debit_failed' };
    }
  }
  cardChallenges.delete(id);

  const stats: ('attack' | 'defense' | 'speed')[] = ['attack', 'defense', 'speed'];
  let challengerScore = 0, targetScore = 0;
  const turns: PvPCardResult['turns'] = [];
  for (const s of stats) {
    const cRoll = challengerCard[s] + Math.random() * 5;
    const tRoll = targetCard[s] + Math.random() * 5;
    if (cRoll >= tRoll) challengerScore += 1; else targetScore += 1;
    turns.push({ stat: s, challengerRoll: Math.round(cRoll * 10) / 10, targetRoll: Math.round(tRoll * 10) / 10 });
  }
  const winnerId = challengerScore > targetScore ? c.challengerId : c.targetId;
  const pot = c.wager * 2;
  if (pot > 0) await earnPulse(winnerId, pot, `TCG duel win vs opponent`, `tcg_pvp:${id}`);
  return { ok: true, challengerCard, targetCard, turns, challengerScore, targetScore, winnerId, pot };
}
