export type TransactionType = 'buy_in' | 'cash_out' | 'transfer' | 'adjustment';

export interface Transaction {
  id: string;
  playerId: string;
  tableId: string;
  sessionId: string;
  type: TransactionType;
  amount: number; // always positive
  balanceAfter: number;
  timestamp: Date;
  confirmedBy?: string; // host who approved
  notes?: string;
}

export interface ChipInRecord {
  id: string;
  from: string;
  to: string;
  amount: number;
  method: 'venmo' | 'zelle' | 'cash' | 'other';
  confirmed: boolean;
  confirmedAt?: Date;
}

export interface SessionSummary {
  tableId: string;
  sessionId: string;
  players: SessionPlayerResult[];
  startedAt: Date;
  endedAt: Date;
}

export interface SessionPlayerResult {
  playerId: string;
  username: string;
  buyInTotal: number;
  cashOutTotal: number;
  net: number;
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}
