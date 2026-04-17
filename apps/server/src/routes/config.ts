import type { FastifyPluginAsync } from "fastify";
import {
  CREDITS_PER_SPIN_OPTIONS,
  DEFAULT_DENOMINATION,
  DEFAULT_CREDITS_PER_SPIN,
  DENOMINATION_LADDER,
  SLOT_GEOMETRY,
  SUPPORTED_SPEED_MODES,
  buildMaxBetQualificationSummary,
  buildRuntimeCapabilities,
} from "../lib/slotRuntime.js";

const configRoutes: FastifyPluginAsync = async (app) => {
  app.get("/config", async () => {
    const jackpotRows = app.db.getJackpots();
    const mathProfileVersion = app.db.getActiveMathProfileVersion();
    const jackpotLadder = jackpotRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.tier] = row.amount;
      return acc;
    }, {});
    const runtimeCapabilities = buildRuntimeCapabilities();
    const minCreditsPerSpin = CREDITS_PER_SPIN_OPTIONS[0]!;
    const maxCreditsPerSpin = CREDITS_PER_SPIN_OPTIONS[CREDITS_PER_SPIN_OPTIONS.length - 1]!;
    const maxDenomination = DENOMINATION_LADDER[DENOMINATION_LADDER.length - 1]!;
    const minBet = DEFAULT_DENOMINATION * minCreditsPerSpin;
    const maxBet = DEFAULT_DENOMINATION * maxCreditsPerSpin;
    const defaultBet = DEFAULT_DENOMINATION * DEFAULT_CREDITS_PER_SPIN;

    return {
      geometry: SLOT_GEOMETRY,
      denominationLadder: [1, 2, 5, 10, 20, 50, 100],
      creditsPerSpinOptions: [...CREDITS_PER_SPIN_OPTIONS],
      defaultWager: {
        denomination: DEFAULT_DENOMINATION,
        creditsPerSpin: DEFAULT_CREDITS_PER_SPIN,
        totalBet: defaultBet,
      },
      supportedSpeedModes: [...SUPPORTED_SPEED_MODES],
      maxBetQualification: buildMaxBetQualificationSummary(),
      supportedBonusTypes: ["EMBER_RESPIN", "FREE_SPINS", "WHEEL_ASCENSION"],
      mathProfileVersion: {
        id: mathProfileVersion.id,
        profileKey: mathProfileVersion.profileKey,
        versionTag: mathProfileVersion.versionTag,
        reelSetId: mathProfileVersion.reelSetId,
        checksum: mathProfileVersion.checksum,
      },
      wagerRange: {
        minTotalBet: minBet,
        maxTotalBet: maxDenomination * maxCreditsPerSpin,
      },
      jackpotLadder,
      runtimeCapabilities,
      minBet,
      maxBet,
      defaultBet,
      localOnly: runtimeCapabilities.mode !== "connected",
    };
  });
};

export default configRoutes;

