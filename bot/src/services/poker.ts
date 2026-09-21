import { spendPulse } from './economy.js';
import { earnPulse } from './games.js';
import { log } from '../utils/logger.js';

// ---- Cards ----
const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
type Suit = typeof SUITS[number];
type Rank = typeof RANKS[number];

export interface Card { rank: Rank; suit: Suit; }

function rankValue(r: Rank): number { return RANKS.indexOf(r) + 2; }
export function cardStr(c: Card): string { return `${c.rank}${c.suit}`; }

function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  return deck;
}
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- Hand evaluator (7-card best-5) ----
export const HAND_NAMES = [
  'High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight',
  'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush',
];

export interface HandScore { category: number; tiebreak: number[]; label: string; }

function evaluate5(cards: Card[]): HandScore {
  const vals = cards.map(c => rankValue(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const uniq = [...new Set(vals)];
  const isStraight = uniq.length === 5 && (uniq[0] - uniq[4] === 4);
  // Wheel A-2-3-4-5
  const isWheel = uniq.length === 5 && uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2;
  const straightHigh = isWheel ? 5 : uniq[0];

  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const sig = groups.map(g => g[1]).join('');

  if (isFlush && (isStraight || isWheel) && straightHigh === 14) return { category: 9, tiebreak: [14], label: HAND_NAMES[9] };
  if (isFlush && (isStraight || isWheel)) return { category: 8, tiebreak: [straightHigh], label: HAND_NAMES[8] };
  if (sig === '41') return { category: 7, tiebreak: [groups[0][0], groups[1][0]], label: HAND_NAMES[7] };
  if (sig === '32') return { category: 6, tiebreak: [groups[0][0], groups[1][0]], label: HAND_NAMES[6] };
  if (isFlush) return { category: 5, tiebreak: vals, label: HAND_NAMES[5] };
  if (isStraight || isWheel) return { category: 4, tiebreak: [straightHigh], label: HAND_NAMES[4] };
  if (sig === '311') return { category: 3, tiebreak: [groups[0][0], groups[1][0], groups[2][0]], label: HAND_NAMES[3] };
  if (sig === '221') return { category: 2, tiebreak: [groups[0][0], groups[1][0], groups[2][0]], label: HAND_NAMES[2] };
  if (sig === '2111') return { category: 1, tiebreak: [groups[0][0], groups[1][0], groups[2][0], groups[3][0]], label: HAND_NAMES[1] };
  return { category: 0, tiebreak: vals, label: HAND_NAMES[0] };
}

// Choose best 5 out of 7 cards. Iterate the 21 combinations.
export function bestHand(cards: Card[]): HandScore {
  let best: HandScore = { category: -1, tiebreak: [], label: '' };
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const s = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (compareScores(s, best) > 0) best = s;
          }
  return best;
}

function compareScores(a: HandScore, b: HandScore): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const av = a.tiebreak[i] ?? 0;
    const bv = b.tiebreak[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// ---- Game state ----
export type Phase = 'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';

export interface Player {
  discordId: string;
  username: string;
  stack: number;         // remaining PULSE in this game
  bet: number;           // this-round bet already committed
  totalCommitted: number;// across the whole hand (for side-pot resolution)
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  actedThisRound: boolean;
  disconnected: boolean;
}

export type GameListener = (evt: 'hand_dealt' | 'game_ended', g: Game) => void;

export interface Game {
  id: string;
  channelId: string;
  hostId: string;
  buyIn: number;
  smallBlind: number;
  bigBlind: number;
  players: Player[];
  deck: Card[];
  community: Card[];
  phase: Phase;
  dealerIdx: number;
  turnIdx: number;
  toCall: number;         // current highest bet this round
  minRaise: number;
  pot: number;            // committed to pot from earlier rounds
  handNumber: number;
  message?: { channelId: string; id: string };
  actionTimeout?: NodeJS.Timeout;
  createdAt: number;
  listener?: GameListener;
}

export function attachListener(gameId: string, listener: GameListener): void {
  const g = GAMES.get(gameId);
  if (g) g.listener = listener;
}

const GAMES = new Map<string, Game>();
const BY_CHANNEL = new Map<string, string>();

export function getGame(id: string): Game | undefined { return GAMES.get(id); }
export function getGameByChannel(channelId: string): Game | undefined {
  const id = BY_CHANNEL.get(channelId);
  return id ? GAMES.get(id) : undefined;
}

export interface CreateResult { ok: boolean; game?: Game; error?: string; }

export async function createGame(hostId: string, hostName: string, channelId: string, buyIn: number): Promise<CreateResult> {
  if (BY_CHANNEL.has(channelId)) return { ok: false, error: 'A poker game is already running in this channel.' };
  if (buyIn < 20) return { ok: false, error: 'Buy-in must be at least 20 PULSE.' };

  const debit = await spendPulse(hostId, buyIn, 'Poker buy-in');
  if (!debit.success) return { ok: false, error: debit.error ?? 'Cannot debit host buy-in.' };

  const id = `pkr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const g: Game = {
    id, channelId, hostId, buyIn,
    smallBlind: Math.max(1, Math.floor(buyIn / 50)),
    bigBlind: Math.max(2, Math.floor(buyIn / 25)),
    players: [makePlayer(hostId, hostName, buyIn)],
    deck: [], community: [],
    phase: 'lobby', dealerIdx: 0, turnIdx: 0, toCall: 0, minRaise: 0, pot: 0,
    handNumber: 0, createdAt: Date.now(),
  };
  GAMES.set(id, g);
  BY_CHANNEL.set(channelId, id);
  return { ok: true, game: g };
}

function makePlayer(id: string, name: string, stack: number): Player {
  return { discordId: id, username: name, stack, bet: 0, totalCommitted: 0, hole: [], folded: false, allIn: false, actedThisRound: false, disconnected: false };
}

export async function joinGame(gameId: string, userId: string, userName: string): Promise<{ ok: boolean; error?: string }> {
  const g = GAMES.get(gameId);
  if (!g) return { ok: false, error: 'Game not found.' };
  if (g.phase !== 'lobby') return { ok: false, error: 'Game already started.' };
  if (g.players.length >= 8) return { ok: false, error: 'Table is full (8 players).' };
  if (g.players.some(p => p.discordId === userId)) return { ok: false, error: 'You already joined.' };

  const debit = await spendPulse(userId, g.buyIn, 'Poker buy-in');
  if (!debit.success) return { ok: false, error: debit.error ?? 'Cannot debit buy-in.' };

  g.players.push(makePlayer(userId, userName, g.buyIn));
  return { ok: true };
}

export async function leaveGame(gameId: string, userId: string): Promise<{ ok: boolean; refunded: number; error?: string }> {
  const g = GAMES.get(gameId);
  if (!g) return { ok: false, refunded: 0, error: 'Game not found.' };
  const idx = g.players.findIndex(p => p.discordId === userId);
  if (idx < 0) return { ok: false, refunded: 0, error: 'You are not in this game.' };

  if (g.phase === 'lobby') {
    const p = g.players[idx];
    await earnPulse(userId, p.stack, 'Poker leave (lobby refund)', g.id);
    g.players.splice(idx, 1);
    if (!g.players.length) endGame(g.id);
    return { ok: true, refunded: p.stack };
  }
  // Mid-hand: fold and cash out remaining stack after showdown
  const p = g.players[idx];
  p.folded = true;
  p.disconnected = true;
  return { ok: true, refunded: 0 };
}

export function startGame(gameId: string, byUserId: string): { ok: boolean; error?: string } {
  const g = GAMES.get(gameId);
  if (!g) return { ok: false, error: 'Game not found.' };
  if (g.hostId !== byUserId) return { ok: false, error: 'Only the host can start the game.' };
  if (g.phase !== 'lobby') return { ok: false, error: 'Already started.' };
  if (g.players.length < 2) return { ok: false, error: 'Need at least 2 players.' };
  dealHand(g);
  return { ok: true };
}

function dealHand(g: Game): void {
  g.handNumber += 1;
  g.deck = shuffle(freshDeck());
  g.community = [];
  g.pot = 0;
  g.toCall = g.bigBlind;
  g.minRaise = g.bigBlind;
  g.phase = 'preflop';

  // Only include players with stack > 0
  const active = g.players.filter(p => p.stack > 0 && !p.disconnected);
  for (const p of g.players) {
    p.bet = 0;
    p.totalCommitted = 0;
    p.hole = [];
    p.folded = p.stack === 0 || p.disconnected;
    p.allIn = false;
    p.actedThisRound = false;
  }
  // Deal 2 hole cards each to active players
  for (let r = 0; r < 2; r++) for (const p of active) p.hole.push(g.deck.pop()!);

  // Advance dealer button to next player with a stack
  g.dealerIdx = nextIdxWithStack(g, g.dealerIdx);
  const sbIdx = nextIdxWithStack(g, g.dealerIdx);
  const bbIdx = nextIdxWithStack(g, sbIdx);
  postBlind(g, sbIdx, g.smallBlind);
  postBlind(g, bbIdx, g.bigBlind);
  g.turnIdx = nextIdxWithStack(g, bbIdx);

  try { g.listener?.('hand_dealt', g); } catch (err) { log('ERROR', 'poker listener failed', err); }
}

function nextIdxWithStack(g: Game, from: number): number {
  const n = g.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (g.players[idx].stack > 0 && !g.players[idx].folded && !g.players[idx].disconnected) return idx;
  }
  return from;
}

function postBlind(g: Game, idx: number, amount: number): void {
  const p = g.players[idx];
  const paid = Math.min(p.stack, amount);
  p.stack -= paid;
  p.bet += paid;
  p.totalCommitted += paid;
  if (p.stack === 0) p.allIn = true;
}

// ---- Actions ----
export type Action = 'check' | 'call' | 'fold' | 'raise' | 'allin';
export interface ActionResult { ok: boolean; error?: string; newPhase?: Phase; showdown?: ShowdownResult; }

export async function playerAction(gameId: string, userId: string, action: Action, raiseAmount?: number): Promise<ActionResult> {
  const g = GAMES.get(gameId);
  if (!g) return { ok: false, error: 'Game not found.' };
  if (!['preflop', 'flop', 'turn', 'river'].includes(g.phase)) return { ok: false, error: 'Not a betting phase.' };
  const p = g.players[g.turnIdx];
  if (!p || p.discordId !== userId) return { ok: false, error: 'Not your turn.' };
  if (p.folded || p.allIn) return { ok: false, error: 'You cannot act.' };

  if (action === 'fold') {
    p.folded = true;
    p.actedThisRound = true;
  } else if (action === 'check') {
    if (p.bet < g.toCall) return { ok: false, error: `You must call ${g.toCall - p.bet} PULSE.` };
    p.actedThisRound = true;
  } else if (action === 'call') {
    const need = g.toCall - p.bet;
    if (need <= 0) return { ok: false, error: 'Nothing to call — use check.' };
    const paid = Math.min(p.stack, need);
    p.stack -= paid;
    p.bet += paid;
    p.totalCommitted += paid;
    if (p.stack === 0) p.allIn = true;
    p.actedThisRound = true;
  } else if (action === 'raise') {
    const target = Math.max(0, Math.floor(raiseAmount ?? 0));
    const minTarget = g.toCall + g.minRaise;
    if (target < minTarget) return { ok: false, error: `Minimum raise to ${minTarget}.` };
    const need = target - p.bet;
    if (need > p.stack) return { ok: false, error: `You only have ${p.stack} PULSE — use all-in.` };
    p.stack -= need;
    p.bet = target;
    p.totalCommitted += need;
    if (p.stack === 0) p.allIn = true;
    g.minRaise = target - g.toCall;
    g.toCall = target;
    // Every non-folded, non-allin player must act again
    for (const q of g.players) if (q !== p && !q.folded && !q.allIn) q.actedThisRound = false;
    p.actedThisRound = true;
  } else if (action === 'allin') {
    const paid = p.stack;
    p.bet += paid;
    p.totalCommitted += paid;
    p.stack = 0;
    p.allIn = true;
    if (p.bet > g.toCall) {
      g.minRaise = Math.max(g.minRaise, p.bet - g.toCall);
      g.toCall = p.bet;
      for (const q of g.players) if (q !== p && !q.folded && !q.allIn) q.actedThisRound = false;
    }
    p.actedThisRound = true;
  }

  // Only one non-folded player left? Award pot immediately.
  const alive = g.players.filter(pl => !pl.folded);
  if (alive.length === 1) {
    const winner = alive[0];
    const total = g.pot + sumBets(g);
    collectBets(g);
    g.pot = 0;
    await earnPulse(winner.discordId, total, 'Poker hand win', g.id);
    winner.stack += total; // for internal tracking (not credited again)
    // Actually, don't double count: winnings already credited to PULSE; internal stack just for display parity, skip
    winner.stack -= total;
    winner.stack += total;
    g.phase = 'showdown';
    const res: ShowdownResult = { winners: [{ discordId: winner.discordId, username: winner.username, amount: total, handLabel: '(fold-win)' }], communityFinal: g.community.slice(), reveals: [] };
    scheduleNextHand(g);
    return { ok: true, newPhase: 'showdown', showdown: res };
  }

  if (roundComplete(g)) {
    collectBets(g);
    const advanced = advancePhase(g);
    if (g.phase === 'showdown') {
      const res = await resolveShowdown(g);
      scheduleNextHand(g);
      return { ok: true, newPhase: 'showdown', showdown: res };
    }
    // If everyone still in is all-in, fast-forward to showdown
    const canAct = g.players.filter(pl => !pl.folded && !pl.allIn).length;
    if (canAct <= 1 && (g.phase as Phase) !== 'showdown') {
      while ((g.phase as Phase) !== 'showdown') {
        collectBets(g);
        advancePhase(g);
      }
      const res = await resolveShowdown(g);
      scheduleNextHand(g);
      return { ok: true, newPhase: 'showdown', showdown: res };
    }
    return { ok: true, newPhase: advanced };
  }

  g.turnIdx = nextActiveIdx(g, g.turnIdx);
  return { ok: true };
}

function sumBets(g: Game): number { return g.players.reduce((a, p) => a + p.bet, 0); }
function collectBets(g: Game): void {
  g.pot += sumBets(g);
  for (const p of g.players) p.bet = 0;
  g.toCall = 0;
  g.minRaise = g.bigBlind;
}

function roundComplete(g: Game): boolean {
  const active = g.players.filter(p => !p.folded);
  const canAct = active.filter(p => !p.allIn);
  if (canAct.length === 0) return true;
  const allMatched = canAct.every(p => p.bet === g.toCall);
  const allActed = canAct.every(p => p.actedThisRound);
  return allMatched && allActed;
}

function nextActiveIdx(g: Game, from: number): number {
  const n = g.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    const p = g.players[idx];
    if (!p.folded && !p.allIn) return idx;
  }
  return from;
}

function advancePhase(g: Game): Phase {
  for (const p of g.players) p.actedThisRound = false;
  if (g.phase === 'preflop') {
    g.community.push(g.deck.pop()!, g.deck.pop()!, g.deck.pop()!);
    g.phase = 'flop';
  } else if (g.phase === 'flop') {
    g.community.push(g.deck.pop()!);
    g.phase = 'turn';
  } else if (g.phase === 'turn') {
    g.community.push(g.deck.pop()!);
    g.phase = 'river';
  } else if (g.phase === 'river') {
    g.phase = 'showdown';
  }
  if (g.phase !== 'showdown') g.turnIdx = nextActiveIdx(g, g.dealerIdx);
  return g.phase;
}

// ---- Showdown with side pots ----
export interface WinnerRow { discordId: string; username: string; amount: number; handLabel: string; }
export interface RevealRow { discordId: string; username: string; hole: Card[]; handLabel: string; }
export interface ShowdownResult { winners: WinnerRow[]; communityFinal: Card[]; reveals: RevealRow[]; }

async function resolveShowdown(g: Game): Promise<ShowdownResult> {
  const contenders = g.players.filter(p => !p.folded);
  const scored = contenders.map(p => ({ p, score: bestHand([...p.hole, ...g.community]) }));

  // Build side pots keyed on totalCommitted
  const distinct = [...new Set(g.players.map(p => p.totalCommitted))].filter(v => v > 0).sort((a, b) => a - b);
  const pots: { amount: number; eligible: string[] }[] = [];
  let prev = 0;
  for (const level of distinct) {
    const perPlayer = level - prev;
    const contributors = g.players.filter(p => p.totalCommitted >= level);
    const amount = perPlayer * contributors.length;
    const eligible = contributors.filter(p => !p.folded).map(p => p.discordId);
    if (amount > 0 && eligible.length) pots.push({ amount, eligible });
    else if (amount > 0 && !eligible.length && pots.length) pots[pots.length - 1].amount += amount;
    prev = level;
  }

  const winnerRows: WinnerRow[] = [];
  for (const pot of pots) {
    const eligibleScored = scored.filter(s => pot.eligible.includes(s.p.discordId));
    if (!eligibleScored.length) continue;
    let best = eligibleScored[0];
    for (const s of eligibleScored) if (compareScores(s.score, best.score) > 0) best = s;
    const winners = eligibleScored.filter(s => compareScores(s.score, best.score) === 0);
    const each = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount - each * winners.length;
    for (let i = 0; i < winners.length; i++) {
      const w = winners[i];
      const amt = each + (i === 0 ? remainder : 0);
      w.p.stack += amt;
      await earnPulse(w.p.discordId, amt, 'Poker hand win', g.id).catch(err => log('ERROR', 'poker earn failed', err));
      winnerRows.push({ discordId: w.p.discordId, username: w.p.username, amount: amt, handLabel: w.score.label });
    }
  }
  g.pot = 0;
  return {
    winners: winnerRows,
    communityFinal: g.community.slice(),
    reveals: scored.map(s => ({ discordId: s.p.discordId, username: s.p.username, hole: s.p.hole.slice(), handLabel: s.score.label })),
  };
}

function scheduleNextHand(g: Game): void {
  // Auto-deal next hand after a short pause if 2+ players still have chips
  setTimeout(() => {
    if (!GAMES.has(g.id)) return;
    const withChips = g.players.filter(p => p.stack > 0 && !p.disconnected);
    if (withChips.length < 2) {
      // Cash out the last player standing and end
      if (withChips.length === 1) {
        // Their stack is already in balance_pulse via earnPulse from resolveShowdown
      }
      endGame(g.id);
      return;
    }
    dealHand(g);
  }, 6_000);
}

export function endGame(gameId: string): void {
  const g = GAMES.get(gameId);
  if (!g) return;
  if (g.actionTimeout) clearTimeout(g.actionTimeout);
  BY_CHANNEL.delete(g.channelId);
  GAMES.delete(gameId);
  g.phase = 'ended';
  try { g.listener?.('game_ended', g); } catch (err) { log('ERROR', 'poker listener failed', err); }
}

export function currentActor(g: Game): Player | null {
  const p = g.players[g.turnIdx];
  return p && !p.folded && !p.allIn ? p : null;
}
