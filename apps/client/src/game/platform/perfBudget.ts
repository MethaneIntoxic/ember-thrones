export type PerfTier = "ultra" | "balanced" | "mobile";

export interface PerfSnapshot {
  avgFps: number;
  worstFrameMs: number;
  overBudgetFrames: number;
  sampleCount: number;
  tier: PerfTier;
}

export interface PerfBudget {
  targetFps: number;
  maxParticles: number;
  textureScale: number;
}

export function inferPerfTier(
  viewportWidth: number,
  deviceMemory = 4,
  hardwareConcurrency = 4
): PerfTier {
  if (viewportWidth < 700 || deviceMemory <= 4 || hardwareConcurrency <= 4) {
    return "mobile";
  }

  if (viewportWidth < 1200 || deviceMemory <= 8 || hardwareConcurrency <= 8) {
    return "balanced";
  }

  return "ultra";
}

export function budgetForTier(tier: PerfTier): PerfBudget {
  if (tier === "ultra") {
    return { targetFps: 60, maxParticles: 220, textureScale: 1 };
  }

  if (tier === "balanced") {
    return { targetFps: 45, maxParticles: 140, textureScale: 0.85 };
  }

  return { targetFps: 30, maxParticles: 90, textureScale: 0.7 };
}

export class PerfBudgetMonitor {
  private frameDurations: number[] = [];

  private lastTimestamp = 0;

  private readonly maxSamples: number;

  private readonly frameBudgetMs: number;

  private tier: PerfTier;

  public constructor(tier: PerfTier, maxSamples = 180) {
    this.tier = tier;
    this.maxSamples = maxSamples;
    this.frameBudgetMs = 1000 / budgetForTier(tier).targetFps;
  }

  public setTier(tier: PerfTier): void {
    this.tier = tier;
  }

  public markFrame(timestamp: number): void {
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
      return;
    }

    const delta = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    this.frameDurations.push(delta);
    if (this.frameDurations.length > this.maxSamples) {
      this.frameDurations.shift();
    }
  }

  public snapshot(): PerfSnapshot {
    if (this.frameDurations.length === 0) {
      return {
        avgFps: 0,
        worstFrameMs: 0,
        overBudgetFrames: 0,
        sampleCount: 0,
        tier: this.tier
      };
    }

    const totalDuration = this.frameDurations.reduce((acc, value) => acc + value, 0);
    const avgFrameMs = totalDuration / this.frameDurations.length;
    const worstFrameMs = Math.max(...this.frameDurations);
    const overBudgetFrames = this.frameDurations.filter((value) => value > this.frameBudgetMs).length;

    return {
      avgFps: avgFrameMs === 0 ? 0 : 1000 / avgFrameMs,
      worstFrameMs,
      overBudgetFrames,
      sampleCount: this.frameDurations.length,
      tier: this.tier
    };
  }
}
