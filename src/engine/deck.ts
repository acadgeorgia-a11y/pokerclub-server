import { randomBytes } from 'crypto';
import { RANKS, SUITS, type Card } from '../shared/index.js';

/**
 * Cryptographically secure random integer in [0, max).
 * Uses rejection sampling to eliminate modulo bias.
 */
export function cryptoRandom(max: number): number {
  if (max <= 0) throw new Error('max must be positive');
  if (max === 1) return 0;

  const byteCount = Math.ceil(Math.log2(max) / 8) || 1;
  const maxValid = Math.floor(256 ** byteCount / max) * max;

  let value: number;
  do {
    const bytes = randomBytes(byteCount);
    value = bytes.reduce((acc, byte, i) => acc + byte * (256 ** i), 0);
  } while (value >= maxValid);

  return value % max;
}

/** Create a standard 52-card deck (unshuffled). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(`${rank}${suit}` as Card);
    }
  }
  return deck;
}

/** Fisher-Yates shuffle using cryptographic randomness. */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = cryptoRandom(i + 1);
    [shuffled[i]!, shuffled[j]!] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

/** Create a fresh shuffled 52-card deck. */
export function createShuffledDeck(): Card[] {
  return shuffleDeck(createDeck());
}
