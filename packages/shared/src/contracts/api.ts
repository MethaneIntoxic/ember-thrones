import { z } from "zod";

export const jackpotTierSchema = z.enum(["ember", "relic", "mythic", "throne"]);
export type JackpotTier = z.infer<typeof jackpotTierSchema>;
const JACKPOT_TIER_ORDER = jackpotTierSchema.options;

export const freeQuestStanceSchema = z.enum(["ember", "relic", "mythic"]);
export type FreeQuestStance = z.infer<typeof freeQuestStanceSchema>;

export const volatilityProfileSchema = z.enum(["low", "medium", "high"]);
export type VolatilityProfile = z.infer<typeof volatilityProfileSchema>;

export const symbolSchema = z.enum([
  "ember",
  "flame",
  "scale",
  "relic",
  "mythic",
  "throne",
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

export const triggerFlagsInputSchema = z.object({
  emberLock: z.boolean(),
  freeQuest: z.boolean(),
  emberRespin: z.boolean().optional(),
  emberRespinCollectorLock: z.boolean().optional(),
  wheelAscension: z.boolean().optional(),
  celestialWheelAscension: z.boolean().optional(),
  relicVaultPick: z.boolean().optional()
});
export type TriggerFlagsInput = z.input<typeof triggerFlagsInputSchema>;

export const triggerFlagsSchema = z.object({
  emberLock: z.boolean(),
  freeQuest: z.boolean(),
  emberRespin: z.boolean().default(false),
  wheelAscension: z.boolean().default(false),
  relicVaultPick: z.boolean().default(false)
});
export type TriggerFlags = z.infer<typeof triggerFlagsSchema>;

export function normalizeTriggerFlags(flags: TriggerFlagsInput): TriggerFlags {
  return {
    emberLock: flags.emberLock,
    freeQuest: flags.freeQuest,
    emberRespin: flags.emberRespin ?? flags.emberRespinCollectorLock ?? false,
    wheelAscension: flags.wheelAscension ?? flags.celestialWheelAscension ?? false,
    relicVaultPick: flags.relicVaultPick ?? false
  };
}

export const normalizedTriggerFlagsSchema = triggerFlagsInputSchema.transform((flags) =>
  normalizeTriggerFlags(flags)
);

export const orbLandingSchema = z.object({
  position: z.number().int().min(0).max(14),
  coinValue: z.number().nonnegative(),
  jackpotTier: jackpotTierSchema.optional()
});
export type OrbLanding = z.infer<typeof orbLandingSchema>;

export const emberLockStateSchema = z.object({
  active: z.boolean(),
  respinsRemaining: z.number().int().min(0).max(3),
  spinsPlayed: z.number().int().min(0),
  lockedOrbs: z.array(orbLandingSchema),
  completed: z.boolean()
});
export type EmberLockStateContract = z.infer<typeof emberLockStateSchema>;

export const freeQuestStateSchema = z.object({
  active: z.boolean(),
  stance: freeQuestStanceSchema,
  spinsRemaining: z.number().int().min(0),
  retriggerCount: z.number().int().min(0),
  totalAwardedSpins: z.number().int().min(0)
});
export type FreeQuestStateContract = z.infer<typeof freeQuestStateSchema>;

export const bonusTypeSchema = z.enum([
  "EMBER_RESPIN",
  "WHEEL_ASCENSION",
  "RELIC_VAULT_PICK"
]);
export type BonusType = z.infer<typeof bonusTypeSchema>;

export const bonusTypeCanonicalSchema = bonusTypeSchema;

export const bonusTypeShortSchema = bonusTypeSchema;
export type BonusTypeShort = z.infer<typeof bonusTypeShortSchema>;

export const legacyBonusTypeSchema = z.enum([
  "EMBER_RESPIN_COLLECTOR_LOCK",
  "CELESTIAL_WHEEL_ASCENSION",
  "RELIC_VAULT"
]);
export type LegacyBonusType = z.infer<typeof legacyBonusTypeSchema>;

export const bonusTypeInputSchema = z.union([
  bonusTypeSchema,
  legacyBonusTypeSchema
]);
export type BonusTypeInput = z.input<typeof bonusTypeInputSchema>;

const bonusTypeAliasToCanonical: Record<BonusTypeInput, BonusType> = {
  EMBER_RESPIN: "EMBER_RESPIN",
  EMBER_RESPIN_COLLECTOR_LOCK: "EMBER_RESPIN",
  WHEEL_ASCENSION: "WHEEL_ASCENSION",
  CELESTIAL_WHEEL_ASCENSION: "WHEEL_ASCENSION",
  RELIC_VAULT: "RELIC_VAULT_PICK",
  RELIC_VAULT_PICK: "RELIC_VAULT_PICK"
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

const bonusValueSchema = z.union([z.number().nonnegative(), jackpotTierSchema]);

export const emberRespinJackpotOrbHitSchema = z.object({
  cell: z.number().int().min(0).max(14),
  tier: jackpotTierSchema
});
export type EmberRespinJackpotOrbHit = z.infer<typeof emberRespinJackpotOrbHitSchema>;

export const emberRespinRevealStepSchema = z.object({
  respinIndex: z.number().int().min(1),
  landedOrbs: z.array(orbLandingSchema),
  collectorMultiplier: z.number().int().min(1),
  respinsRemainingAfter: z.number().int().min(0).max(3),
  boardCompleted: z.boolean()
});
export type EmberRespinRevealStep = z.infer<typeof emberRespinRevealStepSchema>;

export const emberRespinCollectorLockSessionSchema = z.object({
  type: z.literal("EMBER_RESPIN"),
  startingOrbs: z.array(orbLandingSchema).min(6).max(15),
  steps: z.array(emberRespinRevealStepSchema),
  lockedCells: z.array(z.number().int().min(0).max(14)),
  orbValues: z.array(z.number().nonnegative()),
  respinsRemaining: z.number().int().min(0).max(3),
  collectorMultiplier: z.number().int().min(1),
  guaranteedMysteryOrbAt: z.number().int().min(1).nullable(),
  jackpotOrbHits: z.array(emberRespinJackpotOrbHitSchema),
  finalAward: z.number().nonnegative()
});
export type EmberRespinCollectorLockSession = z.infer<
  typeof emberRespinCollectorLockSessionSchema
>;

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
export type CelestialWheelAscensionSession = z.infer<
  typeof celestialWheelAscensionSessionSchema
>;

export const relicVaultHiddenSchema = z.enum([
  "coin",
  "multiplier",
  "jackpotTier",
  "bustShield"
]);
export type RelicVaultHidden = z.infer<typeof relicVaultHiddenSchema>;

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

export const bonusOutcomeSchema = z.discriminatedUnion("type", [
  emberRespinCollectorLockSessionSchema,
  celestialWheelAscensionSessionSchema,
  relicVaultPickSessionSchema
]);
export type BonusOutcome = z.infer<typeof bonusOutcomeSchema>;

export const bonusSessionSchema = bonusOutcomeSchema;
export type BonusSession = BonusOutcome;

function normalizeJackpotTierList(tiers: readonly JackpotTier[]): JackpotTier[] {
  const unique = new Set<JackpotTier>(tiers);
  return JACKPOT_TIER_ORDER.filter((tier) => unique.has(tier));
}

function jackpotTierListsMatch(
  left: readonly JackpotTier[],
  right: readonly JackpotTier[]
): boolean {
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
  if (session.type === "EMBER_RESPIN") {
    const tiers = new Set<JackpotTier>();
    for (const hit of session.jackpotOrbHits) {
      tiers.add(hit.tier);
    }

    return [...tiers];
  }

  if (session.type === "WHEEL_ASCENSION") {
    return [...new Set(session.jackpotTierHits)];
  }

  return [...new Set(session.jackpotTierHits)];
}

export const bonusPayloadSchema = z
  .object({
    type: normalizedBonusTypeSchema,
    sessionId: z.string().min(1),
    revealSeed: z.string().min(1),
    expectedTotalAward: z.number().nonnegative(),
    jackpotTiersHit: z.array(jackpotTierSchema),
    jackpotAwards: z.array(bonusJackpotAwardSchema),
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

export const bonusActionTypeSchema = z.enum([
  "START",
  "RESUME",
  "RESPIN",
  "WHEEL_STOP",
  "PICK",
  "CLAIM"
]);
export type BonusActionType = z.infer<typeof bonusActionTypeSchema>;

export const bonusAdvanceActionTypeSchema = z.enum([
  "RESPIN",
  "WHEEL_STOP",
  "PICK"
]);
export type BonusAdvanceActionType = z.infer<typeof bonusAdvanceActionTypeSchema>;

const emberRespinNextActionSchema = z.enum(["RESPIN", "CLAIM"]).nullable();
const wheelNextActionSchema = z.enum(["WHEEL_STOP", "CLAIM"]).nullable();
const relicVaultNextActionSchema = z.enum(["PICK", "CLAIM"]).nullable();

export const emberRespinProgressSchema = z.object({
  type: z.literal("EMBER_RESPIN"),
  stepCursor: z.number().int().min(0),
  totalSteps: z.number().int().min(0),
  revealedOrbs: z.array(orbLandingSchema),
  revealedSteps: z.array(emberRespinRevealStepSchema),
  currentCollectorMultiplier: z.number().int().min(1),
  respinsRemaining: z.number().int().min(0).max(3),
  completed: z.boolean(),
  claimed: z.boolean(),
  nextAction: emberRespinNextActionSchema
});
export type EmberRespinProgress = z.infer<typeof emberRespinProgressSchema>;

export const wheelAscensionProgressSchema = z.object({
  type: z.literal("WHEEL_ASCENSION"),
  spinCursor: z.number().int().min(0),
  totalSpins: z.number().int().min(0),
  revealedOutcomes: z.array(wheelOutcomeBySpinSchema),
  runningAward: z.number().nonnegative(),
  completed: z.boolean(),
  claimed: z.boolean(),
  nextAction: wheelNextActionSchema
});
export type WheelAscensionProgress = z.infer<typeof wheelAscensionProgressSchema>;

export const relicVaultBoardStateSlotSchema = z.object({
  slotId: z.string().min(1),
  revealed: z.boolean(),
  hidden: relicVaultHiddenSchema.optional(),
  value: bonusValueSchema.optional()
});
export type RelicVaultBoardStateSlot = z.infer<typeof relicVaultBoardStateSlotSchema>;

export const relicVaultProgressSchema = z.object({
  type: z.literal("RELIC_VAULT_PICK"),
  pickCursor: z.number().int().min(0),
  totalPicks: z.number().int().min(0),
  boardState: z.array(relicVaultBoardStateSlotSchema),
  revealedPicks: z.array(relicVaultPickResultSchema),
  runningAward: z.number().nonnegative(),
  jackpotTierHits: z.array(jackpotTierSchema),
  completed: z.boolean(),
  claimed: z.boolean(),
  nextAction: relicVaultNextActionSchema
});
export type RelicVaultProgress = z.infer<typeof relicVaultProgressSchema>;

export const bonusProgressSchema = z.discriminatedUnion("type", [
  emberRespinProgressSchema,
  wheelAscensionProgressSchema,
  relicVaultProgressSchema
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
  lines: z.number().int().min(1).max(30).default(20),
  clientNonce: z.string().min(8),
  seed: z.union([z.number().int(), z.string().min(1)]).optional(),
  volatility: volatilityProfileSchema.default("medium"),
  stance: freeQuestStanceSchema.default("relic")
});
export type SpinRequest = z.infer<typeof spinRequestSchema>;

function isTriggeredBonusType(triggers: TriggerFlags, bonusType: BonusType): boolean {
  if (bonusType === "EMBER_RESPIN") {
    return triggers.emberRespin;
  }

  if (bonusType === "WHEEL_ASCENSION") {
    return triggers.wheelAscension;
  }

  return triggers.relicVaultPick;
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
    emberLockState: emberLockStateSchema.optional(),
    freeQuestState: freeQuestStateSchema.optional(),
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
  freeQuestStance: freeQuestStanceSchema.default("relic"),
  volatility: volatilityProfileSchema.default("medium")
});
export type SimulationRequest = z.infer<typeof simulationRequestSchema>;
