import type { Server, Socket } from 'socket.io';
import { TableManager } from '../game/table-manager.js';
import { Player } from '../game/player.js';
import {
  sitDownSchema,
  playerActionSchema,
  chatMessageSchema,
  chatReactionSchema,
  joinTableSchema,
  leaveTableSchema,
  standUpSchema,
  tableIdSchema,
} from './validators.js';
import { actionLimiter, chatLimiter } from './rate-limiter.js';
import type { TableSettings } from '../shared/index.js';

interface SocketData {
  playerId: string;
  username: string;
}

export function setupConnectionHandler(io: Server, tableManager: TableManager): void {
  io.on('connection', (socket: Socket) => {
    const { playerId, username } = socket.data as SocketData;
    console.log(`Player connected: ${username} (${playerId})`);

    // Send authenticated confirmation
    socket.emit('authenticated', { playerId, username });

    // ─── Lobby ──────────────────────────────────────────

    socket.on('join_lobby', () => {
      socket.join('lobby');
      socket.emit('lobby_state', { tables: tableManager.listTables() });
    });

    socket.on('create_table', (data: { name: string; settings: TableSettings }) => {
      const table = tableManager.createTable(data.name, playerId, data.settings);
      // Notify lobby
      io.to('lobby').emit('lobby_state', { tables: tableManager.listTables() });
      socket.emit('table_created', { tableId: table.id });
    });

    // ─── Table joining ──────────────────────────────────

    socket.on('join_table', (data: unknown) => {
      const parsed = joinTableSchema.safeParse(data);
      if (!parsed.success) return;

      const table = tableManager.getTable(parsed.data.tableId);
      if (!table) {
        socket.emit('action_error', { message: 'Table not found', validActions: [] });
        return;
      }

      socket.join(`table:${table.id}`);

      // Check if this is a reconnection
      const existingPlayer = table.seats.find((p) => p?.id === playerId);
      if (existingPlayer) {
        table.handleReconnect(playerId, socket.id);
      } else {
        socket.emit('table_joined', { tableState: table.getStateForPlayer(playerId) });
      }
    });

    socket.on('leave_table', (data: unknown) => {
      const parsed = leaveTableSchema.safeParse(data);
      if (!parsed.success) return;

      socket.leave(`table:${parsed.data.tableId}`);
      const table = tableManager.getTable(parsed.data.tableId);
      if (table) {
        table.removePlayer(playerId);
        io.to('lobby').emit('lobby_state', { tables: tableManager.listTables() });
      }
    });

    // ─── Seating ────────────────────────────────────────

    socket.on('sit_down', (data: unknown) => {
      const parsed = sitDownSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('action_error', { message: 'Invalid sit down data', validActions: [] });
        return;
      }

      const table = tableManager.getTable(parsed.data.tableId);
      if (!table) return;

      const player = new Player(
        playerId,
        username,
        socket.id,
        parsed.data.seat,
        parsed.data.buyIn,
        table.settings.timeBank,
      );

      const success = table.seatPlayer(player);
      if (!success) {
        socket.emit('action_error', { message: 'Seat unavailable or invalid buy-in', validActions: [] });
      }

      io.to('lobby').emit('lobby_state', { tables: tableManager.listTables() });
    });

    socket.on('stand_up', (data: unknown) => {
      const parsed = standUpSchema.safeParse(data);
      if (!parsed.success) return;

      const table = tableManager.getTable(parsed.data.tableId);
      if (table) {
        table.removePlayer(playerId);
        io.to('lobby').emit('lobby_state', { tables: tableManager.listTables() });
      }
    });

    // ─── Player Actions ─────────────────────────────────

    socket.on('player_action', (data: unknown) => {
      if (!actionLimiter.check(playerId)) {
        socket.emit('action_error', { message: 'Rate limited', validActions: [] });
        return;
      }

      const parsed = playerActionSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit('action_error', { message: 'Invalid action data', validActions: [] });
        return;
      }

      const table = tableManager.getTable(parsed.data.tableId);
      if (!table) return;

      table.handleAction(playerId, parsed.data.action, parsed.data.amount);
    });

    // ─── Chat ───────────────────────────────────────────

    socket.on('chat_message', (data: unknown) => {
      if (!chatLimiter.check(playerId)) return;

      const parsed = chatMessageSchema.safeParse(data);
      if (!parsed.success) return;

      io.to(`table:${parsed.data.tableId}`).emit('chat_message', {
        playerId,
        username,
        message: parsed.data.message,
        timestamp: Date.now(),
      });
    });

    socket.on('chat_reaction', (data: unknown) => {
      const parsed = chatReactionSchema.safeParse(data);
      if (!parsed.success) return;

      io.to(`table:${parsed.data.tableId}`).emit('chat_reaction', {
        playerId,
        emoji: parsed.data.emoji,
      });
    });

    // ─── Rabbit Hunting ──────────────────────────────────

    socket.on('rabbit_hunt', (data: unknown) => {
      const parsed = tableIdSchema.safeParse(data);
      if (!parsed.success) return;

      const table = tableManager.getTable(parsed.data.tableId);
      if (table) {
        table.handleRabbitHunt(playerId);
      }
    });

    // ─── Show/Muck ──────────────────────────────────────

    socket.on('show_hand', (data: unknown) => {
      const parsed = tableIdSchema.safeParse(data);
      if (!parsed.success) return;

      const table = tableManager.getTable(parsed.data.tableId);
      if (!table?.game) return;

      const enginePlayer = table.game.getPlayer(playerId);
      if (enginePlayer) {
        io.to(`table:${parsed.data.tableId}`).emit('player_showed', {
          playerId,
          seat: enginePlayer.seatIndex,
          cards: enginePlayer.holeCards,
          handName: '',
        });
      }
    });

    socket.on('muck_hand', (data: unknown) => {
      const parsed = tableIdSchema.safeParse(data);
      if (!parsed.success) return;

      const table = tableManager.getTable(parsed.data.tableId);
      const player = table?.seats.find((p) => p?.id === playerId);
      if (player) {
        io.to(`table:${parsed.data.tableId}`).emit('player_mucked', {
          playerId,
          seat: player.seatIndex,
        });
      }
    });

    // ─── Host Controls ──────────────────────────────────

    socket.on('pause_table', (data: unknown) => {
      const parsed = tableIdSchema.safeParse(data);
      if (!parsed.success) return;

      const table = tableManager.getTable(parsed.data.tableId);
      if (table && table.hostId === playerId) {
        table.status = 'paused';
        io.to(`table:${table.id}`).emit('table_paused', {});
      }
    });

    socket.on('resume_table', (data: unknown) => {
      const parsed = tableIdSchema.safeParse(data);
      if (!parsed.success) return;

      const table = tableManager.getTable(parsed.data.tableId);
      if (table && table.hostId === playerId) {
        table.status = 'waiting';
        io.to(`table:${table.id}`).emit('table_resumed', {});
        table.startNextHand();
      }
    });

    // ─── Disconnect ─────────────────────────────────────

    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${username} (${playerId})`);

      // Find any table the player is at
      const table = tableManager.findTableByPlayer(playerId);
      if (table) {
        table.handleDisconnect(playerId);
      }

      socket.leave('lobby');
    });
  });
}
