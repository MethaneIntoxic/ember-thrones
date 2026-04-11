export interface ReplayGuardOptions {
  ttlMs?: number;
  sweepIntervalMs?: number;
}

export class ReplayGuard {
  private readonly seen = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly timer: NodeJS.Timeout;

  public constructor(options: ReplayGuardOptions = {}) {
    this.ttlMs = options.ttlMs ?? 2 * 60 * 1000;
    const sweepIntervalMs = options.sweepIntervalMs ?? 30 * 1000;
    this.timer = setInterval(() => this.sweepExpired(), sweepIntervalMs);
    this.timer.unref();
  }

  public consume(nonceKey: string): boolean {
    this.sweepExpired();
    if (this.seen.has(nonceKey)) {
      return false;
    }

    this.seen.set(nonceKey, Date.now() + this.ttlMs);
    return true;
  }

  public dispose(): void {
    clearInterval(this.timer);
    this.seen.clear();
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [nonceKey, expiresAt] of this.seen.entries()) {
      if (expiresAt <= now) {
        this.seen.delete(nonceKey);
      }
    }
  }
}
