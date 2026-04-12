import type { GameType } from '../shared/index.js';

export interface MixedGameConfig {
  games: GameType[];
  rotateEvery: 'orbit' | number; // 'orbit' = every full rotation, or N hands
}

export class MixedGameManager {
  private config: MixedGameConfig;
  private currentIndex: number = 0;
  private handsSinceRotation: number = 0;
  private orbitCount: number = 0;
  private playerCount: number = 0;

  constructor(config: MixedGameConfig) {
    this.config = config;
  }

  getCurrentGame(): GameType {
    return this.config.games[this.currentIndex % this.config.games.length]!;
  }

  /** Call after each hand completes. Returns the new game type if rotation happened. */
  onHandComplete(dealerAdvanced: boolean): { rotated: boolean; newGame: GameType } {
    this.handsSinceRotation++;

    let shouldRotate = false;

    if (this.config.rotateEvery === 'orbit') {
      if (dealerAdvanced) {
        this.orbitCount++;
      }
      // Rotate after a full orbit (dealer goes around once)
      if (this.orbitCount >= this.playerCount && this.playerCount > 0) {
        shouldRotate = true;
        this.orbitCount = 0;
      }
    } else {
      if (this.handsSinceRotation >= this.config.rotateEvery) {
        shouldRotate = true;
      }
    }

    if (shouldRotate) {
      this.currentIndex++;
      this.handsSinceRotation = 0;
    }

    return {
      rotated: shouldRotate,
      newGame: this.getCurrentGame(),
    };
  }

  setPlayerCount(count: number): void {
    this.playerCount = count;
  }

  reset(): void {
    this.currentIndex = 0;
    this.handsSinceRotation = 0;
    this.orbitCount = 0;
  }
}
