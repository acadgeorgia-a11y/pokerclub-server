export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['h', 'd', 'c', 's'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Card = `${Rank}${Suit}`;

/** Numeric value of a rank (2=2, ..., A=14) */
export function rankValue(rank: Rank): number {
  const values: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };
  return values[rank];
}

export function cardRank(card: Card): Rank {
  return card[0] as Rank;
}

export function cardSuit(card: Card): Suit {
  return card[1] as Suit;
}

export const enum HandRank {
  HIGH_CARD = 1,
  PAIR = 2,
  TWO_PAIR = 3,
  THREE_OF_A_KIND = 4,
  STRAIGHT = 5,
  FLUSH = 6,
  FULL_HOUSE = 7,
  FOUR_OF_A_KIND = 8,
  STRAIGHT_FLUSH = 9,
  ROYAL_FLUSH = 10,
}

export interface HandResult {
  /** Hand rank 1-10 */
  rank: HandRank;
  /** Tiebreaker values, highest first */
  values: number[];
  /** Human-readable name, e.g. "Two Pair, Kings and Fives" */
  name: string;
  /** The best 5 cards */
  cards: Card[];
}
