import type { Card } from '../shared/index.js';

/**
 * After a hand ends early (everyone folds before river),
 * reveal what community cards would have come.
 */
export function getRabbitCards(
  deck: Card[],
  existingCommunity: Card[],
): Card[] {
  const cardsNeeded = 5 - existingCommunity.length;
  if (cardsNeeded <= 0) return [];

  const deckCopy = [...deck];
  const cards: Card[] = [];

  for (let i = 0; i < cardsNeeded; i++) {
    deckCopy.pop(); // burn
    cards.push(deckCopy.pop()!);
  }

  return cards;
}
