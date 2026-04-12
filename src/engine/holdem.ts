import { GamePhase, type ActionType, type ValidAction, type Card, HandRank } from '../shared/index.js';
import { createShuffledDeck } from './deck.js';
import { evaluateHoldem, compareHands } from './hand-evaluator.js';
import { calculatePots, type PotResult } from './pot.js';
import type { GameConfig, GamePlayer, HandEvent, SeatInput } from './types.js';

export class HoldemGame {
  phase: GamePhase = GamePhase.WAITING;
  deck: Card[] = [];
  communityCards: Card[] = [];
  players: GamePlayer[] = [];
  pots: PotResult[] = [];
  dealerSeat: number = -1;
  actionOnIndex: number = -1; // index into this.players
  currentBet: number = 0;
  lastRaiseSize: number = 0;
  handNumber: number = 0;
  config: GameConfig;
  holeCardCount: number = 2; // 2 for Hold'em, override 4 for Omaha

  private eventListeners: ((event: HandEvent) => void)[] = [];
  private lastAggressorIndex: number = -1;

  constructor(config: GameConfig) {
    this.config = config;
  }

  onEvent(listener: (event: HandEvent) => void): void {
    this.eventListeners.push(listener);
  }

  private emit(event: HandEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  /**
   * Start a new hand with the given seated players.
   * dealerSeat is the seat index (not player index) of the dealer.
   */
  startHand(seats: SeatInput[], dealerSeat: number): void {
    this.handNumber++;
    this.phase = GamePhase.DEALING;
    this.communityCards = [];
    this.currentBet = 0;
    this.lastRaiseSize = this.config.bigBlind;
    this.lastAggressorIndex = -1;

    // Create players sorted by seat index
    this.players = seats
      .map((s) => ({
        id: s.id,
        seatIndex: s.seatIndex,
        stack: s.stack,
        holeCards: [],
        currentBet: 0,
        totalBet: 0,
        isFolded: false,
        isAllIn: false,
        hasActed: false,
        lastAction: undefined,
      }))
      .sort((a, b) => a.seatIndex - b.seatIndex);

    this.dealerSeat = dealerSeat;

    this.emit({ type: 'hand_started', handNumber: this.handNumber, dealerSeat });

    // Shuffle and deal
    this.deck = createShuffledDeck();
    this.dealHoleCards();

    // Post blinds
    this.postBlinds();

    // Set phase to preflop and determine first action
    this.phase = GamePhase.PREFLOP;
    this.emit({ type: 'phase_changed', phase: this.phase, communityCards: [] });

    this.setFirstAction();
  }

  private dealHoleCards(): void {
    // Deal one card at a time starting left of dealer
    const startIdx = this.getNextPlayerIndex(this.getPlayerIndexBySeat(this.dealerSeat));

    for (let round = 0; round < this.holeCardCount; round++) {
      let idx = startIdx;
      for (let i = 0; i < this.players.length; i++) {
        const card = this.deck.pop()!;
        this.players[idx]!.holeCards.push(card);
        idx = this.getNextPlayerIndex(idx);
      }
    }

    // Emit hole cards to each player privately
    for (const player of this.players) {
      this.emit({ type: 'hole_cards_dealt', playerId: player.id, cards: player.holeCards });
    }
  }

  private postBlinds(): void {
    const headsUp = this.players.length === 2;

    let sbIdx: number;
    let bbIdx: number;

    if (headsUp) {
      // Heads-up: dealer posts SB
      sbIdx = this.getPlayerIndexBySeat(this.dealerSeat);
      bbIdx = this.getNextPlayerIndex(sbIdx);
    } else {
      // Normal: SB is left of dealer, BB is left of SB
      sbIdx = this.getNextPlayerIndex(this.getPlayerIndexBySeat(this.dealerSeat));
      bbIdx = this.getNextPlayerIndex(sbIdx);
    }

    const sbPlayer = this.players[sbIdx]!;
    const bbPlayer = this.players[bbIdx]!;

    const sbAmount = Math.min(this.config.smallBlind, sbPlayer.stack);
    this.placeBet(sbIdx, sbAmount);

    const bbAmount = Math.min(this.config.bigBlind, bbPlayer.stack);
    this.placeBet(bbIdx, bbAmount);

    this.currentBet = bbAmount;
    this.lastRaiseSize = bbAmount;

    this.emit({
      type: 'blinds_posted',
      smallBlind: { playerId: sbPlayer.id, amount: sbAmount },
      bigBlind: { playerId: bbPlayer.id, amount: bbAmount },
    });
  }

  private setFirstAction(): void {
    const headsUp = this.players.length === 2;

    if (this.phase === GamePhase.PREFLOP) {
      // Preflop: action starts UTG (left of BB)
      let sbIdx: number;
      let bbIdx: number;

      if (headsUp) {
        sbIdx = this.getPlayerIndexBySeat(this.dealerSeat);
        bbIdx = this.getNextPlayerIndex(sbIdx);
        // Heads-up preflop: dealer/SB acts first
        this.actionOnIndex = sbIdx;
      } else {
        sbIdx = this.getNextPlayerIndex(this.getPlayerIndexBySeat(this.dealerSeat));
        bbIdx = this.getNextPlayerIndex(sbIdx);
        // UTG is left of BB
        this.actionOnIndex = this.getNextActivePlayerIndex(bbIdx);
      }
    } else {
      // Postflop: first active player left of dealer
      const dealerIdx = this.getPlayerIndexBySeat(this.dealerSeat);
      this.actionOnIndex = this.getNextActivePlayerIndex(dealerIdx);
    }

    // Reset hasActed for new round
    for (const p of this.players) {
      p.hasActed = false;
    }

    this.emitActionRequired();
  }

  private emitActionRequired(): void {
    // Check if only one player remains or all are all-in
    if (this.checkHandOver()) return;

    const player = this.players[this.actionOnIndex];
    if (!player) return;

    const validActions = this.getValidActions(player.id);
    this.emit({
      type: 'action_required',
      playerId: player.id,
      seatIndex: player.seatIndex,
      validActions,
    });
  }

  /** Get valid actions for a player. */
  getValidActions(playerId: string): ValidAction[] {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.isFolded || player.isAllIn) return [];

    const actions: ValidAction[] = [];
    const toCall = this.currentBet - player.currentBet;

    // Always can fold (if there's a bet to face)
    if (toCall > 0) {
      actions.push({ action: 'fold' });
    }

    // Check (no bet to call, or BB option preflop)
    if (toCall === 0) {
      actions.push({ action: 'check' });
    }

    // Call
    if (toCall > 0) {
      const callAmount = Math.min(toCall, player.stack);
      actions.push({ action: 'call', callAmount });
    }

    // Raise
    const minRaise = this.currentBet + Math.max(this.lastRaiseSize, this.config.bigBlind);
    const maxRaise = player.stack + player.currentBet; // total bet after raising all-in

    if (player.stack > toCall) {
      // Player has chips beyond what's needed to call
      if (minRaise <= maxRaise) {
        actions.push({
          action: 'raise',
          minAmount: Math.min(minRaise, maxRaise),
          maxAmount: maxRaise,
        });
      }
    }

    // All-in (always available if player has chips)
    if (player.stack > 0) {
      actions.push({ action: 'all_in' });
    }

    return actions;
  }

  /** Handle a player action. Returns true if action was valid. */
  handleAction(playerId: string, action: ActionType, amount?: number): boolean {
    const playerIdx = this.players.findIndex((p) => p.id === playerId);
    if (playerIdx === -1) return false;

    const player = this.players[playerIdx]!;

    // Must be this player's turn
    if (playerIdx !== this.actionOnIndex) return false;

    const validActions = this.getValidActions(playerId);
    const isValid = validActions.some((va) => va.action === action);
    if (!isValid) return false;

    switch (action) {
      case 'fold':
        this.handleFold(playerIdx);
        break;
      case 'check':
        this.handleCheck(playerIdx);
        break;
      case 'call':
        this.handleCall(playerIdx);
        break;
      case 'raise': {
        if (amount === undefined) return false;
        if (!this.handleRaise(playerIdx, amount)) return false;
        break;
      }
      case 'all_in':
        this.handleAllIn(playerIdx);
        break;
      default:
        return false;
    }

    player.hasActed = true;
    player.lastAction = action;

    // Emit action event
    const totalPot = this.calculateTotalPot();
    this.emit({
      type: 'player_acted',
      playerId: player.id,
      action,
      amount: player.currentBet,
      potTotal: totalPot,
    });

    // Advance the game
    this.advanceAction();
    return true;
  }

  private handleFold(playerIdx: number): void {
    this.players[playerIdx]!.isFolded = true;
  }

  private handleCheck(playerIdx: number): void {
    // No-op, just marks as acted
  }

  private handleCall(playerIdx: number): void {
    const player = this.players[playerIdx]!;
    const toCall = Math.min(this.currentBet - player.currentBet, player.stack);
    this.placeBet(playerIdx, toCall);
  }

  private handleRaise(playerIdx: number, totalRaiseAmount: number): boolean {
    const player = this.players[playerIdx]!;
    const raiseSize = totalRaiseAmount - this.currentBet;
    const minRaiseSize = Math.max(this.lastRaiseSize, this.config.bigBlind);

    // Validate raise amount (allow all-in for less)
    const additionalNeeded = totalRaiseAmount - player.currentBet;
    if (additionalNeeded > player.stack) return false;

    // If raise is less than minimum but not all-in, invalid
    if (raiseSize < minRaiseSize && additionalNeeded < player.stack) return false;

    const betAmount = totalRaiseAmount - player.currentBet;
    this.placeBet(playerIdx, betAmount);

    // Track raise size for min-raise calculation
    if (raiseSize >= minRaiseSize) {
      this.lastRaiseSize = raiseSize;
      this.lastAggressorIndex = playerIdx;
      // Reopen action for all other players
      for (let i = 0; i < this.players.length; i++) {
        if (i !== playerIdx && !this.players[i]!.isFolded && !this.players[i]!.isAllIn) {
          this.players[i]!.hasActed = false;
        }
      }
    }

    this.currentBet = totalRaiseAmount;
    return true;
  }

  private handleAllIn(playerIdx: number): void {
    const player = this.players[playerIdx]!;
    const allInAmount = player.stack;
    const totalBetAfter = player.currentBet + allInAmount;

    this.placeBet(playerIdx, allInAmount);

    // Check if this all-in constitutes a raise
    const raiseSize = totalBetAfter - this.currentBet;
    const minRaiseSize = Math.max(this.lastRaiseSize, this.config.bigBlind);

    if (totalBetAfter > this.currentBet) {
      if (raiseSize >= minRaiseSize) {
        // Full raise — reopens action
        this.lastRaiseSize = raiseSize;
        this.lastAggressorIndex = playerIdx;
        for (let i = 0; i < this.players.length; i++) {
          if (i !== playerIdx && !this.players[i]!.isFolded && !this.players[i]!.isAllIn) {
            this.players[i]!.hasActed = false;
          }
        }
      }
      // Short all-in: does NOT reopen action (hasActed stays true for others)
      this.currentBet = totalBetAfter;
    }
  }

  private placeBet(playerIdx: number, amount: number): void {
    const player = this.players[playerIdx]!;
    const actualAmount = Math.min(amount, player.stack);
    player.stack -= actualAmount;
    player.currentBet += actualAmount;
    player.totalBet += actualAmount;
    if (player.stack === 0) {
      player.isAllIn = true;
    }
  }

  private advanceAction(): void {
    // Check if hand is over (only one non-folded player)
    const activePlayers = this.players.filter((p) => !p.isFolded);
    if (activePlayers.length <= 1) {
      this.handleLastPlayerWins();
      return;
    }

    // Check if betting round is complete
    if (this.isRoundComplete()) {
      this.advancePhase();
      return;
    }

    // Move to next active player
    const nextIdx = this.getNextActivePlayerIndex(this.actionOnIndex);
    if (nextIdx === this.actionOnIndex) {
      // No one else to act
      this.advancePhase();
      return;
    }

    this.actionOnIndex = nextIdx;
    this.emitActionRequired();
  }

  private isRoundComplete(): boolean {
    const activePlayers = this.players.filter((p) => !p.isFolded && !p.isAllIn);

    // All active (non-all-in) players have acted
    if (!activePlayers.every((p) => p.hasActed)) return false;

    // All active players have matched the current bet
    if (!activePlayers.every((p) => p.currentBet === this.currentBet)) return false;

    return true;
  }

  private advancePhase(): void {
    // Reset for new street
    for (const p of this.players) {
      p.currentBet = 0;
      p.hasActed = false;
    }
    this.currentBet = 0;
    this.lastRaiseSize = this.config.bigBlind;

    // Update pots
    this.pots = calculatePots(
      this.players.map((p) => ({ id: p.id, totalBet: p.totalBet, isFolded: p.isFolded })),
    );
    const totalPot = this.pots.reduce((sum, p) => sum + p.amount, 0);
    this.emit({ type: 'pot_update', pots: this.pots, totalPot });

    // Check if all remaining players are all-in (or only 1 can act)
    const canAct = this.players.filter((p) => !p.isFolded && !p.isAllIn);
    const allIn = canAct.length <= 1;

    switch (this.phase) {
      case GamePhase.PREFLOP:
        this.phase = GamePhase.FLOP;
        this.dealCommunityCards(3);
        break;
      case GamePhase.FLOP:
        this.phase = GamePhase.TURN;
        this.dealCommunityCards(1);
        break;
      case GamePhase.TURN:
        this.phase = GamePhase.RIVER;
        this.dealCommunityCards(1);
        break;
      case GamePhase.RIVER:
        this.handleShowdown();
        return;
      default:
        return;
    }

    this.emit({ type: 'phase_changed', phase: this.phase, communityCards: this.communityCards });

    if (allIn) {
      // Skip to next phase if all players all-in
      this.advancePhase();
    } else {
      this.setFirstAction();
    }
  }

  private dealCommunityCards(count: number): void {
    // Burn one card
    this.deck.pop();
    // Deal cards
    for (let i = 0; i < count; i++) {
      this.communityCards.push(this.deck.pop()!);
    }
  }

  private handleLastPlayerWins(): void {
    // All but one player folded
    this.pots = calculatePots(
      this.players.map((p) => ({ id: p.id, totalBet: p.totalBet, isFolded: p.isFolded })),
    );

    const winner = this.players.find((p) => !p.isFolded)!;
    const totalPot = this.pots.reduce((sum, p) => sum + p.amount, 0);

    winner.stack += totalPot;

    this.emit({
      type: 'pot_awarded',
      potIndex: 0,
      amount: totalPot,
      winnerIds: [winner.id],
    });

    this.phase = GamePhase.SHOWDOWN;
    this.emit({ type: 'hand_complete' });
    this.phase = GamePhase.WAITING;
  }

  private handleShowdown(): void {
    this.phase = GamePhase.SHOWDOWN;

    // Calculate final pots
    this.pots = calculatePots(
      this.players.map((p) => ({ id: p.id, totalBet: p.totalBet, isFolded: p.isFolded })),
    );

    // Evaluate hands for all non-folded players
    const showdownResults = this.players
      .filter((p) => !p.isFolded)
      .map((p) => ({
        playerId: p.id,
        seatIndex: p.seatIndex,
        holeCards: p.holeCards,
        hand: this.evaluatePlayerHand(p),
      }));

    this.emit({ type: 'showdown', results: showdownResults });

    // Award each pot
    const playerHands = new Map(
      showdownResults.map((r) => [r.playerId, r.hand]),
    );

    for (let i = 0; i < this.pots.length; i++) {
      const pot = this.pots[i]!;
      const eligible = pot.eligiblePlayerIds.filter((id) => playerHands.has(id));

      if (eligible.length === 0) continue;

      // Find best hand among eligible
      let bestHand = playerHands.get(eligible[0]!)!;
      for (const id of eligible) {
        const hand = playerHands.get(id)!;
        if (compareHands(hand, bestHand) > 0) {
          bestHand = hand;
        }
      }

      const winners = eligible.filter(
        (id) => compareHands(playerHands.get(id)!, bestHand) === 0,
      );

      // Split the pot
      const splitAmount = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - splitAmount * winners.length;

      // Sort winners by seat position (clockwise from dealer) for odd chip
      const sortedWinners = [...winners].sort((a, b) => {
        const seatA = this.players.find((p) => p.id === a)!.seatIndex;
        const seatB = this.players.find((p) => p.id === b)!.seatIndex;
        const distA = (seatA - this.dealerSeat + this.config.maxPlayers) % this.config.maxPlayers;
        const distB = (seatB - this.dealerSeat + this.config.maxPlayers) % this.config.maxPlayers;
        return distA - distB;
      });

      for (let j = 0; j < sortedWinners.length; j++) {
        const winnerId = sortedWinners[j]!;
        const player = this.players.find((p) => p.id === winnerId)!;
        const winAmount = splitAmount + (j < remainder ? 1 : 0);
        player.stack += winAmount;
      }

      this.emit({
        type: 'pot_awarded',
        potIndex: i,
        amount: pot.amount,
        winnerIds: sortedWinners,
        handName: bestHand.name,
      });
    }

    this.emit({ type: 'hand_complete' });
    this.phase = GamePhase.WAITING;
  }

  protected evaluatePlayerHand(player: GamePlayer) {
    return evaluateHoldem(player.holeCards, this.communityCards);
  }

  private checkHandOver(): boolean {
    const activePlayers = this.players.filter((p) => !p.isFolded);
    if (activePlayers.length <= 1) {
      this.handleLastPlayerWins();
      return true;
    }
    return false;
  }

  // ─── Seat/player index helpers ────────────────────────────

  /** Find the player index for a given seat index. */
  private getPlayerIndexBySeat(seatIndex: number): number {
    const idx = this.players.findIndex((p) => p.seatIndex === seatIndex);
    if (idx === -1) {
      // Dealer seat might not have a player; find nearest clockwise
      return this.getNextPlayerIndexBySeat(seatIndex);
    }
    return idx;
  }

  /** Get the next player index (wrapping around). */
  private getNextPlayerIndex(fromIdx: number): number {
    return (fromIdx + 1) % this.players.length;
  }

  /** Get next player index by seat (searching clockwise). */
  private getNextPlayerIndexBySeat(seatIndex: number): number {
    for (let i = 1; i <= this.config.maxPlayers; i++) {
      const nextSeat = (seatIndex + i) % this.config.maxPlayers;
      const idx = this.players.findIndex((p) => p.seatIndex === nextSeat);
      if (idx !== -1) return idx;
    }
    return 0;
  }

  /** Get next active (non-folded, non-all-in) player index. */
  private getNextActivePlayerIndex(fromIdx: number): number {
    for (let i = 1; i <= this.players.length; i++) {
      const idx = (fromIdx + i) % this.players.length;
      const player = this.players[idx]!;
      if (!player.isFolded && !player.isAllIn) {
        return idx;
      }
    }
    return fromIdx; // No active player found
  }

  /** Get total pot from all player bets. */
  private calculateTotalPot(): number {
    return this.players.reduce((sum, p) => sum + p.totalBet, 0);
  }

  /** Get remaining community cards needed. */
  getRemainingDeck(): Card[] {
    return [...this.deck];
  }

  /** Get player by ID. */
  getPlayer(playerId: string): GamePlayer | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  /** Get current phase. */
  getPhase(): GamePhase {
    return this.phase;
  }
}
