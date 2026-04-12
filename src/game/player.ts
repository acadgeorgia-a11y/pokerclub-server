export class Player {
  id: string;
  username: string;
  socketId: string;
  stack: number;
  buyInTotal: number;
  seatIndex: number;
  isSittingOut: boolean;
  isDisconnected: boolean;
  disconnectedAt: number | null;
  timeBank: number;

  constructor(
    id: string,
    username: string,
    socketId: string,
    seatIndex: number,
    stack: number,
    timeBank: number = 120,
  ) {
    this.id = id;
    this.username = username;
    this.socketId = socketId;
    this.seatIndex = seatIndex;
    this.stack = stack;
    this.buyInTotal = stack;
    this.isSittingOut = false;
    this.isDisconnected = false;
    this.disconnectedAt = null;
    this.timeBank = timeBank;
  }

  disconnect(): void {
    this.isDisconnected = true;
    this.disconnectedAt = Date.now();
  }

  reconnect(socketId: string): void {
    this.isDisconnected = false;
    this.disconnectedAt = null;
    this.socketId = socketId;
  }

  getGraceTimeRemaining(): number {
    if (!this.disconnectedAt) return 0;
    const elapsed = Date.now() - this.disconnectedAt;
    return Math.max(0, 60000 - elapsed);
  }

  isGraceExpired(): boolean {
    return this.isDisconnected && this.getGraceTimeRemaining() === 0;
  }
}
