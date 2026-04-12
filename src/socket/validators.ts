import { z } from 'zod';

export const authenticateSchema = z.object({
  token: z.string().min(1),
});

export const joinTableSchema = z.object({
  tableId: z.string().uuid(),
});

export const leaveTableSchema = z.object({
  tableId: z.string().uuid(),
});

export const sitDownSchema = z.object({
  tableId: z.string().uuid(),
  seat: z.number().int().min(0).max(9),
  buyIn: z.number().int().positive(),
});

export const standUpSchema = z.object({
  tableId: z.string().uuid(),
});

export const toggleSitOutSchema = z.object({
  tableId: z.string().uuid(),
});

export const requestBuyInSchema = z.object({
  tableId: z.string().uuid(),
  amount: z.number().int().positive(),
});

export const playerActionSchema = z.object({
  tableId: z.string().uuid(),
  action: z.enum(['fold', 'check', 'call', 'raise', 'all_in']),
  amount: z.number().int().positive().optional(),
});

export const chatMessageSchema = z.object({
  tableId: z.string().uuid(),
  message: z.string().min(1).max(500),
});

export const chatReactionSchema = z.object({
  tableId: z.string().uuid(),
  emoji: z.string().min(1).max(10),
});

export const requestRunItSchema = z.object({
  tableId: z.string().uuid(),
  times: z.union([z.literal(2), z.literal(3)]),
});

export const tableIdSchema = z.object({
  tableId: z.string().uuid(),
});

export const kickPlayerSchema = z.object({
  tableId: z.string().uuid(),
  playerId: z.string().uuid(),
});

export const updateSettingsSchema = z.object({
  tableId: z.string().uuid(),
  settings: z.object({
    smallBlind: z.number().int().positive().optional(),
    bigBlind: z.number().int().positive().optional(),
    minBuyIn: z.number().int().positive().optional(),
    maxBuyIn: z.number().int().positive().optional(),
    maxPlayers: z.number().int().min(2).max(10).optional(),
    actionTime: z.number().int().min(5).max(300).optional(),
    timeBank: z.number().int().min(0).max(600).optional(),
    runItTwice: z.boolean().optional(),
    rabbitHunting: z.boolean().optional(),
  }),
});
