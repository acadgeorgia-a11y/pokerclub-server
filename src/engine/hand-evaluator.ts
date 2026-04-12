import {
  type Card,
  type HandResult,
  HandRank,
  cardRank,
  cardSuit,
  rankValue,
  type Rank,
} from '../shared/index.js';

/** Generate all k-combinations from an array. */
export function combinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  function backtrack(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]!);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return result;
}

const RANK_NAMES: Record<number, string> = {
  14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten',
  9: 'Nine', 8: 'Eight', 7: 'Seven', 6: 'Six', 5: 'Five',
  4: 'Four', 3: 'Three', 2: 'Two',
};

const PLURAL_RANK_NAMES: Record<number, string> = {
  14: 'Aces', 13: 'Kings', 12: 'Queens', 11: 'Jacks', 10: 'Tens',
  9: 'Nines', 8: 'Eights', 7: 'Sevens', 6: 'Sixes', 5: 'Fives',
  4: 'Fours', 3: 'Threes', 2: 'Twos',
};

/** Evaluate a single 5-card hand. */
export function evaluateFiveCards(cards: Card[]): HandResult {
  if (cards.length !== 5) throw new Error('Must provide exactly 5 cards');

  const values = cards.map((c) => rankValue(cardRank(c))).sort((a, b) => b - a);
  const suits = cards.map((c) => cardSuit(c));

  const isFlush = suits.every((s) => s === suits[0]);

  // Check straight — both normal and ace-low (wheel)
  const straightResult = checkStraight(values);
  const isStraight = straightResult.isStraight;
  const straightHigh = straightResult.highCard;

  // Count rank frequencies
  const freq = new Map<number, number>();
  for (const v of values) {
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }

  const freqEntries = [...freq.entries()].sort((a, b) => {
    // Sort by frequency desc, then value desc
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const sortedCards = [...cards].sort(
    (a, b) => rankValue(cardRank(b)) - rankValue(cardRank(a)),
  );

  // Straight Flush / Royal Flush
  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return {
        rank: HandRank.ROYAL_FLUSH,
        values: [14],
        name: 'Royal Flush',
        cards: sortedCards,
      };
    }
    return {
      rank: HandRank.STRAIGHT_FLUSH,
      values: [straightHigh],
      name: `Straight Flush, ${RANK_NAMES[straightHigh]} high`,
      cards: sortedCards,
    };
  }

  // Four of a Kind
  if (freqEntries[0]![1] === 4) {
    const quadVal = freqEntries[0]![0];
    const kicker = freqEntries[1]![0];
    return {
      rank: HandRank.FOUR_OF_A_KIND,
      values: [quadVal, kicker],
      name: `Four of a Kind, ${PLURAL_RANK_NAMES[quadVal]}`,
      cards: sortedCards,
    };
  }

  // Full House
  if (freqEntries[0]![1] === 3 && freqEntries[1]![1] === 2) {
    const tripsVal = freqEntries[0]![0];
    const pairVal = freqEntries[1]![0];
    return {
      rank: HandRank.FULL_HOUSE,
      values: [tripsVal, pairVal],
      name: `Full House, ${PLURAL_RANK_NAMES[tripsVal]} full of ${PLURAL_RANK_NAMES[pairVal]}`,
      cards: sortedCards,
    };
  }

  // Flush
  if (isFlush) {
    return {
      rank: HandRank.FLUSH,
      values: values,
      name: `Flush, ${RANK_NAMES[values[0]!]} high`,
      cards: sortedCards,
    };
  }

  // Straight
  if (isStraight) {
    return {
      rank: HandRank.STRAIGHT,
      values: [straightHigh],
      name: `Straight, ${RANK_NAMES[straightHigh]} high`,
      cards: sortedCards,
    };
  }

  // Three of a Kind
  if (freqEntries[0]![1] === 3) {
    const tripsVal = freqEntries[0]![0];
    const kickers = freqEntries.slice(1).map((e) => e[0]);
    return {
      rank: HandRank.THREE_OF_A_KIND,
      values: [tripsVal, ...kickers],
      name: `Three of a Kind, ${PLURAL_RANK_NAMES[tripsVal]}`,
      cards: sortedCards,
    };
  }

  // Two Pair
  if (freqEntries[0]![1] === 2 && freqEntries[1]![1] === 2) {
    const highPair = Math.max(freqEntries[0]![0], freqEntries[1]![0]);
    const lowPair = Math.min(freqEntries[0]![0], freqEntries[1]![0]);
    const kicker = freqEntries[2]![0];
    return {
      rank: HandRank.TWO_PAIR,
      values: [highPair, lowPair, kicker],
      name: `Two Pair, ${PLURAL_RANK_NAMES[highPair]} and ${PLURAL_RANK_NAMES[lowPair]}`,
      cards: sortedCards,
    };
  }

  // One Pair
  if (freqEntries[0]![1] === 2) {
    const pairVal = freqEntries[0]![0];
    const kickers = freqEntries.slice(1).map((e) => e[0]);
    return {
      rank: HandRank.PAIR,
      values: [pairVal, ...kickers],
      name: `Pair of ${PLURAL_RANK_NAMES[pairVal]}`,
      cards: sortedCards,
    };
  }

  // High Card
  return {
    rank: HandRank.HIGH_CARD,
    values: values,
    name: `${RANK_NAMES[values[0]!]} high`,
    cards: sortedCards,
  };
}

/** Check for a straight, including ace-low (wheel). */
function checkStraight(sortedValues: number[]): { isStraight: boolean; highCard: number } {
  const unique = [...new Set(sortedValues)].sort((a, b) => b - a);
  if (unique.length < 5) return { isStraight: false, highCard: 0 };

  // Normal straight check
  if (unique[0]! - unique[4]! === 4) {
    return { isStraight: true, highCard: unique[0]! };
  }

  // Ace-low (wheel): A-2-3-4-5
  if (
    unique[0] === 14 &&
    unique[1] === 5 &&
    unique[2] === 4 &&
    unique[3] === 3 &&
    unique[4] === 2
  ) {
    return { isStraight: true, highCard: 5 }; // 5 is the high card in a wheel
  }

  return { isStraight: false, highCard: 0 };
}

/** Compare two hand results. Returns negative if a < b, positive if a > b, 0 if equal. */
export function compareHands(a: HandResult, b: HandResult): number {
  if (a.rank !== b.rank) return a.rank - b.rank;

  // Compare tiebreaker values lexicographically
  for (let i = 0; i < Math.max(a.values.length, b.values.length); i++) {
    const aVal = a.values[i] ?? 0;
    const bVal = b.values[i] ?? 0;
    if (aVal !== bVal) return aVal - bVal;
  }
  return 0;
}

/**
 * Evaluate a Hold'em hand: best 5-card hand from 2 hole + 5 community.
 * Evaluates all C(7,5) = 21 combinations.
 */
export function evaluateHoldem(holeCards: Card[], communityCards: Card[]): HandResult {
  if (holeCards.length !== 2) throw new Error('Hold\'em requires exactly 2 hole cards');
  if (communityCards.length !== 5) throw new Error('Hold\'em requires exactly 5 community cards');

  const allCards = [...holeCards, ...communityCards];
  const combos = combinations(allCards, 5);

  let best: HandResult | null = null;
  for (const combo of combos) {
    const result = evaluateFiveCards(combo);
    if (best === null || compareHands(result, best) > 0) {
      best = result;
    }
  }
  return best!;
}

/**
 * Evaluate an Omaha hand: MUST use exactly 2 of 4 hole cards + exactly 3 of 5 community.
 * Evaluates all C(4,2) x C(5,3) = 6 x 10 = 60 combinations.
 */
export function evaluateOmaha(holeCards: Card[], communityCards: Card[]): HandResult {
  if (holeCards.length !== 4) throw new Error('Omaha requires exactly 4 hole cards');
  if (communityCards.length !== 5) throw new Error('Omaha requires exactly 5 community cards');

  const holeCombos = combinations(holeCards, 2);
  const communityCombos = combinations(communityCards, 3);

  let best: HandResult | null = null;
  for (const hole of holeCombos) {
    for (const community of communityCombos) {
      const result = evaluateFiveCards([...hole, ...community]);
      if (best === null || compareHands(result, best) > 0) {
        best = result;
      }
    }
  }
  return best!;
}
