import type { Card } from '../shared/index.js';
import { evaluateHoldem, compareHands } from './hand-evaluator.js';
import { shuffleDeck } from './deck.js';

export interface EquityResult {
  playerId: string;
  winPct: number;
  tiePct: number;
}

/**
 * Monte Carlo equity calculation.
 * Simulates remaining community cards N times and counts wins/ties.
 */
export function calculateEquity(
  players: Array<{ id: string; holeCards: Card[] }>,
  communityCards: Card[],
  remainingDeck: Card[],
  simulations: number = 10000,
): EquityResult[] {
  const wins = new Map<string, number>();
  const ties = new Map<string, number>();

  for (const p of players) {
    wins.set(p.id, 0);
    ties.set(p.id, 0);
  }

  const cardsNeeded = 5 - communityCards.length;

  for (let i = 0; i < simulations; i++) {
    // Shuffle remaining deck and draw needed community cards
    const shuffled = shuffleDeck(remainingDeck);
    const simCommunity = [
      ...communityCards,
      ...shuffled.slice(0, cardsNeeded),
    ];

    // Evaluate all hands
    const hands = players.map((p) => ({
      id: p.id,
      hand: evaluateHoldem(p.holeCards, simCommunity),
    }));

    // Find best hand(s)
    let best = hands[0]!;
    for (let j = 1; j < hands.length; j++) {
      if (compareHands(hands[j]!.hand, best.hand) > 0) {
        best = hands[j]!;
      }
    }

    const winners = hands.filter((h) => compareHands(h.hand, best.hand) === 0);

    if (winners.length === 1) {
      wins.set(winners[0]!.id, (wins.get(winners[0]!.id) ?? 0) + 1);
    } else {
      for (const w of winners) {
        ties.set(w.id, (ties.get(w.id) ?? 0) + 1);
      }
    }
  }

  return players.map((p) => ({
    playerId: p.id,
    winPct: Math.round(((wins.get(p.id) ?? 0) / simulations) * 1000) / 10,
    tiePct: Math.round(((ties.get(p.id) ?? 0) / simulations) * 1000) / 10,
  }));
}
