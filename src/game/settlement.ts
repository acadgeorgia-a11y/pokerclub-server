import type { Settlement, SessionPlayerResult } from '../shared/index.js';

/**
 * Calculate minimum number of payments to settle all debts.
 * Algorithm: match biggest debtor to biggest creditor, iterate until settled.
 */
export function calculateSettlements(players: SessionPlayerResult[]): Settlement[] {
  const settlements: Settlement[] = [];

  // Create mutable balances
  const balances = players.map((p) => ({
    playerId: p.playerId,
    net: p.net,
  }));

  // Separate into debtors (negative net) and creditors (positive net)
  const debtors = balances.filter((b) => b.net < 0).sort((a, b) => a.net - b.net); // most negative first
  const creditors = balances.filter((b) => b.net > 0).sort((a, b) => b.net - a.net); // most positive first

  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx]!;
    const creditor = creditors[cIdx]!;

    const amount = Math.min(Math.abs(debtor.net), creditor.net);

    if (amount > 0) {
      settlements.push({
        from: debtor.playerId,
        to: creditor.playerId,
        amount,
      });
    }

    debtor.net += amount;
    creditor.net -= amount;

    if (debtor.net === 0) dIdx++;
    if (creditor.net === 0) cIdx++;
  }

  return settlements;
}
