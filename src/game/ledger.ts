import type { Transaction, SessionPlayerResult, Settlement } from '../shared/index.js';
import { calculateSettlements } from './settlement.js';
import { randomUUID } from 'crypto';

interface BuyInRequest {
  id: string;
  playerId: string;
  username: string;
  amount: number;
  timestamp: Date;
}

export class LedgerManager {
  private transactions: Transaction[] = [];
  private pendingBuyIns: BuyInRequest[] = [];
  private sessionId: string;
  private tableId: string;

  constructor(tableId: string) {
    this.tableId = tableId;
    this.sessionId = randomUUID();
  }

  requestBuyIn(playerId: string, username: string, amount: number): BuyInRequest {
    const request: BuyInRequest = {
      id: randomUUID(),
      playerId,
      username,
      amount,
      timestamp: new Date(),
    };
    this.pendingBuyIns.push(request);
    return request;
  }

  approveBuyIn(requestId: string, confirmedBy: string): Transaction | null {
    const idx = this.pendingBuyIns.findIndex((r) => r.id === requestId);
    if (idx === -1) return null;

    const request = this.pendingBuyIns[idx]!;
    this.pendingBuyIns.splice(idx, 1);

    const playerBalance = this.getPlayerBalance(request.playerId);

    const transaction: Transaction = {
      id: randomUUID(),
      playerId: request.playerId,
      tableId: this.tableId,
      sessionId: this.sessionId,
      type: 'buy_in',
      amount: request.amount,
      balanceAfter: playerBalance + request.amount,
      timestamp: new Date(),
      confirmedBy,
    };

    this.transactions.push(transaction);
    return transaction;
  }

  denyBuyIn(requestId: string): boolean {
    const idx = this.pendingBuyIns.findIndex((r) => r.id === requestId);
    if (idx === -1) return false;
    this.pendingBuyIns.splice(idx, 1);
    return true;
  }

  recordCashOut(playerId: string, amount: number): Transaction {
    const playerBalance = this.getPlayerBalance(playerId);

    const transaction: Transaction = {
      id: randomUUID(),
      playerId,
      tableId: this.tableId,
      sessionId: this.sessionId,
      type: 'cash_out',
      amount,
      balanceAfter: playerBalance - amount,
      timestamp: new Date(),
    };

    this.transactions.push(transaction);
    return transaction;
  }

  recordAdjustment(playerId: string, amount: number, confirmedBy: string, notes?: string): Transaction {
    const playerBalance = this.getPlayerBalance(playerId);

    const transaction: Transaction = {
      id: randomUUID(),
      playerId,
      tableId: this.tableId,
      sessionId: this.sessionId,
      type: 'adjustment',
      amount: Math.abs(amount),
      balanceAfter: playerBalance + amount,
      timestamp: new Date(),
      confirmedBy,
      notes,
    };

    this.transactions.push(transaction);
    return transaction;
  }

  getPlayerBalance(playerId: string): number {
    return this.transactions
      .filter((t) => t.playerId === playerId)
      .reduce((balance, t) => {
        if (t.type === 'buy_in' || t.type === 'adjustment') return balance + t.amount;
        if (t.type === 'cash_out') return balance - t.amount;
        return balance;
      }, 0);
  }

  getSessionSummary(playerUsernames: Map<string, string>): SessionPlayerResult[] {
    const playerIds = [...new Set(this.transactions.map((t) => t.playerId))];

    return playerIds.map((playerId) => {
      const playerTxns = this.transactions.filter((t) => t.playerId === playerId);

      const buyInTotal = playerTxns
        .filter((t) => t.type === 'buy_in')
        .reduce((sum, t) => sum + t.amount, 0);

      const cashOutTotal = playerTxns
        .filter((t) => t.type === 'cash_out')
        .reduce((sum, t) => sum + t.amount, 0);

      return {
        playerId,
        username: playerUsernames.get(playerId) ?? 'Unknown',
        buyInTotal,
        cashOutTotal,
        net: cashOutTotal - buyInTotal,
      };
    });
  }

  getSettlements(playerUsernames: Map<string, string>): Settlement[] {
    const summary = this.getSessionSummary(playerUsernames);
    return calculateSettlements(summary);
  }

  getPendingBuyIns(): BuyInRequest[] {
    return [...this.pendingBuyIns];
  }

  getTransactions(): Transaction[] {
    return [...this.transactions];
  }

  getSessionId(): string {
    return this.sessionId;
  }
}
