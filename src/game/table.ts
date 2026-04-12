import { randomUUID } from 'crypto';
import type { Server, Socket } from 'socket.io';
import type { Card, GameType, ActionType, FullTableState, SeatState } from '../shared/index.js';
import { GamePhase } from '../shared/index.js';
import { HoldemGame } from '../engine/holdem.js';
import { OmahaGame } from '../engine/omaha.js';
import { calculateEquity } from '../engine/equity.js';
import type { HandEvent, SeatInput } from '../engine/types.js';
import { Player } from './player.js';
import { ActionTimer } from './timer.js';
import { getRabbitCards } from './rabbit-hunt.js';
import type { TableSettings } from '../shared/index.js';

export class Table {
  id: string;
  name: string;
  hostId: string;
  settings: TableSettings;
  seats: (Player | null)[];
  game: HoldemGame | null = null;
  handNumber: number = 0;
  dealerSeatIndex: number = -1;
  status: 'waiting' | 'playing' | 'paused' = 'waiting';
  private io: Server;
  private timer: ActionTimer;
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastHandEndedEarly: boolean = false;
  private lastDeck: Card[] = [];
  private lastCommunity: Card[] = [];

  constructor(io: Server, name: string, hostId: string, settings: TableSettings) {
    this.id = randomUUID();
    this.name = name;
    this.hostId = hostId;
    this.settings = settings;
    this.seats = new Array(settings.maxPlayers).fill(null);
    this.io = io;
    this.timer = new ActionTimer();
  }

  // ─── Seating ──────────────────────────────────────────────

  seatPlayer(player: Player): boolean {
    if (this.seats[player.seatIndex] !== null) return false;
    if (player.stack < this.settings.minBuyIn || player.stack > this.settings.maxBuyIn) return false;

    this.seats[player.seatIndex] = player;
    this.broadcastToTable('seat_assigned', {
      seat: player.seatIndex,
      playerId: player.id,
      username: player.username,
      stack: player.stack,
    });

    // Auto-start if enough players
    this.checkAutoStart();
    return true;
  }

  removePlayer(playerId: string): void {
    const seatIdx = this.seats.findIndex((p) => p?.id === playerId);
    if (seatIdx === -1) return;

    this.seats[seatIdx] = null;
    this.broadcastToTable('seat_vacated', { seat: seatIdx, playerId });

    // Clear disconnect timer if any
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
  }

  // ─── Game flow ────────────────────────────────────────────

  private checkAutoStart(): void {
    const activePlayers = this.seats.filter(
      (p): p is Player => p !== null && !p.isSittingOut,
    );
    if (activePlayers.length >= 2 && this.status === 'waiting') {
      this.startNextHand();
    }
  }

  startNextHand(): void {
    const activePlayers = this.seats.filter(
      (p): p is Player => p !== null && !p.isSittingOut && p.stack > 0,
    );
    if (activePlayers.length < 2) {
      this.status = 'waiting';
      return;
    }

    this.status = 'playing';
    this.handNumber++;
    this.advanceDealer(activePlayers);

    // Create engine based on game type
    const engineConfig = {
      smallBlind: this.settings.smallBlind,
      bigBlind: this.settings.bigBlind,
      maxPlayers: this.settings.maxPlayers,
    };
    this.game = this.settings.gameType === 'omaha'
      ? new OmahaGame(engineConfig)
      : new HoldemGame(engineConfig);

    // Wire up engine events to socket broadcasts
    this.game.onEvent((event) => this.handleEngineEvent(event));

    // Build seat inputs
    const seatInputs: SeatInput[] = activePlayers.map((p) => ({
      id: p.id,
      seatIndex: p.seatIndex,
      stack: p.stack,
    }));

    this.game.startHand(seatInputs, this.dealerSeatIndex);
  }

  private advanceDealer(activePlayers: Player[]): void {
    const activeSeats = activePlayers.map((p) => p.seatIndex).sort((a, b) => a - b);

    if (this.dealerSeatIndex === -1) {
      // First hand — pick a random starting dealer
      this.dealerSeatIndex = activeSeats[0]!;
      return;
    }

    // Find next active seat clockwise
    for (let i = 1; i <= this.settings.maxPlayers; i++) {
      const nextSeat = (this.dealerSeatIndex + i) % this.settings.maxPlayers;
      if (activeSeats.includes(nextSeat)) {
        this.dealerSeatIndex = nextSeat;
        return;
      }
    }
  }

  handleAction(playerId: string, action: ActionType, amount?: number): boolean {
    if (!this.game) return false;

    const success = this.game.handleAction(playerId, action, amount);
    if (!success) {
      const player = this.findPlayerById(playerId);
      if (player) {
        const validActions = this.game.getValidActions(playerId);
        this.emitToPlayer(player.socketId, 'action_error', {
          message: 'Invalid action',
          validActions,
        });
      }
    }
    return success;
  }

  private handleEngineEvent(event: HandEvent): void {
    switch (event.type) {
      case 'hand_started':
        this.broadcastToTable('new_hand', {
          handNumber: event.handNumber,
          gameType: this.settings.gameType,
          dealer: event.dealerSeat,
          blinds: { small: this.settings.smallBlind, big: this.settings.bigBlind },
        });
        break;

      case 'hole_cards_dealt': {
        // PRIVATE — only send to the specific player
        const player = this.findPlayerById(event.playerId);
        if (player) {
          this.emitToPlayer(player.socketId, 'your_hole_cards', { cards: event.cards });
        }
        break;
      }

      case 'phase_changed':
        if (event.communityCards.length > 0) {
          const phase = event.phase === GamePhase.FLOP ? 'flop'
            : event.phase === GamePhase.TURN ? 'turn'
            : 'river';
          this.broadcastToTable('community_cards', {
            cards: event.communityCards,
            phase,
          });
        }
        break;

      case 'action_required': {
        this.broadcastToTable('action_on', {
          playerId: event.playerId,
          seat: event.seatIndex,
          validActions: event.validActions,
          timeRemaining: this.settings.actionTime,
        });

        // Start action timer
        this.timer.stop();
        this.timer.start(
          this.settings.actionTime,
          this.findPlayerById(event.playerId)?.timeBank ?? 0,
          () => this.handleTimeout(event.playerId),
        );
        break;
      }

      case 'player_acted': {
        this.timer.stop();

        // Update player stack in seat
        const seatPlayer = this.findPlayerById(event.playerId);
        if (seatPlayer && this.game) {
          const enginePlayer = this.game.getPlayer(event.playerId);
          if (enginePlayer) {
            seatPlayer.stack = enginePlayer.stack;
          }
        }

        this.broadcastToTable('player_acted', {
          playerId: event.playerId,
          seat: this.findPlayerById(event.playerId)?.seatIndex ?? 0,
          action: event.action,
          amount: event.amount,
          potTotal: event.potTotal,
        });
        break;
      }

      case 'pot_update':
        this.broadcastToTable('pot_update', {
          pots: event.pots.map((p) => ({ amount: p.amount, eligiblePlayerIds: p.eligiblePlayerIds })),
          totalPot: event.totalPot,
        });
        break;

      case 'showdown':
        this.broadcastToTable('showdown', {
          players: event.results.map((r) => ({
            playerId: r.playerId,
            seat: r.seatIndex,
            cards: r.holeCards,
            hand: r.hand,
          })),
          pots: [],
        });
        break;

      case 'pot_awarded':
        // Broadcast as part of hand_complete
        break;

      case 'hand_complete': {
        this.timer.stop();

        // Track if hand ended early (for rabbit hunting)
        this.lastHandEndedEarly = (this.game?.communityCards.length ?? 0) < 5;
        this.lastDeck = this.game?.getRemainingDeck() ?? [];
        this.lastCommunity = this.game?.communityCards ?? [];

        // Sync stacks from engine back to seated players
        if (this.game) {
          for (const enginePlayer of this.game.players) {
            const seated = this.findPlayerById(enginePlayer.id);
            if (seated) {
              seated.stack = enginePlayer.stack;
            }
          }
        }

        this.broadcastToTable('hand_complete', {
          winners: [],
          handSummary: {
            handNumber: this.handNumber,
            gameType: this.settings.gameType,
            communityCards: this.game?.communityCards ?? [],
            pots: this.game?.pots.map((p) => ({ amount: p.amount, eligiblePlayerIds: p.eligiblePlayerIds })) ?? [],
            winners: [],
          },
        });

        // Start next hand after a delay
        setTimeout(() => {
          if (this.status === 'playing') {
            this.startNextHand();
          }
        }, 2000);
        break;
      }
    }
  }

  private handleTimeout(playerId: string): void {
    if (!this.game) return;
    const validActions = this.game.getValidActions(playerId);
    // Auto-check if possible, else auto-fold
    const canCheck = validActions.some((a) => a.action === 'check');
    if (canCheck) {
      this.game.handleAction(playerId, 'check');
    } else {
      this.game.handleAction(playerId, 'fold');
    }
  }

  // ─── Disconnection ───────────────────────────────────────

  handleDisconnect(playerId: string): void {
    const player = this.findPlayerById(playerId);
    if (!player) return;

    player.disconnect();
    this.broadcastToTable('player_disconnected', {
      playerId,
      seat: player.seatIndex,
      graceSeconds: 60,
    });

    // Start 60-second grace period
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(playerId);
      // Auto-fold if in hand
      if (this.game) {
        const enginePlayer = this.game.getPlayer(playerId);
        if (enginePlayer && !enginePlayer.isFolded && !enginePlayer.isAllIn) {
          this.game.handleAction(playerId, 'fold');
        }
      }
      player.isSittingOut = true;
    }, 60000);

    this.disconnectTimers.set(playerId, timer);
  }

  handleReconnect(playerId: string, socketId: string): void {
    const player = this.findPlayerById(playerId);
    if (!player) return;

    player.reconnect(socketId);

    // Clear disconnect timer
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }

    this.broadcastToTable('player_reconnected', { playerId, seat: player.seatIndex });

    // Send full state + hole cards to reconnected player
    const state = this.getStateForPlayer(playerId);
    const holeCards = this.game?.getPlayer(playerId)?.holeCards;
    this.emitToPlayer(socketId, 'reconnect_state', {
      tableState: state,
      holeCards,
    });
  }

  // ─── State helpers ────────────────────────────────────────

  getStateForPlayer(playerId: string): FullTableState {
    return {
      tableId: this.id,
      tableName: this.name,
      gameType: this.settings.gameType,
      phase: this.game?.phase ?? GamePhase.WAITING,
      handNumber: this.handNumber,
      dealerSeat: this.dealerSeatIndex,
      communityCards: this.game?.communityCards ?? [],
      pots: this.game?.pots.map((p) => ({ amount: p.amount, eligiblePlayerIds: p.eligiblePlayerIds })) ?? [],
      totalPot: this.game?.pots.reduce((sum, p) => sum + p.amount, 0) ?? 0,
      currentBet: this.game?.currentBet ?? 0,
      seats: this.seats.map((p) => p ? this.toSeatState(p) : null),
      actionOn: this.game?.actionOnIndex !== undefined && this.game.actionOnIndex >= 0
        ? this.game.players[this.game.actionOnIndex]?.seatIndex ?? null
        : null,
      settings: this.settings,
    };
  }

  private toSeatState(player: Player): SeatState {
    const enginePlayer = this.game?.getPlayer(player.id);
    return {
      playerId: player.id,
      username: player.username,
      stack: player.stack,
      currentBet: enginePlayer?.currentBet ?? 0,
      buyInTotal: player.buyInTotal,
      isFolded: enginePlayer?.isFolded ?? false,
      isAllIn: enginePlayer?.isAllIn ?? false,
      isSittingOut: player.isSittingOut,
      isDisconnected: player.isDisconnected,
      lastAction: enginePlayer?.lastAction,
    };
  }

  private findPlayerById(playerId: string): Player | null {
    return this.seats.find((p) => p?.id === playerId) ?? null;
  }

  // ─── Socket helpers ───────────────────────────────────────

  private broadcastToTable(event: string, data: unknown): void {
    this.io.to(`table:${this.id}`).emit(event, data);
  }

  private emitToPlayer(socketId: string, event: string, data: unknown): void {
    this.io.to(socketId).emit(event, data);
  }

  // ─── Rabbit Hunting ────────────────────────────────────

  handleRabbitHunt(playerId: string): void {
    if (!this.settings.rabbitHunting || !this.lastHandEndedEarly) return;

    const cards = getRabbitCards(this.lastDeck, this.lastCommunity);
    if (cards.length > 0) {
      this.broadcastToTable('rabbit_cards', { cards });
    }
    this.lastHandEndedEarly = false;
  }

  // ─── Equity Calculation ───────────────────────────────

  emitEquity(): void {
    if (!this.game) return;

    const allInPlayers = this.game.players.filter((p) => !p.isFolded);
    const canActCount = allInPlayers.filter((p) => !p.isAllIn).length;

    // Only show equity when all remaining players are all-in (or max 1 can act)
    if (canActCount > 1) return;
    if (allInPlayers.length < 2) return;

    const playersData = allInPlayers.map((p) => ({
      id: p.id,
      holeCards: p.holeCards,
    }));
    const community = this.game.communityCards;
    const usedCards = new Set([
      ...community,
      ...allInPlayers.flatMap((p) => p.holeCards),
    ]);
    const remainingDeck = this.game.getRemainingDeck().filter(
      (c) => !usedCards.has(c),
    );

    // Run Monte Carlo asynchronously to not block
    const results = calculateEquity(playersData, community, remainingDeck, 5000);
    this.broadcastToTable('equity_update', { players: results });
  }

  getPlayerCount(): number {
    return this.seats.filter((p) => p !== null).length;
  }
}
