export enum GamePhase {
  WAITING = 'waiting',
  DEALING = 'dealing',
  PREFLOP = 'preflop',
  FLOP = 'flop',
  TURN = 'turn',
  RIVER = 'river',
  SHOWDOWN = 'showdown',
}

export type GameType = 'holdem' | 'omaha' | 'mixed';

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'all_in';

export interface ValidAction {
  action: ActionType;
  minAmount?: number;
  maxAmount?: number;
  callAmount?: number;
}

export interface PlayerAction {
  playerId: string;
  action: ActionType;
  amount?: number;
}
