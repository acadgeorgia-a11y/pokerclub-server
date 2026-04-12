import type { Card, HandResult } from './card.js';
import type { ActionType, GameType, ValidAction } from './game.js';
import type { FullTableState, Pot, PotAward, TableSettings } from './table.js';

// ─── Client → Server ───────────────────────────────────────

export interface ClientEvents {
  // Connection & Lobby
  authenticate: { token: string };
  join_lobby: Record<string, never>;
  join_table: { tableId: string };
  leave_table: { tableId: string };

  // Seating & Buy-In
  sit_down: { tableId: string; seat: number; buyIn: number };
  stand_up: { tableId: string };
  toggle_sit_out: { tableId: string };
  request_buy_in: { tableId: string; amount: number };

  // Player Actions
  player_action: { tableId: string; action: ActionType; amount?: number };

  // Special Features
  request_run_it: { tableId: string; times: 2 | 3 };
  accept_run_it: { tableId: string };
  decline_run_it: { tableId: string };
  peek_card: { tableId: string; cardIndex: number };
  rabbit_hunt: { tableId: string };
  show_hand: { tableId: string };
  muck_hand: { tableId: string };

  // Chat
  chat_message: { tableId: string; message: string };
  chat_reaction: { tableId: string; emoji: string };

  // Host Controls
  update_settings: { tableId: string; settings: Partial<TableSettings> };
  change_game_type: { tableId: string; gameType: GameType };
  pause_table: { tableId: string };
  resume_table: { tableId: string };
  end_session: { tableId: string };
  kick_player: { tableId: string; playerId: string };
}

// ─── Server → Client ───────────────────────────────────────

export interface ServerEvents {
  // Connection
  authenticated: { playerId: string; username: string };
  auth_error: { message: string };

  // Lobby
  lobby_state: { tables: LobbyTable[] };
  table_joined: { tableState: FullTableState };

  // Seating
  seat_assigned: { seat: number; playerId: string; username: string; stack: number };
  seat_vacated: { seat: number; playerId: string };
  buy_in_request: { playerId: string; username: string; amount: number; requestId: string };
  buy_in_approved: { playerId: string; amount: number; newStack: number };
  buy_in_denied: { playerId: string };

  // Hand Flow
  new_hand: { handNumber: number; gameType: GameType; dealer: number; blinds: { small: number; big: number } };
  your_hole_cards: { cards: Card[] };
  community_cards: { cards: Card[]; phase: 'flop' | 'turn' | 'river' };
  action_on: { playerId: string; seat: number; validActions: ValidAction[]; timeRemaining: number };
  player_acted: { playerId: string; seat: number; action: ActionType; amount?: number; potTotal: number };
  pot_update: { pots: Pot[]; totalPot: number };
  showdown: { players: ShowdownPlayer[]; pots: PotAward[] };
  hand_complete: { winners: WinnerInfo[]; handSummary: HandSummary };
  action_error: { message: string; validActions: ValidAction[] };

  // Special Features
  run_it_offered: { offeredBy: string; times: 2 | 3 };
  run_it_accepted: Record<string, never>;
  run_it_declined: Record<string, never>;
  run_it_board: { runNumber: number; cards: Card[]; result: PotAward[] };
  rabbit_cards: { cards: Card[] };
  equity_update: { players: EquityInfo[] };
  player_showed: { playerId: string; seat: number; cards: Card[]; handName: string };
  player_mucked: { playerId: string; seat: number };

  // Chat
  chat_message: { playerId: string; username: string; message: string; timestamp: number };
  chat_reaction: { playerId: string; emoji: string };

  // Host Controls
  settings_updated: { settings: Partial<TableSettings> };
  game_type_changed: { gameType: GameType };
  table_paused: Record<string, never>;
  table_resumed: Record<string, never>;
  session_ended: Record<string, never>;
  you_were_kicked: Record<string, never>;

  // Reconnection
  reconnect_state: { tableState: FullTableState; holeCards?: Card[] };

  // Notifications
  player_disconnected: { playerId: string; seat: number; graceSeconds: number };
  player_reconnected: { playerId: string; seat: number };
}

// ─── Supporting Types ───────────────────────────────────────

export interface LobbyTable {
  id: string;
  name: string;
  gameType: GameType;
  playerCount: number;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  status: string;
}

export interface ShowdownPlayer {
  playerId: string;
  seat: number;
  cards: Card[];
  hand: HandResult;
}

export interface WinnerInfo {
  playerId: string;
  seat: number;
  amount: number;
  handName: string;
  potIndex: number;
}

export interface HandSummary {
  handNumber: number;
  gameType: GameType;
  communityCards: Card[];
  pots: Pot[];
  winners: WinnerInfo[];
}

export interface EquityInfo {
  playerId: string;
  winPct: number;
  tiePct: number;
}
