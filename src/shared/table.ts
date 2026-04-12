import type { Card } from './card.js';
import type { GamePhase, GameType } from './game.js';

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface PotAward {
  potIndex: number;
  amount: number;
  winnerIds: string[];
  handName?: string;
}

export interface TableSettings {
  gameType: GameType;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxPlayers: number;
  actionTime: number;
  timeBank: number;
  runItTwice: boolean;
  rabbitHunting: boolean;
}

export interface SeatState {
  playerId: string;
  username: string;
  stack: number;
  currentBet: number;
  isFolded: boolean;
  isAllIn: boolean;
  isSittingOut: boolean;
  isDisconnected: boolean;
  lastAction?: string;
  /** holeCards NEVER included — sent via private 'your_hole_cards' event */
}

export interface FullTableState {
  tableId: string;
  tableName: string;
  gameType: GameType;
  phase: GamePhase;
  handNumber: number;
  dealerSeat: number;
  communityCards: Card[];
  pots: Pot[];
  totalPot: number;
  currentBet: number;
  seats: (SeatState | null)[];
  actionOn: number | null;
  settings: TableSettings;
}
