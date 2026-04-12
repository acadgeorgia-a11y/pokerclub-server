import type { Server } from 'socket.io';
import type { TableSettings } from '../shared/index.js';
import { Table } from './table.js';
import type { LobbyTable } from '../shared/index.js';

export class TableManager {
  private tables = new Map<string, Table>();
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  createTable(name: string, hostId: string, settings: TableSettings): Table {
    const table = new Table(this.io, name, hostId, settings);
    this.tables.set(table.id, table);
    return table;
  }

  getTable(id: string): Table | undefined {
    return this.tables.get(id);
  }

  removeTable(id: string): void {
    this.tables.delete(id);
  }

  listTables(): LobbyTable[] {
    return [...this.tables.values()].map((t) => ({
      id: t.id,
      name: t.name,
      gameType: t.settings.gameType,
      playerCount: t.getPlayerCount(),
      maxPlayers: t.settings.maxPlayers,
      smallBlind: t.settings.smallBlind,
      bigBlind: t.settings.bigBlind,
      status: t.status,
    }));
  }

  findTableByPlayer(playerId: string): Table | undefined {
    for (const table of this.tables.values()) {
      if (table.seats.some((p) => p?.id === playerId)) {
        return table;
      }
    }
    return undefined;
  }
}
