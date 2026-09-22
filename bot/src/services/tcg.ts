import { supabase } from '../supabase.js';
import { spendPulse } from './economy.js';
import { earnPulse } from './games.js';
import { log } from '../utils/logger.js';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type CardKind = 'character' | 'equipment';
export type EquipmentSlot = 'weapon' | 'shield' | 'spell' | 'helmet' | 'boots' | 'amulet';

export const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'shield', 'spell', 'helmet', 'boots', 'amulet'];
// Champion may equip at most one item per slot; a full loadout tops out
// at EQUIPMENT_SLOTS.length items.
export const MAX_EQUIPMENT_SLOTS = EQUIPMENT_SLOTS.length;
export const MAX_LEVEL = 5;
export const MERGE_COST_COPIES = 3;

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
  card_kind: CardKind;
  equipment_slot: EquipmentSlot | null;
  atk_bonus: number;
  def_bonus: number;
  spd_bonus: number;
}

export interface EquippedItem { card: Card; level: number; }
export interface EquipmentEntry { code: string; level: number; }

export function scaledBonuses(card: Card, level: number): { atk: number; def: number; spd: number } {
  const l = Math.max(1, Math.min(MAX_LEVEL, level));
  return {
    atk: (card.atk_bonus ?? 0) * l,
    def: (card.def_bonus ?? 0) * l,
    spd: (card.spd_bonus ?? 0) * l,
  };
}

export function effectiveStats(character: Card, equipment: EquippedItem[]): { attack: number; defense: number; speed: number } {
  let atk = character.attack, def = character.defense, spd = character.speed;
  for (const e of equipment) {
    const b = scaledBonuses(e.card, e.level);
    atk += b.atk; def += b.def; spd += b.spd;
  }
  return { attack: atk, defense: def, speed: spd };
}

export interface CollectionRow {
  card_id: number;
  quantity: number;
  level: number;
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
    if (i === PACK_SIZE - 1 && pulls.every(p => p.card.rarity === 'common')) {
      const forced = pickRarity();
      card = pickCardOfRarity(pool, forced === 'common' ? 'rare' : forced);
    }
    if (!card) card = pickCardOfRarity(pool, pickRarity());
    if (!card) continue;
    pulls.push({ card, isNew: false });
  }

  // All new pulls land at level 1 in the collection. Merging equipment to
  // higher levels is a separate action (upgradeEquipment).
  const cardIds = [...new Set(pulls.map(p => p.card.id))];
  const { data: existingLv1 } = await supabase
    .from('tcg_collection')
    .select('card_id, quantity')
    .eq('discord_id', discordId)
    .eq('level', 1)
    .in('card_id', cardIds);
  const ownedLv1 = new Map<number, number>((existingLv1 ?? []).map(r => [r.card_id as number, r.quantity as number]));

  const anyLevelIds = cardIds;
  const { data: anyLevelRows } = await supabase
    .from('tcg_collection')
    .select('card_id')
    .eq('discord_id', discordId)
    .in('card_id', anyLevelIds);
  const knewBefore = new Set<number>((anyLevelRows ?? []).map(r => r.card_id as number));

  const counts = new Map<number, number>();
  for (const p of pulls) counts.set(p.card.id, (counts.get(p.card.id) ?? 0) + 1);

  for (const [cardId, qty] of counts) {
    if (ownedLv1.has(cardId)) {
      const next = (ownedLv1.get(cardId) ?? 0) + qty;
      await supabase.from('tcg_collection')
        .update({ quantity: next })
        .eq('discord_id', discordId).eq('card_id', cardId).eq('level', 1);
    } else {
      await supabase.from('tcg_collection').insert({ discord_id: discordId, card_id: cardId, level: 1, quantity: qty });
    }
  }

  const seen = new Set<number>();
  for (const p of pulls) {
    if (!knewBefore.has(p.card.id) && !seen.has(p.card.id)) {
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
  const { data } = await supabase
    .from('tcg_collection')
    .select('card_id, quantity, level')
    .eq('discord_id', discordId);
  const cardById = new Map(pool.map(c => [c.id, c]));
  // Aggregate across levels so /cards collection stays a "one row per card"
  // summary. Equipment level detail lives in the web app view.
  const agg = new Map<number, { quantity: number; level: number }>();
  for (const r of (data ?? []) as CollectionRow[]) {
    const cur = agg.get(r.card_id);
    if (cur) { cur.quantity += r.quantity; cur.level = Math.max(cur.level, r.level); }
    else agg.set(r.card_id, { quantity: r.quantity, level: r.level });
  }
  const enriched: (CollectionRow & { card: Card })[] = [];
  for (const [cardId, v] of agg) {
    const card = cardById.get(cardId);
    if (!card) continue;
    enriched.push({ card_id: cardId, quantity: v.quantity, level: v.level, card });
  }

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

// ---- Test duel between two catalog cards (no equipment). Kept for
// /cards duel command as a quick standalone check.
export interface DuelResult { ok: boolean; error?: string; myCard?: Card; oppCard?: Card; myScore?: number; oppScore?: number; won?: boolean; }

export async function duel(discordId: string, myCardId: number, oppCardId: number): Promise<DuelResult> {
  const pool = await allCards();
  const my = pool.find(c => c.id === myCardId);
  const opp = pool.find(c => c.id === oppCardId);
  if (!my || !opp) return { ok: false, error: 'Card not found.' };
  const { data: owned } = await supabase.from('tcg_collection')
    .select('quantity')
    .eq('discord_id', discordId).eq('card_id', myCardId).eq('level', 1)
    .maybeSingle();
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

// Selling from level 1 first protects upgraded copies from being spent by
// accident. Callers still have to keep at least one copy of the card across
// all levels combined.
export async function sellCard(discordId: string, cardCode: string, quantity: number): Promise<SellResult> {
  const qty = Math.max(1, Math.floor(quantity));
  const { data: card } = await supabase.from('tcg_cards').select('*').eq('code', cardCode).maybeSingle();
  if (!card) return { ok: false, error: 'card_not_found' };
  const cardId = (card as Card).id;

  const { data: rows } = await supabase.from('tcg_collection')
    .select('quantity, level')
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

  const pulseEarned = wanted * SELL_VALUE[(card as Card).rarity];
  await earnPulse(discordId, pulseEarned, `TCG sell ${wanted}× ${cardCode}`, `tcg_sell:${cardCode}`);
  return { ok: true, card: card as Card, quantity: wanted, pulseEarned };
}

// ---- Character fusion (3 same-rarity characters → 1 random higher-rarity).
// Equipment leveling is a separate flow (upgradeEquipment) — this only
// applies to characters.
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
  const ownedMap = new Map((owned ?? []).map(r => [r.card_id as number, r.quantity as number]));
  for (const [id, need] of counts) {
    if ((ownedMap.get(id) ?? 0) < need) return { ok: false, error: 'not_enough_copies' };
  }
  for (const [id, need] of counts) {
    const cur = ownedMap.get(id)!;
    const next = cur - need;
    if (next <= 0) await supabase.from('tcg_collection').delete().eq('discord_id', discordId).eq('card_id', id).eq('level', 1);
    else await supabase.from('tcg_collection').update({ quantity: next }).eq('discord_id', discordId).eq('card_id', id).eq('level', 1);
  }

  const targetPool = pool.filter(c => c.rarity === target && c.card_kind === 'character');
  if (!targetPool.length) return { ok: false, error: 'no_target_pool' };
  const rolled = targetPool[Math.floor(Math.random() * targetPool.length)];

  const { data: existing } = await supabase.from('tcg_collection')
    .select('quantity')
    .eq('discord_id', discordId).eq('card_id', rolled.id).eq('level', 1).maybeSingle();
  if (existing) {
    await supabase.from('tcg_collection').update({ quantity: (existing.quantity as number) + 1 }).eq('discord_id', discordId).eq('card_id', rolled.id).eq('level', 1);
  } else {
    await supabase.from('tcg_collection').insert({ discord_id: discordId, card_id: rolled.id, level: 1, quantity: 1 });
  }

  return { ok: true, consumed: inputs, result: rolled };
}

// ---- Equipment upgrade: 3× (same card, level N) → 1× (same card, level N+1)
export interface UpgradeResult { ok: boolean; error?: string; card?: Card; fromLevel?: number; toLevel?: number; }

export async function upgradeEquipment(discordId: string, cardCode: string, fromLevel: number): Promise<UpgradeResult> {
  const pool = await allCards();
  const card = pool.find(c => c.code === cardCode);
  if (!card) return { ok: false, error: 'card_not_found' };
  if (card.card_kind !== 'equipment') return { ok: false, error: 'not_an_equipment' };
  const from = Math.floor(fromLevel);
  if (from < 1 || from >= MAX_LEVEL) return { ok: false, error: 'bad_level' };
  const to = from + 1;

  const { data: row } = await supabase.from('tcg_collection')
    .select('quantity')
    .eq('discord_id', discordId).eq('card_id', card.id).eq('level', from).maybeSingle();
  const have = (row?.quantity as number) ?? 0;
  if (have < MERGE_COST_COPIES) return { ok: false, error: 'not_enough_copies' };

  const newFromQty = have - MERGE_COST_COPIES;
  if (newFromQty <= 0) {
    await supabase.from('tcg_collection').delete().eq('discord_id', discordId).eq('card_id', card.id).eq('level', from);
  } else {
    await supabase.from('tcg_collection').update({ quantity: newFromQty }).eq('discord_id', discordId).eq('card_id', card.id).eq('level', from);
  }

  const { data: dest } = await supabase.from('tcg_collection')
    .select('quantity')
    .eq('discord_id', discordId).eq('card_id', card.id).eq('level', to).maybeSingle();
  if (dest) {
    await supabase.from('tcg_collection').update({ quantity: (dest.quantity as number) + 1 }).eq('discord_id', discordId).eq('card_id', card.id).eq('level', to);
  } else {
    await supabase.from('tcg_collection').insert({ discord_id: discordId, card_id: card.id, level: to, quantity: 1 });
  }
  return { ok: true, card, fromLevel: from, toLevel: to };
}

// ---- PvP challenges ----
interface CardChallenge {
  id: string;
  challengerId: string;
  challengerName: string;
  targetId: string;
  challengerCardId: number;
  challengerEquip: { cardId: number; level: number }[];
  wager: number;
  createdAt: number;
}
const cardChallenges = new Map<string, CardChallenge>();
const CARD_CHALLENGE_TTL_MS = 3 * 60_000;

function pruneCardChallenges(): void {
  const now = Date.now();
  for (const [id, c] of cardChallenges) if (now - c.createdAt > CARD_CHALLENGE_TTL_MS) cardChallenges.delete(id);
}

// Parse a Discord modal / slash-command equipment string into {code, level}
// entries. Format: comma-separated, optional ':N' suffix for level (default 1).
//   "e_flame_saber, e_iron_shield:2, e_starcaller:3"
export function parseEquipmentInput(raw: string | null | undefined): EquipmentEntry[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(token => {
    const [code, lvl] = token.split(':');
    const level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(lvl ?? 1)) || 1));
    return { code: code.trim(), level };
  });
}

async function resolveLoadout(
  pool: Card[],
  discordId: string,
  characterCode: string,
  equipment: EquipmentEntry[],
): Promise<{ ok: true; character: Card; equipment: EquippedItem[] } | { ok: false; error: string }> {
  const character = pool.find(c => c.code === characterCode);
  if (!character) return { ok: false, error: 'card_not_found' };
  if (character.card_kind !== 'character') return { ok: false, error: 'not_a_character' };

  if (equipment.length > MAX_EQUIPMENT_SLOTS) return { ok: false, error: 'too_many_equipment' };
  const resolved: EquippedItem[] = [];
  const slotsUsed = new Set<EquipmentSlot>();
  for (const e of equipment) {
    const card = pool.find(c => c.code === e.code);
    if (!card) return { ok: false, error: 'card_not_found' };
    if (card.card_kind !== 'equipment' || !card.equipment_slot) return { ok: false, error: 'not_an_equipment' };
    if (slotsUsed.has(card.equipment_slot)) return { ok: false, error: 'slot_conflict' };
    slotsUsed.add(card.equipment_slot);
    resolved.push({ card, level: Math.max(1, Math.min(MAX_LEVEL, e.level)) });
  }

  // Ownership: character (level 1) and every equipment at its stated level.
  const { data: cRow } = await supabase.from('tcg_collection')
    .select('quantity')
    .eq('discord_id', discordId).eq('card_id', character.id).eq('level', 1).maybeSingle();
  if (!cRow || (cRow.quantity ?? 0) < 1) return { ok: false, error: 'not_owned' };

  for (const e of resolved) {
    const { data: row } = await supabase.from('tcg_collection')
      .select('quantity')
      .eq('discord_id', discordId).eq('card_id', e.card.id).eq('level', e.level).maybeSingle();
    if (!row || (row.quantity ?? 0) < 1) return { ok: false, error: 'not_owned' };
  }

  return { ok: true, character, equipment: resolved };
}

export interface OpenCardChallengeResult { ok: boolean; error?: string; challengeId?: string; challengerCard?: Card; challengerEquip?: EquippedItem[]; }

export async function openCardChallenge(
  challengerId: string,
  challengerName: string,
  targetId: string,
  characterCode: string,
  equipment: EquipmentEntry[],
  wager: number,
): Promise<OpenCardChallengeResult> {
  pruneCardChallenges();
  if (challengerId === targetId) return { ok: false, error: 'self_challenge' };
  if (wager < 0 || wager > 10_000) return { ok: false, error: 'bad_wager' };

  const pool = await allCards();
  const loadout = await resolveLoadout(pool, challengerId, characterCode, equipment);
  if (!loadout.ok) return { ok: false, error: loadout.error };

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
  cardChallenges.set(id, {
    id, challengerId, challengerName, targetId,
    challengerCardId: loadout.character.id,
    challengerEquip: loadout.equipment.map(e => ({ cardId: e.card.id, level: e.level })),
    wager, createdAt: Date.now(),
  });
  return { ok: true, challengeId: id, challengerCard: loadout.character, challengerEquip: loadout.equipment };
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
  challengerEquip?: EquippedItem[];
  challengerStats?: { attack: number; defense: number; speed: number };
  targetCard?: Card;
  targetEquip?: EquippedItem[];
  targetStats?: { attack: number; defense: number; speed: number };
  turns?: { stat: 'attack' | 'defense' | 'speed'; challengerRoll: number; targetRoll: number; }[];
  challengerScore?: number;
  targetScore?: number;
  winnerId?: string;
  pot?: number;
}

export async function acceptCardChallenge(
  id: string,
  byUserId: string,
  targetCharacterCode: string,
  targetEquipment: EquipmentEntry[],
): Promise<PvPCardResult> {
  const c = cardChallenges.get(id);
  if (!c) return { ok: false, error: 'not_found' };
  if (byUserId !== c.targetId) return { ok: false, error: 'not_target' };
  const pool = await allCards();
  const targetLoadout = await resolveLoadout(pool, c.targetId, targetCharacterCode, targetEquipment);
  if (!targetLoadout.ok) return { ok: false, error: targetLoadout.error };
  const challengerCard = pool.find(x => x.id === c.challengerCardId);
  const challengerEquip = c.challengerEquip
    .map(e => { const card = pool.find(x => x.id === e.cardId); return card ? { card, level: e.level } : null; })
    .filter((x): x is EquippedItem => !!x);
  if (!challengerCard) return { ok: false, error: 'card_not_found' };

  if (c.wager > 0) {
    const d = await spendPulse(c.targetId, c.wager, 'TCG duel accepted wager');
    if (!d.success) {
      await earnPulse(c.challengerId, c.wager, `TCG duel refund (target debit failed)`, `tcg_pvp:${id}`);
      cardChallenges.delete(id);
      return { ok: false, error: 'target_debit_failed' };
    }
  }
  cardChallenges.delete(id);

  const cStats = effectiveStats(challengerCard, challengerEquip);
  const tStats = effectiveStats(targetLoadout.character, targetLoadout.equipment);
  const stats: ('attack' | 'defense' | 'speed')[] = ['attack', 'defense', 'speed'];
  let challengerScore = 0, targetScore = 0;
  const turns: PvPCardResult['turns'] = [];
  for (const s of stats) {
    const cRoll = cStats[s] + Math.random() * 5;
    const tRoll = tStats[s] + Math.random() * 5;
    if (cRoll >= tRoll) challengerScore += 1; else targetScore += 1;
    turns.push({ stat: s, challengerRoll: Math.round(cRoll * 10) / 10, targetRoll: Math.round(tRoll * 10) / 10 });
  }
  const winnerId = challengerScore > targetScore ? c.challengerId : c.targetId;
  const pot = c.wager * 2;
  if (pot > 0) await earnPulse(winnerId, pot, `TCG duel win vs opponent`, `tcg_pvp:${id}`);
  return {
    ok: true,
    challengerCard, challengerEquip, challengerStats: cStats,
    targetCard: targetLoadout.character, targetEquip: targetLoadout.equipment, targetStats: tStats,
    turns, challengerScore, targetScore, winnerId, pot,
  };
}
