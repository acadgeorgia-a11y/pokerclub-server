import type { Card, HandResult } from '../shared/index.js';
import { shuffleDeck } from './deck.js';
import { evaluateHoldem } from './hand-evaluator.js';
import { calculatePots, type PotResult } from './pot.js';
import type { GamePlayer } from './types.js';

export interface RunItConfig {
  times: 2 | 3;
}

export interface RunResult {
  runNumber: number;
  communityCards: Card[];
  winners: Map<string, number>; // playerId -> amount won this run
}

/**
 * Run-it-twice/three: deal remaining community cards multiple times,
 * split pot proportionally by wins per run.
 */
export function runItMultiple(
  players: GamePlayer[],
  existingCommunity: Card[],
  remainingDeck: Card[],
  pots: PotResult[],
  times: 2 | 3,
  dealerSeat: number,
  maxPlayers: number,
): RunResult[] {
  const results: RunResult[] = [];
  const cardsNeeded = 5 - existingCommunity.length;

  for (let run = 0; run < times; run++) {
    // For run 0, use the deck as-is. For subsequent runs, reshuffle remaining cards.
    let deckForRun: Card[];
    if (run === 0) {
      deckForRun = [...remainingDeck];
    } else {
      deckForRun = shuffleDeck([...remainingDeck]);
    }

    // Deal remaining community cards
    const newCards: Card[] = [];
    for (let i = 0; i < cardsNeeded; i++) {
      // Burn one, deal one (except first card of flop which burns then deals 3)
      if (existingCommunity.length === 0 && i === 0) {
        deckForRun.pop(); // burn
      } else if (i > 0 || existingCommunity.length > 0) {
        deckForRun.pop(); // burn
      }
      newCards.push(deckForRun.pop()!);
    }

    const fullCommunity = [...existingCommunity, ...newCards];

    // Evaluate hands
    const playerHands = new Map<string, HandResult>();
    for (const player of players) {
      if (!player.isFolded) {
        const hand = evaluateHoldem(player.holeCards, fullCommunity);
        playerHands.set(player.id, hand);
      }
    }

    // Award pots for this run (each run gets 1/times of each pot)
    const winners = new Map<string, number>();

    for (const pot of pots) {
      const runPotAmount = Math.floor(pot.amount / times);
      const eligible = pot.eligiblePlayerIds.filter((id) => playerHands.has(id));

      if (eligible.length === 0) continue;

      // Find best hand
      let bestHand = playerHands.get(eligible[0]!)!;
      for (const id of eligible) {
        const hand = playerHands.get(id)!;
        if (hand.rank > bestHand.rank || (hand.rank === bestHand.rank && hand.values > bestHand.values)) {
          bestHand = hand;
        }
      }

      const runWinners = eligible.filter((id) => {
        const hand = playerHands.get(id)!;
        return hand.rank === bestHand.rank &&
          JSON.stringify(hand.values) === JSON.stringify(bestHand.values);
      });

      const splitAmount = Math.floor(runPotAmount / runWinners.length);
      for (const winnerId of runWinners) {
        winners.set(winnerId, (winners.get(winnerId) ?? 0) + splitAmount);
      }
    }

    results.push({
      runNumber: run + 1,
      communityCards: fullCommunity,
      winners,
    });
  }

  return results;
}
