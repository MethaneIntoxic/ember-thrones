import { describe, expect, it } from "vitest";

import { runSpinSimulation } from "../src/domain/sim/simulator";

describe("long-run simulation thresholds", () => {
  it("keeps medium-profile cadence metrics in target bands", () => {
    const report = runSpinSimulation({
      spins: 200000,
      betPerSpin: 20,
      seed: 20260411,
      freeQuestStance: "relic"
    });

    expect(report.cadence.emberLockEverySpins.inRange).toBe(true);
    expect(report.cadence.freeQuestEverySpins.inRange).toBe(true);
    expect(report.cadence.retriggerChanceInFeature.inRange).toBe(true);

    expect(report.totals.rtp).toBeGreaterThan(0.75);
    expect(report.totals.rtp).toBeLessThan(0.9);

    expect(report.frequencies.anyWin).toBeGreaterThan(0.4);
    expect(report.frequencies.anyWin).toBeLessThan(0.9);
  });
});
