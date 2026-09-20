// Blackjack helpers — shared between the deal + action API routes.
// Cards are compact strings ("AS" = ace of spades, "10H", "KD"). Kept small
// so the HMAC token payload stays under a couple hundred bytes.

export type Card = string;
export type Suit = 'S' | 'H' | 'D' | 'C';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export function drawCard(): Card {
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  return `${rank}${suit}`;
}

export function rankOf(card: Card): string {
  return card.slice(0, card.length - 1);
}

export function suitOf(card: Card): Suit {
  return card.slice(-1) as Suit;
}

// Best hand total ≤21 if possible, otherwise minimum busted total.
export function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (r === 'A') { aces += 1; total += 11; }
    else if (r === 'J' || r === 'Q' || r === 'K') total += 10;
    else total += Number(r);
  }
  // Downgrade aces from 11 to 1 as needed to avoid busting.
  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
    if (aces === 0) soft = false;
  }
  return { total, soft: soft && aces > 0 };
}

export function isBlackjack(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  const t = handTotal(cards).total;
  return t === 21;
}

// Standard dealer rule: hit anything under 17, stand on all 17s (including
// soft 17 — casino edge is tiny either way).
export function dealerShouldHit(cards: Card[]): boolean {
  return handTotal(cards).total < 17;
}
