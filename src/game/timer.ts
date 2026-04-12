export class ActionTimer {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private startTime: number = 0;
  private duration: number = 0;
  private onTimeoutCallback: (() => void) | null = null;
  private isTimeBankActive: boolean = false;
  private timeBankRemaining: number = 0;

  start(
    duration: number,
    timeBank: number,
    onTimeout: () => void,
  ): void {
    this.stop();
    this.duration = duration * 1000;
    this.startTime = Date.now();
    this.onTimeoutCallback = onTimeout;
    this.isTimeBankActive = false;
    this.timeBankRemaining = timeBank * 1000;

    this.timerId = setTimeout(() => {
      if (this.timeBankRemaining > 0) {
        this.startTimeBank();
      } else {
        this.onTimeoutCallback?.();
      }
    }, this.duration);
  }

  private startTimeBank(): void {
    this.isTimeBankActive = true;
    this.startTime = Date.now();
    this.duration = this.timeBankRemaining;

    this.timerId = setTimeout(() => {
      this.timeBankRemaining = 0;
      this.onTimeoutCallback?.();
    }, this.timeBankRemaining);
  }

  stop(): { usedTimeBank: number } {
    let usedTimeBank = 0;

    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    if (this.isTimeBankActive) {
      const elapsed = Date.now() - this.startTime;
      usedTimeBank = elapsed;
      this.timeBankRemaining = Math.max(0, this.timeBankRemaining - elapsed);
    }

    return { usedTimeBank };
  }

  getTimeRemaining(): number {
    if (!this.timerId) return 0;
    const elapsed = Date.now() - this.startTime;
    return Math.max(0, this.duration - elapsed);
  }

  getTimeBankRemaining(): number {
    if (this.isTimeBankActive) {
      const elapsed = Date.now() - this.startTime;
      return Math.max(0, this.timeBankRemaining - elapsed);
    }
    return this.timeBankRemaining;
  }

  isActive(): boolean {
    return this.timerId !== null;
  }
}
