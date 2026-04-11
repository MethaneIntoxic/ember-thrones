import { describe, expect, it } from "vitest";
import { budgetForTier, inferPerfTier, PerfBudgetMonitor } from "../../src/game/platform/perfBudget";

describe("perfBudget", () => {
  it("infers lower tier for narrow or low-memory devices", () => {
    expect(inferPerfTier(640, 4, 4)).toBe("mobile");
  });

  it("returns expected budget values", () => {
    expect(budgetForTier("ultra").targetFps).toBe(60);
    expect(budgetForTier("balanced").maxParticles).toBe(140);
    expect(budgetForTier("mobile").textureScale).toBeCloseTo(0.7);
  });

  it("collects frame data and reports snapshot metrics", () => {
    const monitor = new PerfBudgetMonitor("balanced", 10);

    monitor.markFrame(1000);
    monitor.markFrame(1020);
    monitor.markFrame(1040);
    monitor.markFrame(1064);

    const snapshot = monitor.snapshot();

    expect(snapshot.sampleCount).toBe(3);
    expect(snapshot.avgFps).toBeGreaterThan(40);
    expect(snapshot.worstFrameMs).toBe(24);
  });
});
