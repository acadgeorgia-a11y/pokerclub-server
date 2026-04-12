import { evaluateOmaha } from './hand-evaluator.js';
import { HoldemGame } from './holdem.js';
import type { GamePlayer } from './types.js';

/**
 * Omaha game — extends Hold'em with 4 hole cards and must-use-exactly-2 evaluation.
 * All betting rules are identical to Hold'em.
 */
export class OmahaGame extends HoldemGame {
  constructor(config: { smallBlind: number; bigBlind: number; maxPlayers: number }) {
    super(config);
    this.holeCardCount = 4; // Deal 4 cards instead of 2
  }

  protected override evaluatePlayerHand(player: GamePlayer) {
    return evaluateOmaha(player.holeCards, this.communityCards);
  }
}
