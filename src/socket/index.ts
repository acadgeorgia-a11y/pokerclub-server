import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { TableManager } from '../game/table-manager.js';
import { setupConnectionHandler } from './connection-handler.js';

export function createSocketServer(httpServer: HttpServer): { io: SocketServer; tableManager: TableManager } {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  // Auth middleware — for now, accept a simple playerId/username from handshake
  // In production, this would verify a Supabase JWT
  io.use((socket, next) => {
    const { playerId, username } = socket.handshake.auth as { playerId?: string; username?: string };
    if (!playerId || !username) {
      return next(new Error('Authentication required'));
    }
    socket.data.playerId = playerId;
    socket.data.username = username;
    next();
  });

  const tableManager = new TableManager(io);
  setupConnectionHandler(io, tableManager);

  return { io, tableManager };
}
