import { describe, expect, it } from "vitest";

import {
  advanceBonusSession,
  bonusPayloadSchema,
  bonusSessionActionRequestSchema,
  bonusSessionRecordSchema,
  buildBonusSessionSeed,
  claimBonusSession,
  normalizeTriggerFlags,
  resumeBonusSession,
  spinResultSchema,
  type BonusSessionRecord,
  type BonusSessionSeed,
  type BonusSessionStateMutation
} from "../src";
import { resolveEmberRespinCollectorLock } from "../src/domain/features/emberRespinCollectorLock";

const BASE_TIMESTAMP = "2026-04-17T00:00:00.000Z";

const SPIN_GRID = [
  ["dragon", "coin", "orb"],
  ["lantern", "ingot", "scatter"],
  ["wild", "dragon", "orb"],
  ["coin", "scatter", "lantern"],
  ["dragon", "ingot", "orb"]
] as const;

const JACKPOT_CONFIG = {
  resetAmounts: {
    mini: 5_000,
    minor: 25_000,
    major: 100_000,
    grand: 1_000_000
  },
  contributionShares: {
    mini: 0.4,
    minor: 0.3,
    major: 0.2,
    grand: 0.1
  },
  maxBetRequiredForGrand: true
} as const;

const ORB_TRIGGER_CONFIG = {
  minOrbs: 6,
  resetSpins: 3,
  boardCells: 15,
  grandRequiresFullBoard: true
} as const;

const SCATTER_TRIGGER_CONFIG = {
  minScatters: 3,
  baseAwardedGames: 10,
  extraGamesPerExtraScatter: 2,
  retriggerAward: 3
} as const;

function createFreeGamesOutcome() {
  return {
    type: "FREE_GAMES" as const,
    gameVariantId: "dragon-link-flagship",
    modifierId: "ROYALS_REMOVED" as const,
    initialGames: 10,
    totalAwardedGames: 12,
    retriggerCount: 1,
    steps: [
      {
        spinIndex: 1,
        lineWin: 40,
        awardedWin: 55,
        runningAward: 55,
        scatterCount: 3,
        retriggered: true,
        awardedExtraGames: 2,
        gamesRemainingAfter: 11,
        multiplier: 1
      },
      {
        spinIndex: 2,
        lineWin: 35,
        awardedWin: 45,
        runningAward: 100,
        scatterCount: 1,
        retriggered: false,
        awardedExtraGames: 0,
        gamesRemainingAfter: 10,
        multiplier: 1
      }
    ],
    finalAward: 100
  };
}

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
        emberRespinCollectorLock: true
      })
    ).toEqual({
      holdAndSpin: true,
      freeGames: false
    });
  });

  it("parses legacy trigger and bonus payload inputs into canonical spin results", () => {
    const holdAndSpin = resolveEmberRespinCollectorLock({
      seed: "hold-spin-result",
      bet: 30,
      initialLockedCells: [0, 1, 2, 3, 4, 5],
      gameVariantId: "dragon-link-flagship"
    });

    const parsed = spinResultSchema.parse({
      spinId: "spin-1",
      sessionId: "session-1",
      bet: 30,
      grid: SPIN_GRID,
      lineWins: [],
      scatterCount: 1,
      orbCount: 6,
      baseWin: 0,
      featureWin: holdAndSpin.finalAward,
      totalWin: holdAndSpin.finalAward,
      triggers: {
        emberLock: true,
        freeQuest: false
      },
      gameVariantId: "dragon-link-flagship",
      freeGamesModifierId: "ROYALS_REMOVED",
      jackpotConfig: JACKPOT_CONFIG,
      orbTriggerConfig: ORB_TRIGGER_CONFIG,
      scatterTriggerConfig: SCATTER_TRIGGER_CONFIG,
      holdAndSpinState: {
        active: true,
        lockedCount: 6,
        respinsRemaining: 3,
        filledPositions: [0, 1, 2, 3, 4, 5]
      },
      bonusSessionRef: {
        id: "bonus-1",
        type: "HOLD_AND_SPIN",
        status: "PENDING"
      },
      bonusPayload: {
        type: "EMBER_RESPIN",
        sessionId: "session-1",
        revealSeed: "reveal-1",
        gameVariantId: "dragon-link-flagship",
        freeGamesModifierId: "ROYALS_REMOVED",
        expectedTotalAward: holdAndSpin.finalAward,
        jackpotTiersHit: holdAndSpin.jackpotTierHits,
        jackpotAwards: [],
        jackpotConfig: JACKPOT_CONFIG,
        orbTriggerConfig: ORB_TRIGGER_CONFIG,
        scatterTriggerConfig: SCATTER_TRIGGER_CONFIG,
        precomputedOutcome: holdAndSpin
      }
    });

    expect(parsed.triggers.holdAndSpin).toBe(true);
    expect(parsed.triggers.freeGames).toBe(false);
    expect(parsed.bonusPayload?.type).toBe("HOLD_AND_SPIN");
  });

  it("rejects mismatched bonus payload types against deterministic outcomes", () => {
    const holdAndSpin = resolveEmberRespinCollectorLock({
      seed: "hold-mismatch",
      bet: 25,
      initialLockedCells: [0, 1, 2, 3, 4, 5],
      gameVariantId: "dragon-link-flagship"
    });

    expect(() =>
      bonusPayloadSchema.parse({
        type: "FREE_GAMES",
        sessionId: "session-2",
        revealSeed: "reveal-2",
        gameVariantId: "dragon-link-flagship",
        freeGamesModifierId: "ROYALS_REMOVED",
        expectedTotalAward: holdAndSpin.finalAward,
        jackpotTiersHit: holdAndSpin.jackpotTierHits,
        jackpotAwards: [],
        jackpotConfig: JACKPOT_CONFIG,
        orbTriggerConfig: ORB_TRIGGER_CONFIG,
        scatterTriggerConfig: SCATTER_TRIGGER_CONFIG,
        precomputedOutcome: holdAndSpin
      })
    ).toThrow(/does not match deterministic outcome type/);
  });

  it("accepts bonus action requests for deterministic progress steps", () => {
    expect(
      bonusSessionActionRequestSchema.parse({
        actionType: "FREE_GAME_SPIN",
        clientSelection: { reel: 3 }
      })
    ).toEqual({
      actionType: "FREE_GAME_SPIN",
      clientSelection: { reel: 3 }
    });
  });
});

describe("bonus session progression helpers", () => {
  it("builds, advances, and claims hold-and-spin sessions", () => {
    const outcome = resolveEmberRespinCollectorLock({
      seed: "hold-progress",
      bet: 20,
      initialLockedCells: [0, 1, 2, 3, 4, 5],
      gameVariantId: "dragon-link-flagship"
    });
    const record = createRecord(
      buildBonusSessionSeed({
        id: "bonus-hold-1",
        spinId: "spin-hold-1",
        sessionId: "session-hold-1",
        profileId: "profile-hold-1",
        revealSeed: "reveal-hold-1",
        expectedTotalAward: outcome.finalAward,
        jackpotAwards: [],
        outcome
      })
    );

    const finalRecord = completeAndClaim(record, "RESPIN");
    expect(finalRecord.progress.type).toBe("HOLD_AND_SPIN");
    expect(finalRecord.progress.claimed).toBe(true);
  });

  it("builds, advances, and claims free-games sessions", () => {
    const outcome = createFreeGamesOutcome();
    const record = createRecord(
      buildBonusSessionSeed({
        id: "bonus-free-1",
        spinId: "spin-free-1",
        sessionId: "session-free-1",
        profileId: "profile-free-1",
        revealSeed: "reveal-free-1",
        expectedTotalAward: outcome.finalAward,
        jackpotAwards: [],
        outcome
      })
    );

    const finalRecord = completeAndClaim(record, "FREE_GAME_SPIN");
    expect(finalRecord.progress.type).toBe("FREE_GAMES");
    expect(finalRecord.progress.claimed).toBe(true);
  });

  it("rejects mismatched bonus session record types and progress schemas", () => {
    const outcome = resolveEmberRespinCollectorLock({
      seed: "hold-record-mismatch",
      bet: 22,
      initialLockedCells: [0, 1, 2, 3, 4, 5],
      gameVariantId: "dragon-link-flagship"
    });
    const validRecord = createRecord(
      buildBonusSessionSeed({
        id: "bonus-hold-2",
        spinId: "spin-hold-2",
        sessionId: "session-hold-2",
        profileId: "profile-hold-2",
        revealSeed: "reveal-hold-2",
        expectedTotalAward: outcome.finalAward,
        jackpotAwards: [],
        outcome
      })
    );

    expect(() =>
      bonusSessionRecordSchema.parse({
        ...validRecord,
        type: "FREE_GAMES"
      })
    ).toThrow(/does not match outcome type/);
  });
});
