import { describe, expect, it } from "vitest";

import {
  bonusPayloadSchema,
  collectBonusSessionJackpotTiers,
  emberRespinCollectorLockSessionSchema,
  freeGamesSessionSchema,
  normalizeBonusType,
  toShortBonusType,
  volatilityProfileSchema
} from "../src/contracts/api";
import { resolveEmberRespinCollectorLock } from "../src/domain/features/emberRespinCollectorLock";

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

describe("deterministic bonus resolvers", () => {
  it("resolves hold-and-spin deterministically", () => {
    const input = {
      seed: "hold-seed-01",
      bet: 25,
      initialLockedCells: [0, 1, 2, 3, 4, 5],
      gameVariantId: "dragon-link-flagship"
    };

    const first = resolveEmberRespinCollectorLock(input);
    const second = resolveEmberRespinCollectorLock(input);

    expect(first).toEqual(second);
    expect(emberRespinCollectorLockSessionSchema.parse(first)).toEqual(first);
    expect(first.type).toBe("HOLD_AND_SPIN");
    expect(first.startingOrbs.length).toBeGreaterThanOrEqual(6);
    expect(first.steps.length).toBeGreaterThan(0);
    expect(first.finalAward).toBeGreaterThan(0);
  });

  it("accepts canonical free-games outcomes with variant modifiers", () => {
    const outcome = {
      type: "FREE_GAMES" as const,
      gameVariantId: "dragon-link-flagship",
      modifierId: "EXPANDING_WILD_REELS" as const,
      initialGames: 10,
      totalAwardedGames: 12,
      retriggerCount: 1,
      steps: [
        {
          spinIndex: 1,
          lineWin: 50,
          awardedWin: 80,
          runningAward: 80,
          scatterCount: 3,
          retriggered: true,
          awardedExtraGames: 2,
          gamesRemainingAfter: 11,
          expandedWildReels: [3]
        }
      ],
      finalAward: 240
    };

    expect(freeGamesSessionSchema.parse(outcome)).toEqual(outcome);
  });

  it("normalizes legacy bonus type names onto the canonical contract", () => {
    expect(normalizeBonusType("EMBER_RESPIN")).toBe("HOLD_AND_SPIN");
    expect(normalizeBonusType("EMBER_RESPIN_COLLECTOR_LOCK")).toBe("HOLD_AND_SPIN");
    expect(normalizeBonusType("FREE_SPINS")).toBe("FREE_GAMES");
    expect(normalizeBonusType("FREE_QUEST")).toBe("FREE_GAMES");

    expect(toShortBonusType("HOLD_AND_SPIN")).toBe("HOLD_AND_SPIN");
    expect(toShortBonusType("FREE_GAMES")).toBe("FREE_GAMES");
  });

  it("accepts legacy bonus payload names and canonicalizes on parse", () => {
    const session = resolveEmberRespinCollectorLock({
      seed: "hold-seed-02",
      bet: 30,
      initialLockedCells: [0, 1, 2, 3, 4, 5],
      gameVariantId: "dragon-link-flagship"
    });

    const payload = bonusPayloadSchema.parse({
      type: "EMBER_RESPIN",
      sessionId: "session-1",
      revealSeed: "reveal-1",
      gameVariantId: session.gameVariantId,
      freeGamesModifierId: "ROYALS_REMOVED",
      expectedTotalAward: session.finalAward,
      jackpotTiersHit: collectBonusSessionJackpotTiers(session),
      jackpotAwards: [],
      jackpotConfig: JACKPOT_CONFIG,
      orbTriggerConfig: ORB_TRIGGER_CONFIG,
      scatterTriggerConfig: SCATTER_TRIGGER_CONFIG,
      precomputedOutcome: session
    });

    expect(payload.type).toBe("HOLD_AND_SPIN");
    expect(payload.precomputedOutcome.type).toBe("HOLD_AND_SPIN");
  });

  it("accepts all configured volatility profiles", () => {
    expect(volatilityProfileSchema.parse("low")).toBe("low");
    expect(volatilityProfileSchema.parse("medium")).toBe("medium");
    expect(volatilityProfileSchema.parse("high")).toBe("high");
  });
});
