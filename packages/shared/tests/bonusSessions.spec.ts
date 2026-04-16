import { describe, expect, it } from "vitest";

import {
  bonusPayloadSchema,
  bonusSessionActionRequestSchema,
  bonusSessionRecordSchema,
  normalizeTriggerFlags,
  spinResultSchema,
  type BonusSessionRecord
} from "../src";
import {
  advanceBonusSession,
  buildBonusSessionSeed,
  claimBonusSession,
  resumeBonusSession,
  type BonusSessionSeed,
  type BonusSessionStateMutation
} from "../src";
import { resolveCelestialWheelAscension } from "../src/domain/features/celestialWheelAscension";
import { resolveEmberRespinCollectorLock } from "../src/domain/features/emberRespinCollectorLock";
import { resolveRelicVaultPick } from "../src/domain/features/relicVaultPick";

const BASE_TIMESTAMP = "2026-04-17T00:00:00.000Z";

const SPIN_GRID = [
  ["ember", "flame", "scale"],
  ["relic", "mythic", "throne"],
  ["wild", "orb", "scatter"],
  ["ember", "flame", "scale"],
  ["relic", "mythic", "throne"]
] as const;

function createRecord(seed: BonusSessionSeed): BonusSessionRecord {
  return {
    ...seed,
    createdAt: BASE_TIMESTAMP,
    updatedAt: BASE_TIMESTAMP,
    completedAt: null,
    claimedAt: null
  };
}

function advanceTimestamp(timestamp: string): string {
  return new Date(Date.parse(timestamp) + 1000).toISOString();
}

function applyMutation(
  record: BonusSessionRecord,
  mutation: BonusSessionStateMutation
): BonusSessionRecord {
  const updatedAt = advanceTimestamp(record.updatedAt);
  const completedStatus = mutation.status === "COMPLETED" || mutation.status === "CLAIMED";

  return {
    ...record,
    status: mutation.status,
    actualAward: mutation.actualAward,
    progress: mutation.progress,
    updatedAt,
    completedAt: completedStatus ? record.completedAt ?? updatedAt : record.completedAt,
    claimedAt: mutation.status === "CLAIMED" ? record.claimedAt ?? updatedAt : record.claimedAt
  };
}

function completeAndClaim(
  record: BonusSessionRecord,
  actionType: Exclude<BonusSessionRecord["progress"]["nextAction"], null | "CLAIM">
): BonusSessionRecord {
  let current = applyMutation(record, resumeBonusSession(record));

  while (current.progress.nextAction === actionType) {
    current = applyMutation(current, advanceBonusSession(current, actionType));
  }

  expect(current.status).toBe("COMPLETED");
  expect(current.actualAward).toBe(current.expectedTotalAward);
  expect(bonusSessionRecordSchema.parse(current)).toEqual(current);

  current = applyMutation(current, claimBonusSession(current));
  expect(current.status).toBe("CLAIMED");
  expect(current.progress.nextAction).toBeNull();
  expect(current.claimedAt).not.toBeNull();
  expect(bonusSessionRecordSchema.parse(current)).toEqual(current);

  return current;
}

describe("bonus session contracts", () => {
  it("normalizes legacy trigger flags onto the canonical transport contract", () => {
    expect(
      normalizeTriggerFlags({
        emberLock: true,
        freeQuest: false,
        emberRespinCollectorLock: true,
        celestialWheelAscension: true,
        relicVaultPick: false
      })
    ).toEqual({
      emberLock: true,
      freeQuest: false,
      emberRespin: true,
      wheelAscension: true,
      relicVaultPick: false
    });
  });

  it("parses legacy trigger and bonus payload inputs into canonical spin results", () => {
    const wheel = resolveCelestialWheelAscension({
      seed: "wheel-spin-result",
      bet: 30
    });

    const parsed = spinResultSchema.parse({
      spinId: "spin-1",
      sessionId: "session-1",
      bet: 30,
      grid: SPIN_GRID,
      lineWins: [],
      scatterCount: 3,
      orbCount: 0,
      baseWin: 0,
      featureWin: wheel.finalAward,
      totalWin: wheel.finalAward,
      triggers: {
        emberLock: false,
        freeQuest: false,
        celestialWheelAscension: true
      },
      bonusSessionRef: {
        id: "bonus-1",
        type: "WHEEL_ASCENSION",
        status: "PENDING"
      },
      bonusPayload: {
        type: "CELESTIAL_WHEEL_ASCENSION",
        sessionId: "session-1",
        revealSeed: "reveal-1",
        expectedTotalAward: wheel.finalAward,
        jackpotTiersHit: wheel.jackpotTierHits,
        jackpotAwards: [],
        precomputedOutcome: wheel
      }
    });

    expect(parsed.triggers.wheelAscension).toBe(true);
    expect(Object.hasOwn(parsed.triggers, "celestialWheelAscension")).toBe(false);
    expect(parsed.bonusPayload?.type).toBe("WHEEL_ASCENSION");
  });

  it("rejects mismatched bonus payload types against deterministic outcomes", () => {
    const wheel = resolveCelestialWheelAscension({
      seed: "wheel-mismatch",
      bet: 25
    });

    expect(() =>
      bonusPayloadSchema.parse({
        type: "EMBER_RESPIN",
        sessionId: "session-2",
        revealSeed: "reveal-2",
        expectedTotalAward: wheel.finalAward,
        jackpotTiersHit: wheel.jackpotTierHits,
        jackpotAwards: [],
        precomputedOutcome: wheel
      })
    ).toThrow(/does not match deterministic outcome/);
  });

  it("accepts bonus action requests for deterministic progress steps", () => {
    expect(
      bonusSessionActionRequestSchema.parse({
        actionType: "PICK",
        clientSelection: { slotId: "slot-3" }
      })
    ).toEqual({
      actionType: "PICK",
      clientSelection: { slotId: "slot-3" }
    });
  });
});

describe("bonus session progression helpers", () => {
  it("builds, advances, and claims ember respin sessions", () => {
    const outcome = resolveEmberRespinCollectorLock({
      seed: "ember-progress",
      bet: 20,
      initialLockedCells: [0, 1, 2, 3, 4, 5]
    });
    const record = createRecord(
      buildBonusSessionSeed({
        id: "bonus-ember-1",
        spinId: "spin-ember-1",
        sessionId: "session-ember-1",
        profileId: "profile-ember-1",
        revealSeed: "reveal-ember-1",
        expectedTotalAward: outcome.finalAward,
        jackpotAwards: [],
        outcome
      })
    );

    expect(record.status).toBe("PENDING");

    const finalRecord = completeAndClaim(record, "RESPIN");
    expect(finalRecord.progress.type).toBe("EMBER_RESPIN");
    expect(finalRecord.progress.claimed).toBe(true);
  });

  it("builds, advances, and claims wheel ascension sessions", () => {
    const outcome = resolveCelestialWheelAscension({
      seed: "wheel-progress",
      bet: 35
    });
    const record = createRecord(
      buildBonusSessionSeed({
        id: "bonus-wheel-1",
        spinId: "spin-wheel-1",
        sessionId: "session-wheel-1",
        profileId: "profile-wheel-1",
        revealSeed: "reveal-wheel-1",
        expectedTotalAward: outcome.finalAward,
        jackpotAwards: [],
        outcome
      })
    );

    const finalRecord = completeAndClaim(record, "WHEEL_STOP");
    expect(finalRecord.progress.type).toBe("WHEEL_ASCENSION");
    expect(finalRecord.progress.claimed).toBe(true);
  });

  it("builds, advances, and claims relic vault sessions", () => {
    const outcome = resolveRelicVaultPick({
      seed: "vault-progress",
      bet: 18,
      keyCount: 4
    });
    const record = createRecord(
      buildBonusSessionSeed({
        id: "bonus-vault-1",
        spinId: "spin-vault-1",
        sessionId: "session-vault-1",
        profileId: "profile-vault-1",
        revealSeed: "reveal-vault-1",
        expectedTotalAward: outcome.finalAward,
        jackpotAwards: [],
        outcome
      })
    );

    const finalRecord = completeAndClaim(record, "PICK");
    expect(finalRecord.progress.type).toBe("RELIC_VAULT_PICK");
    expect(finalRecord.progress.claimed).toBe(true);
  });

  it("rejects mismatched bonus session record types and progress schemas", () => {
    const outcome = resolveCelestialWheelAscension({
      seed: "wheel-record-mismatch",
      bet: 22
    });
    const validRecord = createRecord(
      buildBonusSessionSeed({
        id: "bonus-wheel-2",
        spinId: "spin-wheel-2",
        sessionId: "session-wheel-2",
        profileId: "profile-wheel-2",
        revealSeed: "reveal-wheel-2",
        expectedTotalAward: outcome.finalAward,
        jackpotAwards: [],
        outcome
      })
    );

    expect(() =>
      bonusSessionRecordSchema.parse({
        ...validRecord,
        type: "EMBER_RESPIN"
      })
    ).toThrow(/does not match outcome type/);
  });
});