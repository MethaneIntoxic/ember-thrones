import type { FastifyPluginAsync } from "fastify";
import {
  CREDITS_PER_SPIN_OPTIONS,
  DEFAULT_CREDITS_PER_SPIN,
  DEFAULT_DENOMINATION,
  DEFAULT_GAME_VARIANT,
  DENOMINATION_LADDER,
  SLOT_GEOMETRY,
  SUPPORTED_SPEED_MODES,
  buildMaxBetQualificationSummary,
  buildRuntimeCapabilities
} from "../lib/slotRuntime.js";

const configRoutes: FastifyPluginAsync = async (app) => {
  app.get("/config", async () => {
    const jackpotRows = app.db.getJackpots();
    const jackpotLadder = jackpotRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.tier] = row.amount;
      return acc;
    }, {});

    const mathProfileVersion = app.db.getActiveMathProfileVersion();
    const runtimeCapabilities = buildRuntimeCapabilities();
    const minCreditsPerSpin = CREDITS_PER_SPIN_OPTIONS[0]!;
    const maxCreditsPerSpin = CREDITS_PER_SPIN_OPTIONS[CREDITS_PER_SPIN_OPTIONS.length - 1]!;
    const minBet = DEFAULT_DENOMINATION * minCreditsPerSpin;
    const maxBet = DENOMINATION_LADDER[DENOMINATION_LADDER.length - 1]! * maxCreditsPerSpin;
    const defaultBet = DEFAULT_DENOMINATION * DEFAULT_CREDITS_PER_SPIN;

    return {
      geometry: SLOT_GEOMETRY,
      denominationLadder: [...DENOMINATION_LADDER],
      creditsPerSpinOptions: [...CREDITS_PER_SPIN_OPTIONS],
      defaultWager: {
        denomination: DEFAULT_DENOMINATION,
        creditsPerSpin: DEFAULT_CREDITS_PER_SPIN,
        totalBet: defaultBet
      },
      supportedSpeedModes: [...SUPPORTED_SPEED_MODES],
      supportedBonusTypes: ["HOLD_AND_SPIN", "FREE_GAMES"],
      maxBetQualification: buildMaxBetQualificationSummary(),
      gameVariant: DEFAULT_GAME_VARIANT,
      jackpotLadder,
      minBet,
      maxBet,
      defaultBet,
      runtimeCapabilities,
      mathProfileVersion: {
        id: mathProfileVersion.id,
        profileKey: mathProfileVersion.profileKey,
        versionTag: mathProfileVersion.versionTag,
        reelSetId: mathProfileVersion.reelSetId,
        checksum: mathProfileVersion.checksum
      },
      localOnly: runtimeCapabilities.mode !== "connected"
    };
  });
};

export default configRoutes;
