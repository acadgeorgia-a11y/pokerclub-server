import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { createSocketServer } from './socket/index.js';

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

// Socket.IO setup
const { io, tableManager } = createSocketServer(httpServer);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Table list (REST fallback for lobby)
app.get('/api/tables', (_req, res) => {
  res.json(tableManager.listTables());
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Poker Club server running on port ${PORT}`);
});
