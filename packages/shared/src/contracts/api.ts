import { z } from "zod";

export const jackpotTierSchema = z.enum(["mini", "minor", "major", "grand"]);
export type JackpotTier = z.infer<typeof jackpotTierSchema>;
const JACKPOT_TIER_ORDER = jackpotTierSchema.options;

export const freeGamesModifierSchema = z.enum([
  "ROYALS_REMOVED",
  "MYSTERY_SPECIAL_REVEAL",
  "EXPANDING_WILD_REELS"
]);
export type FreeGamesModifierId = z.infer<typeof freeGamesModifierSchema>;

export const volatilityProfileSchema = z.enum(["low", "medium", "high"]);
export type VolatilityProfile = z.infer<typeof volatilityProfileSchema>;

export const symbolSchema = z.enum([
  "ten",
  "jack",
  "queen",
  "king",
  "ace",
  "coin",
  "lantern",
  "ingot",
  "dragon",
  "wild",
  "orb",
  "scatter"
]);
export type SlotSymbol = z.infer<typeof symbolSchema>;

const spinGridColumnSchema = z.tuple([symbolSchema, symbolSchema, symbolSchema]);

export const spinGridSchema = z.tuple([
  spinGridColumnSchema,
  spinGridColumnSchema,
  spinGridColumnSchema,
  spinGridColumnSchema,
  spinGridColumnSchema
]);

export const lineWinSchema = z.object({
  lineIndex: z.number().int().min(0),
  symbol: symbolSchema,
  count: z.number().int().min(3).max(5),
  multiplier: z.number().nonnegative(),
  payout: z.number().nonnegative()
});
export type LineWin = z.infer<typeof lineWinSchema>;

export const orbTriggerConfigSchema = z.object({
  minOrbs: z.number().int().min(1),
  resetSpins: z.number().int().min(1),
  boardCells: z.number().int().min(1),
  grandRequiresFullBoard: z.boolean()
});
export type OrbTriggerConfig = z.infer<typeof orbTriggerConfigSchema>;

export const scatterTriggerConfigSchema = z.object({
  minScatters: z.number().int().min(1),
  baseAwardedGames: z.number().int().min(1),
  extraGamesPerExtraScatter: z.number().int().min(0),
  retriggerAward: z.number().int().min(1)
});
export type ScatterTriggerConfig = z.infer<typeof scatterTriggerConfigSchema>;

export const jackpotConfigSchema = z.object({
  resetAmounts: z.record(jackpotTierSchema, z.number().nonnegative()),
  contributionShares: z.record(jackpotTierSchema, z.number().nonnegative()),
  maxBetRequiredForGrand: z.boolean()
});
export type JackpotConfig = z.infer<typeof jackpotConfigSchema>;

export const gameVariantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  cabinetLabel: z.string().min(1),
  theme: z.string().min(1),
  freeGamesModifierId: freeGamesModifierSchema,
  jackpotConfig: jackpotConfigSchema,
  orbTriggerConfig: orbTriggerConfigSchema,
  scatterTriggerConfig: scatterTriggerConfigSchema
});
export type GameVariant = z.infer<typeof gameVariantSchema>;

export const legacyTriggerFlagsInputSchema = z.object({
  emberLock: z.boolean().optional(),
  freeQuest: z.boolean().optional(),
  emberRespin: z.boolean().optional(),
  emberRespinCollectorLock: z.boolean().optional(),
  freeSpins: z.boolean().optional(),
  freeGames: z.boolean().optional(),
  holdAndSpin: z.boolean().optional()
});
export type TriggerFlagsInput = z.input<typeof legacyTriggerFlagsInputSchema>;
export const triggerFlagsInputSchema = legacyTriggerFlagsInputSchema;

export const triggerFlagsSchema = z.object({
  holdAndSpin: z.boolean().default(false),
  freeGames: z.boolean().default(false)
});
export type TriggerFlags = z.infer<typeof triggerFlagsSchema>;

export function normalizeTriggerFlags(flags: TriggerFlagsInput): TriggerFlags {
  return {
    holdAndSpin:
      flags.holdAndSpin ?? flags.emberRespin ?? flags.emberRespinCollectorLock ?? flags.emberLock ?? false,
    freeGames: flags.freeGames ?? flags.freeSpins ?? flags.freeQuest ?? false
  };
}

export const normalizedTriggerFlagsSchema = legacyTriggerFlagsInputSchema.transform((flags) =>
  normalizeTriggerFlags(flags)
);

export const orbLandingSchema = z.object({
  position: z.number().int().min(0).max(14),
  coinValue: z.number().nonnegative(),
  jackpotTier: jackpotTierSchema.optional()
});
export type OrbLanding = z.infer<typeof orbLandingSchema>;

export const holdAndSpinStateSchema = z.object({
  active: z.boolean(),
  lockedCount: z.number().int().min(0).max(15),
  respinsRemaining: z.number().int().min(0).max(3),
  filledPositions: z.array(z.number().int().min(0).max(14))
});
export type HoldAndSpinStateContract = z.infer<typeof holdAndSpinStateSchema>;

export const freeGamesStateSchema = z.object({
  active: z.boolean(),
  modifierId: freeGamesModifierSchema,
  gamesRemaining: z.number().int().min(0),
  retriggerCount: z.number().int().min(0),
  totalAwardedGames: z.number().int().min(0)
});
export type FreeGamesStateContract = z.infer<typeof freeGamesStateSchema>;
export const emberLockStateSchema = holdAndSpinStateSchema;
export type EmberLockStateContract = HoldAndSpinStateContract;
export const freeQuestStateSchema = freeGamesStateSchema;
export type FreeQuestStateContract = FreeGamesStateContract;
export const freeQuestStanceSchema = freeGamesModifierSchema;
export type FreeQuestStance = FreeGamesModifierId;

export const bonusTypeSchema = z.enum(["HOLD_AND_SPIN", "FREE_GAMES"]);
export type BonusType = z.infer<typeof bonusTypeSchema>;

export const bonusTypeCanonicalSchema = bonusTypeSchema;
export const bonusTypeShortSchema = bonusTypeSchema;
export type BonusTypeShort = z.infer<typeof bonusTypeShortSchema>;

export const legacyBonusTypeSchema = z.enum([
  "EMBER_RESPIN",
  "EMBER_RESPIN_COLLECTOR_LOCK",
  "FREE_SPINS",
  "FREE_QUEST"
]);
export type LegacyBonusType = z.infer<typeof legacyBonusTypeSchema>;

export const bonusTypeInputSchema = z.union([bonusTypeSchema, legacyBonusTypeSchema]);
export type BonusTypeInput = z.input<typeof bonusTypeInputSchema>;

const bonusTypeAliasToCanonical: Record<BonusTypeInput, BonusType> = {
  HOLD_AND_SPIN: "HOLD_AND_SPIN",
  FREE_GAMES: "FREE_GAMES",
  EMBER_RESPIN: "HOLD_AND_SPIN",
  EMBER_RESPIN_COLLECTOR_LOCK: "HOLD_AND_SPIN",
  FREE_SPINS: "FREE_GAMES",
  FREE_QUEST: "FREE_GAMES"
};

export function normalizeBonusType(type: BonusTypeInput): BonusType {
  return bonusTypeAliasToCanonical[type];
}

export function toShortBonusType(type: BonusType): BonusTypeShort {
  return type;
}

export const normalizedBonusTypeSchema = bonusTypeInputSchema.transform((type) =>
  normalizeBonusType(type)
);

export const bonusJackpotAwardSchema = z.object({
  tier: jackpotTierSchema,
  amount: z.number().nonnegative(),
  source: z.string().min(1)
});
export type BonusJackpotAward = z.infer<typeof bonusJackpotAwardSchema>;

export const holdAndSpinRevealStepSchema = z.object({
  respinIndex: z.number().int().min(1),
  landedOrbs: z.array(orbLandingSchema),
  respinsRemainingAfter: z.number().int().min(0).max(3),
  boardCompleted: z.boolean()
});
export type HoldAndSpinRevealStep = z.infer<typeof holdAndSpinRevealStepSchema>;

export const holdAndSpinSessionSchema = z.object({
  type: z.literal("HOLD_AND_SPIN"),
  gameVariantId: z.string().min(1),
  startingOrbs: z.array(orbLandingSchema).min(6).max(15),
  steps: z.array(holdAndSpinRevealStepSchema),
  filledPositions: z.array(z.number().int().min(0).max(14)),
  respinsRemaining: z.number().int().min(0).max(3),
  jackpotTierHits: z.array(jackpotTierSchema),
  finalAward: z.number().nonnegative()
});
export type HoldAndSpinSession = z.infer<typeof holdAndSpinSessionSchema>;

export const freeGameSpinRevealSchema = z.object({
  spinIndex: z.number().int().min(1),
  lineWin: z.number().nonnegative(),
  awardedWin: z.number().nonnegative(),
  runningAward: z.number().nonnegative(),
  scatterCount: z.number().int().min(0),
  retriggered: z.boolean(),
  awardedExtraGames: z.number().int().min(0),
  gamesRemainingAfter: z.number().int().min(0),
  multiplier: z.number().positive().optional(),
  revealedSpecialSymbol: symbolSchema.optional(),
  expandedWildReels: z.array(z.number().int().min(0).max(4)).optional()
});
export type FreeGameSpinReveal = z.infer<typeof freeGameSpinRevealSchema>;

export const freeGamesSessionSchema = z.object({
  type: z.literal("FREE_GAMES"),
  gameVariantId: z.string().min(1),
  modifierId: freeGamesModifierSchema,
  initialGames: z.number().int().min(1),
  totalAwardedGames: z.number().int().min(1),
  retriggerCount: z.number().int().min(0),
  steps: z.array(freeGameSpinRevealSchema),
  finalAward: z.number().nonnegative()
});
export type FreeGamesSession = z.infer<typeof freeGamesSessionSchema>;

export const bonusOutcomeSchema = z.discriminatedUnion("type", [
  holdAndSpinSessionSchema,
  freeGamesSessionSchema
]);
export type BonusOutcome = z.infer<typeof bonusOutcomeSchema>;

export const bonusSessionSchema = bonusOutcomeSchema;
export type BonusSession = BonusOutcome;

function normalizeJackpotTierList(tiers: readonly JackpotTier[]): JackpotTier[] {
  const unique = new Set<JackpotTier>(tiers);
  return JACKPOT_TIER_ORDER.filter((tier) => unique.has(tier));
}

function jackpotTierListsMatch(left: readonly JackpotTier[], right: readonly JackpotTier[]): boolean {
  const normalizedLeft = normalizeJackpotTierList(left);
  const normalizedRight = normalizeJackpotTierList(right);

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((tier, index) => tier === normalizedRight[index])
  );
}

function jackpotAwardsAlignWithTierList(
  jackpotTiersHit: readonly JackpotTier[],
  jackpotAwards: readonly BonusJackpotAward[]
): boolean {
  const tierSet = new Set(normalizeJackpotTierList(jackpotTiersHit));
  return jackpotAwards.every((award) => tierSet.has(award.tier));
}

export function collectBonusSessionJackpotTiers(session: BonusSession): JackpotTier[] {
  if (session.type === "HOLD_AND_SPIN") {
    return [...new Set(session.jackpotTierHits)];
  }

  return [];
}

export const bonusPayloadSchema = z
  .object({
    type: normalizedBonusTypeSchema,
    sessionId: z.string().min(1),
    revealSeed: z.string().min(1),
    gameVariantId: z.string().min(1),
    freeGamesModifierId: freeGamesModifierSchema,
    expectedTotalAward: z.number().nonnegative(),
    jackpotTiersHit: z.array(jackpotTierSchema),
    jackpotAwards: z.array(bonusJackpotAwardSchema),
    jackpotConfig: jackpotConfigSchema,
    orbTriggerConfig: orbTriggerConfigSchema,
    scatterTriggerConfig: scatterTriggerConfigSchema,
    precomputedOutcome: bonusOutcomeSchema
  })
  .superRefine((payload, ctx) => {
    if (payload.type !== payload.precomputedOutcome.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Bonus payload type ${payload.type} does not match deterministic outcome type ${payload.precomputedOutcome.type}`,
        path: ["precomputedOutcome", "type"]
      });
    }

    if (payload.gameVariantId !== payload.precomputedOutcome.gameVariantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bonus payload variant does not match the deterministic outcome",
        path: ["gameVariantId"]
      });
    }

    if (
      payload.precomputedOutcome.type === "FREE_GAMES" &&
      payload.freeGamesModifierId !== payload.precomputedOutcome.modifierId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bonus payload modifier does not match the deterministic outcome",
        path: ["freeGamesModifierId"]
      });
    }

    const derivedJackpotTiers = collectBonusSessionJackpotTiers(payload.precomputedOutcome);
    if (!jackpotTierListsMatch(payload.jackpotTiersHit, derivedJackpotTiers)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bonus payload jackpot tiers do not match the deterministic outcome",
        path: ["jackpotTiersHit"]
      });
    }

    if (!jackpotAwardsAlignWithTierList(payload.jackpotTiersHit, payload.jackpotAwards)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bonus jackpot awards must only reference tiers declared in jackpotTiersHit",
        path: ["jackpotAwards"]
      });
    }
  });
export type BonusPayload = z.infer<typeof bonusPayloadSchema>;

export const bonusSessionStatusSchema = z.enum([
  "PENDING",
  "ACTIVE",
  "COMPLETED",
  "CLAIMED",
  "EXPIRED"
]);
export type BonusSessionStatus = z.infer<typeof bonusSessionStatusSchema>;

export const bonusActionTypeSchema = z.enum(["START", "RESUME", "RESPIN", "FREE_GAME_SPIN", "CLAIM"]);
export type BonusActionType = z.infer<typeof bonusActionTypeSchema>;

export const bonusAdvanceActionTypeSchema = z.enum(["RESPIN", "FREE_GAME_SPIN"]);
export type BonusAdvanceActionType = z.infer<typeof bonusAdvanceActionTypeSchema>;

const holdAndSpinNextActionSchema = z.enum(["RESPIN", "CLAIM"]).nullable();
const freeGamesNextActionSchema = z.enum(["FREE_GAME_SPIN", "CLAIM"]).nullable();

export const holdAndSpinProgressSchema = z.object({
  type: z.literal("HOLD_AND_SPIN"),
  stepCursor: z.number().int().min(0),
  totalSteps: z.number().int().min(0),
  revealedOrbs: z.array(orbLandingSchema),
  revealedSteps: z.array(holdAndSpinRevealStepSchema),
  respinsRemaining: z.number().int().min(0).max(3),
  completed: z.boolean(),
  claimed: z.boolean(),
  nextAction: holdAndSpinNextActionSchema
});
export type HoldAndSpinProgress = z.infer<typeof holdAndSpinProgressSchema>;
export const emberRespinProgressSchema = holdAndSpinProgressSchema;
export type EmberRespinProgress = HoldAndSpinProgress;

export const freeGamesProgressSchema = z.object({
  type: z.literal("FREE_GAMES"),
  spinCursor: z.number().int().min(0),
  totalSpins: z.number().int().min(0),
  revealedSpins: z.array(freeGameSpinRevealSchema),
  runningAward: z.number().nonnegative(),
  retriggerCount: z.number().int().min(0),
  gamesRemaining: z.number().int().min(0),
  completed: z.boolean(),
  claimed: z.boolean(),
  nextAction: freeGamesNextActionSchema
});
export type FreeGamesProgress = z.infer<typeof freeGamesProgressSchema>;
export type FreeSpinsProgress = FreeGamesProgress;

export const bonusProgressSchema = z.discriminatedUnion("type", [
  holdAndSpinProgressSchema,
  freeGamesProgressSchema
]);
export type BonusProgress = z.infer<typeof bonusProgressSchema>;

export const bonusSessionReferenceSchema = z.object({
  id: z.string().min(1),
  type: bonusTypeSchema,
  status: bonusSessionStatusSchema
});
export type BonusSessionReference = z.infer<typeof bonusSessionReferenceSchema>;

export const bonusSessionRecordSchema = z
  .object({
    id: z.string().min(1),
    spinId: z.string().min(1),
    sessionId: z.string().min(1),
    profileId: z.string().min(1),
    type: bonusTypeSchema,
    status: bonusSessionStatusSchema,
    revealSeed: z.string().min(1),
    expectedTotalAward: z.number().nonnegative(),
    actualAward: z.number().nonnegative(),
    jackpotTiersHit: z.array(jackpotTierSchema),
    jackpotAwards: z.array(bonusJackpotAwardSchema),
    outcome: bonusOutcomeSchema,
    progress: bonusProgressSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    claimedAt: z.string().datetime().nullable()
  })
  .superRefine((record, ctx) => {
    if (record.type !== record.outcome.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Bonus session type ${record.type} does not match outcome type ${record.outcome.type}`,
        path: ["outcome", "type"]
      });
    }

    if (record.type !== record.progress.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Bonus session type ${record.type} does not match progress type ${record.progress.type}`,
        path: ["progress", "type"]
      });
    }

    const derivedJackpotTiers = collectBonusSessionJackpotTiers(record.outcome);
    if (!jackpotTierListsMatch(record.jackpotTiersHit, derivedJackpotTiers)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bonus session jackpot tiers do not match the deterministic outcome",
        path: ["jackpotTiersHit"]
      });
    }

    if (!jackpotAwardsAlignWithTierList(record.jackpotTiersHit, record.jackpotAwards)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bonus jackpot awards must only reference tiers declared in jackpotTiersHit",
        path: ["jackpotAwards"]
      });
    }
  });
export type BonusSessionRecord = z.infer<typeof bonusSessionRecordSchema>;

export const bonusActionRecordSchema = z.object({
  id: z.string().min(1),
  bonusSessionId: z.string().min(1),
  actionType: bonusActionTypeSchema,
  ordinal: z.number().int().min(1),
  requestPayload: z.record(z.unknown()),
  resultPayload: z.record(z.unknown()),
  createdAt: z.string().datetime()
});
export type BonusActionRecord = z.infer<typeof bonusActionRecordSchema>;

export const bonusSessionSnapshotSchema = z.object({
  session: bonusSessionRecordSchema,
  actions: z.array(bonusActionRecordSchema)
});
export type BonusSessionSnapshot = z.infer<typeof bonusSessionSnapshotSchema>;

export const bonusSessionActionRequestSchema = z.object({
  actionType: bonusAdvanceActionTypeSchema,
  clientSelection: z.record(z.unknown()).optional()
});
export type BonusSessionActionRequest = z.infer<typeof bonusSessionActionRequestSchema>;

export const spinRequestSchema = z.object({
  sessionId: z.string().min(1),
  playerId: z.string().min(1).optional(),
  bet: z.number().positive(),
  lines: z.number().int().min(1).max(50).default(50),
  clientNonce: z.string().min(8),
  seed: z.union([z.number().int(), z.string().min(1)]).optional(),
  volatility: volatilityProfileSchema.default("medium"),
  gameVariantId: z.string().min(1).optional()
});
export type SpinRequest = z.infer<typeof spinRequestSchema>;

function isTriggeredBonusType(triggers: TriggerFlags, bonusType: BonusType): boolean {
  return bonusType === "HOLD_AND_SPIN" ? triggers.holdAndSpin : triggers.freeGames;
}

export const spinResultSchema = z
  .object({
    spinId: z.string().min(1),
    sessionId: z.string().min(1),
    bet: z.number().positive(),
    grid: spinGridSchema,
    lineWins: z.array(lineWinSchema),
    scatterCount: z.number().int().min(0),
    orbCount: z.number().int().min(0),
    baseWin: z.number().nonnegative(),
    featureWin: z.number().nonnegative(),
    totalWin: z.number().nonnegative(),
    triggers: normalizedTriggerFlagsSchema,
    gameVariantId: z.string().min(1),
    freeGamesModifierId: freeGamesModifierSchema,
    jackpotConfig: jackpotConfigSchema,
    orbTriggerConfig: orbTriggerConfigSchema,
    scatterTriggerConfig: scatterTriggerConfigSchema,
    holdAndSpinState: holdAndSpinStateSchema.optional(),
    freeGamesState: freeGamesStateSchema.optional(),
    bonusSessionRef: bonusSessionReferenceSchema.nullable().optional(),
    bonusPayload: bonusPayloadSchema.nullable().optional(),
    signature: z.string().min(16).optional()
  })
  .superRefine((result, ctx) => {
    if (result.bonusPayload && !isTriggeredBonusType(result.triggers, result.bonusPayload.type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Spin result bonus payload ${result.bonusPayload.type} is not reflected in trigger flags`,
        path: ["triggers"]
      });
    }

    if (result.bonusSessionRef && !isTriggeredBonusType(result.triggers, result.bonusSessionRef.type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Spin result bonus session ${result.bonusSessionRef.type} is not reflected in trigger flags`,
        path: ["triggers"]
      });
    }

    if (
      result.bonusSessionRef &&
      result.bonusPayload &&
      result.bonusSessionRef.type !== result.bonusPayload.type
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Spin result bonus session type ${result.bonusSessionRef.type} does not match payload type ${result.bonusPayload.type}`,
        path: ["bonusPayload", "type"]
      });
    }
  });
export type SpinResult = z.infer<typeof spinResultSchema>;

export const simulationRequestSchema = z.object({
  spins: z.number().int().min(100).max(5000000),
  betPerSpin: z.number().positive(),
  seed: z.union([z.number().int(), z.string().min(1)]),
  freeGamesModifierId: freeGamesModifierSchema.default("ROYALS_REMOVED"),
  volatility: volatilityProfileSchema.default("medium")
});
export type SimulationRequest = z.infer<typeof simulationRequestSchema>;

export const emberRespinRevealStepSchema = holdAndSpinRevealStepSchema;
export type EmberRespinRevealStep = HoldAndSpinRevealStep;
export const emberRespinCollectorLockSessionSchema = holdAndSpinSessionSchema;
export type EmberRespinCollectorLockSession = HoldAndSpinSession;
export type EmberRespinJackpotOrbHit = {
  cell: number;
  tier: JackpotTier;
};
export const emberRespinJackpotOrbHitSchema = z.object({
  cell: z.number().int().min(0).max(14),
  tier: jackpotTierSchema
});

export const wheelWedgeKindSchema = z.enum(["coin", "multiplier", "jackpot", "respin"]);
export type WheelWedgeKind = z.infer<typeof wheelWedgeKindSchema>;

export const wheelWedgeSchema = z.object({
  wedgeId: z.string().min(1),
  kind: wheelWedgeKindSchema,
  value: z.union([z.number().nonnegative(), jackpotTierSchema])
});
export type WheelWedge = z.infer<typeof wheelWedgeSchema>;

export const wheelOutcomeBySpinSchema = z.object({
  wedgeId: z.string().min(1),
  resolvedAward: z.number().nonnegative(),
  jackpotTier: jackpotTierSchema.optional()
});
export type WheelOutcomeBySpin = z.infer<typeof wheelOutcomeBySpinSchema>;

export const celestialWheelAscensionSessionSchema = z.object({
  type: z.literal("WHEEL_ASCENSION"),
  wedgeMap: z.array(wheelWedgeSchema),
  awardedSpins: z.number().int().min(0),
  maxSpins: z.number().int().min(1),
  outcomesBySpin: z.array(wheelOutcomeBySpinSchema),
  jackpotTierHits: z.array(jackpotTierSchema),
  finalAward: z.number().nonnegative()
});
export type CelestialWheelAscensionSession = z.infer<typeof celestialWheelAscensionSessionSchema>;

export const relicVaultHiddenSchema = z.enum(["coin", "multiplier", "jackpotTier", "bustShield"]);
export type RelicVaultHidden = z.infer<typeof relicVaultHiddenSchema>;

const bonusValueSchema = z.union([z.number().nonnegative(), jackpotTierSchema]);

export const relicVaultBoardSlotSchema = z.object({
  slotId: z.string().min(1),
  hidden: relicVaultHiddenSchema,
  value: bonusValueSchema.optional()
});
export type RelicVaultBoardSlot = z.infer<typeof relicVaultBoardSlotSchema>;

export const relicVaultPickResultSchema = z.object({
  pickIndex: z.number().int().min(1),
  slotId: z.string().min(1),
  hidden: relicVaultHiddenSchema,
  value: bonusValueSchema.optional(),
  awardDelta: z.number().nonnegative(),
  runningAward: z.number().nonnegative(),
  jackpotTierGranted: jackpotTierSchema.optional()
});
export type RelicVaultPickResult = z.infer<typeof relicVaultPickResultSchema>;

export const relicVaultPickSessionSchema = z.object({
  type: z.literal("RELIC_VAULT_PICK"),
  keyCount: z.number().int().min(1),
  board: z.array(relicVaultBoardSlotSchema),
  picksAllowed: z.number().int().min(1),
  picksMade: z.number().int().min(0),
  revealed: z.array(z.string().min(1)),
  guaranteedNonBustFirstPick: z.boolean(),
  pickResults: z.array(relicVaultPickResultSchema),
  jackpotTierHits: z.array(jackpotTierSchema),
  finalAward: z.number().nonnegative()
});
export type RelicVaultPickSession = z.infer<typeof relicVaultPickSessionSchema>;
