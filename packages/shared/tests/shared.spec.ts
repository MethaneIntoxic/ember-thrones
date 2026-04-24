import { describe, expect, it } from "vitest";

import { initializeEmberLock, stepEmberLock } from "../src/domain/features/emberLock";
import { evaluatePaylines } from "../src/domain/payout";
import type { SpinGrid } from "../src/domain/reels";
import { runSpinSimulation } from "../src/domain/sim/simulator";

describe("payout evaluator", () => {
  it("pays a five-of-a-kind dragon line", () => {
    const forcedGrid = {
      columns: [
        ["dragon", "ten", "jack"],
        ["dragon", "jack", "queen"],
        ["dragon", "queen", "king"],
        ["dragon", "king", "ace"],
        ["dragon", "ace", "coin"]
      ],
      stops: [0, 0, 0, 0, 0]
    } as SpinGrid;

    const result = evaluatePaylines(forcedGrid, 20);

    expect(result.totalWin).toBeGreaterThan(100);
    expect(result.scatterCount).toBe(0);
    expect(result.lineWins.some((win) => win.symbol === "dragon" && win.count === 5)).toBe(true);
  });
});

describe("hold-and-spin state machine", () => {
  it("resets to 3 respins when new orbs land", () => {
    const initialOrbs = Array.from({ length: 6 }, (_, index) => ({
      position: index,
      coinValue: 2
    }));

    let state = initializeEmberLock(initialOrbs);

    expect(state.active).toBe(true);
    expect(state.respinsRemaining).toBe(3);
    expect(state.lockedOrbs).toHaveLength(6);

    state = stepEmberLock(state, []);
    expect(state.respinsRemaining).toBe(2);

    state = stepEmberLock(state, [{ position: 6, coinValue: 3 }]);
    expect(state.respinsRemaining).toBe(3);
    expect(state.lockedOrbs).toHaveLength(7);

    state = stepEmberLock(state, []);
    state = stepEmberLock(state, []);
    state = stepEmberLock(state, []);

    expect(state.active).toBe(false);
    expect(state.completed).toBe(true);
  });
});

describe("simulation", () => {
  it("tracks counters and cadence frequencies", () => {
    const report = runSpinSimulation({
      spins: 15000,
      betPerSpin: 20,
      seed: 20260411,
      freeGamesModifierId: "ROYALS_REMOVED"
    });

    expect(report.config.volatility).toBe("medium");
    expect(report.counters.spinsWithWin).toBeLessThanOrEqual(15000);
    expect(report.counters.holdAndSpinTriggers).toBeGreaterThan(0);
    expect(report.counters.freeGamesTriggers).toBeGreaterThan(0);
    expect(report.totals.rtp).toBeGreaterThan(0.7);
    expect(report.totals.rtp).toBeLessThan(0.9);

    expect(report.frequencies.holdAndSpinTrigger).toBeGreaterThan(1 / 120);
    expect(report.frequencies.holdAndSpinTrigger).toBeLessThan(1 / 35);
    expect(report.frequencies.freeGamesTrigger).toBeGreaterThan(1 / 200);
    expect(report.frequencies.freeGamesTrigger).toBeLessThan(1 / 50);
    expect(report.frequencies.freeGamesRetriggerInFeature).toBeGreaterThanOrEqual(0.1);
  });
});
