import { describe, expect, it } from "vitest";

import {
  bonusPayloadSchema,
  celestialWheelAscensionSessionSchema,
  collectBonusSessionJackpotTiers,
  emberRespinCollectorLockSessionSchema,
  normalizeBonusType,
  relicVaultPickSessionSchema,
  toShortBonusType
} from "../src/contracts/api";
import { resolveCelestialWheelAscension } from "../src/domain/features/celestialWheelAscension";
import { resolveEmberRespinCollectorLock } from "../src/domain/features/emberRespinCollectorLock";
import { resolveRelicVaultPick } from "../src/domain/features/relicVaultPick";

describe("deterministic bonus resolvers", () => {
  it("resolves celestial wheel ascension deterministically", () => {
    const first = resolveCelestialWheelAscension({
      seed: "wheel-seed-01",
      bet: 50
    });

    const second = resolveCelestialWheelAscension({
      seed: "wheel-seed-01",
      bet: 50
    });

    expect(first).toEqual(second);
    expect(celestialWheelAscensionSessionSchema.parse(first)).toEqual(first);
    expect(first.awardedSpins).toBeGreaterThan(0);
    expect(first.maxSpins).toBeGreaterThanOrEqual(first.awardedSpins);
  });

  it("resolves relic vault picks deterministically with guarded first reveal", () => {
    const first = resolveRelicVaultPick({
      seed: "vault-seed-01",
      bet: 40,
      keyCount: 4
    });

    const second = resolveRelicVaultPick({
      seed: "vault-seed-01",
      bet: 40,
      keyCount: 4
    });

    expect(first).toEqual(second);
    expect(relicVaultPickSessionSchema.parse(first)).toEqual(first);
    expect(first.revealed.length).toBeGreaterThan(0);
    expect(first.guaranteedNonBustFirstPick).toBe(true);

    const firstReveal = first.revealed[0] as string;
    const firstSlot = first.board.find((slot) => slot.slotId === firstReveal);
    expect(firstSlot).toBeDefined();
    expect(firstSlot?.hidden).not.toBe("bustShield");
  });

  it("resolves ember respin collector lock deterministically", () => {
    const input = {
      seed: "ember-seed-01",
      bet: 25,
      initialLockedCells: [0, 1, 2, 3, 4, 5]
    };

    const first = resolveEmberRespinCollectorLock(input);
    const second = resolveEmberRespinCollectorLock(input);

    expect(first).toEqual(second);
    expect(emberRespinCollectorLockSessionSchema.parse(first)).toEqual(first);
    expect(first.lockedCells.length).toBeGreaterThanOrEqual(6);
    expect(first.collectorMultiplier).toBeGreaterThanOrEqual(1);
    expect(first.finalAward).toBeGreaterThan(0);
  });

  it("normalizes short and canonical bonus type names", () => {
    expect(normalizeBonusType("EMBER_RESPIN")).toBe("EMBER_RESPIN_COLLECTOR_LOCK");
    expect(normalizeBonusType("WHEEL_ASCENSION")).toBe("CELESTIAL_WHEEL_ASCENSION");
    expect(normalizeBonusType("RELIC_VAULT_PICK")).toBe("RELIC_VAULT_PICK");
    expect(normalizeBonusType("CELESTIAL_WHEEL_ASCENSION")).toBe("CELESTIAL_WHEEL_ASCENSION");

    expect(toShortBonusType("EMBER_RESPIN_COLLECTOR_LOCK")).toBe("EMBER_RESPIN");
    expect(toShortBonusType("CELESTIAL_WHEEL_ASCENSION")).toBe("WHEEL_ASCENSION");
    expect(toShortBonusType("RELIC_VAULT_PICK")).toBe("RELIC_VAULT_PICK");
  });

  it("accepts short bonus payload names and canonicalizes on parse", () => {
    const session = resolveCelestialWheelAscension({
      seed: "wheel-seed-02",
      bet: 30
    });

    const payload = bonusPayloadSchema.parse({
      type: "WHEEL_ASCENSION",
      sessionId: "session-1",
      revealSeed: "reveal-1",
      expectedTotalAward: session.finalAward,
      jackpotTiersHit: collectBonusSessionJackpotTiers(session),
      jackpotAwards: [],
      precomputedOutcome: session
    });

    expect(payload.type).toBe("CELESTIAL_WHEEL_ASCENSION");
    expect(payload.precomputedOutcome.type).toBe("CELESTIAL_WHEEL_ASCENSION");
  });
});
