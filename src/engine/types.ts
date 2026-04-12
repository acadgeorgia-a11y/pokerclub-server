import type { Card, HandResult } from '../shared/index.js';
import type { ActionType, GamePhase, ValidAction } from '../shared/index.js';
import type { PotResult } from './pot.js';

export interface GamePlayer {
  id: string;
  seatIndex: number;
  stack: number;
  holeCards: Card[];
  currentBet: number;
  totalBet: number;
  isFolded: boolean;
  isAllIn: boolean;
  hasActed: boolean;
  lastAction?: ActionType;
}

export interface GameConfig {
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
}

// ─── Events emitted by the engine ───────────────────────────

export type HandEvent =
  | { type: 'hand_started'; handNumber: number; dealerSeat: number }
  | { type: 'blinds_posted'; smallBlind: { playerId: string; amount: number }; bigBlind: { playerId: string; amount: number } }
  | { type: 'hole_cards_dealt'; playerId: string; cards: Card[] }
  | { type: 'action_required'; playerId: string; seatIndex: number; validActions: ValidAction[] }
  | { type: 'player_acted'; playerId: string; action: ActionType; amount: number; potTotal: number }
  | { type: 'phase_changed'; phase: GamePhase; communityCards: Card[] }
  | { type: 'showdown'; results: ShowdownResult[] }
  | { type: 'pot_awarded'; potIndex: number; amount: number; winnerIds: string[]; handName?: string }
  | { type: 'hand_complete' }
  | { type: 'pot_update'; pots: PotResult[]; totalPot: number };

export interface ShowdownResult {
  playerId: string;
  seatIndex: number;
  holeCards: Card[];
  hand: HandResult;
}

export interface SeatInput {
  id: string;
  seatIndex: number;
  stack: number;
}
