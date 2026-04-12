import type { HandResult } from '../shared/index.js';
import { compareHands } from './hand-evaluator.js';

export interface PotPlayer {
  id: string;
  totalBet: number;
  isFolded: boolean;
}

export interface PotResult {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface PotAwardResult {
  potIndex: number;
  amount: number;
  winnerIds: string[];
}

/**
 * Calculate main pot and side pots.
 * Sort players by total bet ascending, create a pot at each level.
 */
export function calculatePots(players: PotPlayer[]): PotResult[] {
  const activePlayers = players.filter((p) => p.totalBet > 0);
  if (activePlayers.length === 0) return [];

  // Get unique bet levels from non-folded players, sorted ascending
  const allBetLevels = [...new Set(activePlayers.map((p) => p.totalBet))].sort(
    (a, b) => a - b,
  );

  const pots: PotResult[] = [];
  let prevLevel = 0;

  for (const level of allBetLevels) {
    const levelDelta = level - prevLevel;
    if (levelDelta <= 0) continue;

    let potAmount = 0;
    const eligible: string[] = [];

    for (const player of activePlayers) {
      // Each player contributes min(their remaining contribution at this level, levelDelta)
      const contribution = Math.min(player.totalBet - prevLevel, levelDelta);
      if (contribution > 0) {
        potAmount += contribution;
      }
      // Player is eligible if they bet at least this level AND are not folded
      if (player.totalBet >= level && !player.isFolded) {
        eligible.push(player.id);
      }
    }

    if (potAmount > 0 && eligible.length > 0) {
      pots.push({ amount: potAmount, eligiblePlayerIds: eligible });
    } else if (potAmount > 0 && eligible.length === 0) {
      // All eligible players folded — add to previous pot or create with remaining players
      const nonFolded = activePlayers
        .filter((p) => !p.isFolded && p.totalBet > prevLevel)
        .map((p) => p.id);
      if (nonFolded.length > 0) {
        pots.push({ amount: potAmount, eligiblePlayerIds: nonFolded });
      } else if (pots.length > 0) {
        // Add to previous pot
        pots[pots.length - 1]!.amount += potAmount;
      }
    }

    prevLevel = level;
  }

  return pots;
}

/**
 * Award pots to winners based on hand evaluation.
 * For ties, split equally. Odd chip goes to first player left of dealer.
 */
export function awardPots(
  pots: PotResult[],
  playerHands: Map<string, HandResult>,
  dealerSeat: number,
  seatMap: Map<string, number>,
  maxSeats: number = 10,
): PotAwardResult[] {
  const awards: PotAwardResult[] = [];

  for (let i = 0; i < pots.length; i++) {
    const pot = pots[i]!;
    const eligibleHands = pot.eligiblePlayerIds
      .filter((id) => playerHands.has(id))
      .map((id) => ({ id, hand: playerHands.get(id)! }));

    if (eligibleHands.length === 0) continue;

    // Find the best hand(s)
    let bestHand = eligibleHands[0]!.hand;
    for (const eh of eligibleHands) {
      if (compareHands(eh.hand, bestHand) > 0) {
        bestHand = eh.hand;
      }
    }

    const winners = eligibleHands.filter(
      (eh) => compareHands(eh.hand, bestHand) === 0,
    );

    if (winners.length === 1) {
      awards.push({
        potIndex: i,
        amount: pot.amount,
        winnerIds: [winners[0]!.id],
      });
    } else {
      // Split pot — odd chip to first player left of dealer
      const splitAmount = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - splitAmount * winners.length;

      // Sort winners by seat position clockwise from dealer
      const sortedWinners = [...winners].sort((a, b) => {
        const seatA = seatMap.get(a.id) ?? 0;
        const seatB = seatMap.get(b.id) ?? 0;
        const distA = (seatA - dealerSeat + maxSeats) % maxSeats;
        const distB = (seatB - dealerSeat + maxSeats) % maxSeats;
        return distA - distB;
      });

      const winnerIds = sortedWinners.map((w) => w.id);

      // First player left of dealer gets the odd chip
      awards.push({
        potIndex: i,
        amount: pot.amount,
        winnerIds,
      });
    }
  }

  return awards;
}

/**
 * Calculate how much each winner receives from a pot award.
 */
export function splitPotAmount(
  totalAmount: number,
  winnerIds: string[],
  dealerSeat: number,
  seatMap: Map<string, number>,
  maxSeats: number = 10,
): Map<string, number> {
  const result = new Map<string, number>();
  if (winnerIds.length === 0) return result;

  if (winnerIds.length === 1) {
    result.set(winnerIds[0]!, totalAmount);
    return result;
  }

  const splitAmount = Math.floor(totalAmount / winnerIds.length);
  const remainder = totalAmount - splitAmount * winnerIds.length;

  // Sort by distance from dealer (clockwise)
  const sorted = [...winnerIds].sort((a, b) => {
    const seatA = seatMap.get(a) ?? 0;
    const seatB = seatMap.get(b) ?? 0;
    const distA = (seatA - dealerSeat + maxSeats) % maxSeats;
    const distB = (seatB - dealerSeat + maxSeats) % maxSeats;
    return distA - distB;
  });

  for (let i = 0; i < sorted.length; i++) {
    // First player(s) left of dealer get the odd chip(s)
    result.set(sorted[i]!, splitAmount + (i < remainder ? 1 : 0));
  }

  return result;
}
