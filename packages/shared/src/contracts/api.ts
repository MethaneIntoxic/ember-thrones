import { z } from "zod";

export const jackpotTierSchema = z.enum(["ember", "relic", "mythic", "throne"]);
export type JackpotTier = z.infer<typeof jackpotTierSchema>;

export const freeQuestStanceSchema = z.enum(["ember", "relic", "mythic"]);
export type FreeQuestStance = z.infer<typeof freeQuestStanceSchema>;

export const volatilityProfileSchema = z.literal("medium");
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

export const triggerFlagsSchema = z.object({
  emberLock: z.boolean(),
  freeQuest: z.boolean(),
  emberRespinCollectorLock: z.boolean().default(false),
  celestialWheelAscension: z.boolean().default(false),
  relicVaultPick: z.boolean().default(false)
});
export type TriggerFlags = z.infer<typeof triggerFlagsSchema>;

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

export const bonusTypeCanonicalSchema = z.enum([
  "EMBER_RESPIN_COLLECTOR_LOCK",
  "CELESTIAL_WHEEL_ASCENSION",
  "RELIC_VAULT_PICK"
]);
export type BonusType = z.infer<typeof bonusTypeCanonicalSchema>;

export const bonusTypeShortSchema = z.enum([
  "EMBER_RESPIN",
  "WHEEL_ASCENSION",
  "RELIC_VAULT_PICK"
]);
export type BonusTypeShort = z.infer<typeof bonusTypeShortSchema>;

export const bonusTypeInputSchema = z.union([
  bonusTypeCanonicalSchema,
  bonusTypeShortSchema
]);
export type BonusTypeInput = z.input<typeof bonusTypeInputSchema>;

const bonusTypeAliasToCanonical: Record<BonusTypeInput, BonusType> = {
  EMBER_RESPIN: "EMBER_RESPIN_COLLECTOR_LOCK",
  EMBER_RESPIN_COLLECTOR_LOCK: "EMBER_RESPIN_COLLECTOR_LOCK",
  WHEEL_ASCENSION: "CELESTIAL_WHEEL_ASCENSION",
  CELESTIAL_WHEEL_ASCENSION: "CELESTIAL_WHEEL_ASCENSION",
  RELIC_VAULT_PICK: "RELIC_VAULT_PICK"
};

const bonusTypeCanonicalToShort: Record<BonusType, BonusTypeShort> = {
  EMBER_RESPIN_COLLECTOR_LOCK: "EMBER_RESPIN",
  CELESTIAL_WHEEL_ASCENSION: "WHEEL_ASCENSION",
  RELIC_VAULT_PICK: "RELIC_VAULT_PICK"
};

export function normalizeBonusType(type: BonusTypeInput): BonusType {
  return bonusTypeAliasToCanonical[type];
}

export function toShortBonusType(type: BonusType): BonusTypeShort {
  return bonusTypeCanonicalToShort[type];
}

export const normalizedBonusTypeSchema = bonusTypeInputSchema.transform((type) =>
  normalizeBonusType(type)
);
export const bonusTypeSchema = bonusTypeCanonicalSchema;

export const bonusJackpotAwardSchema = z.object({
  tier: jackpotTierSchema,
  amount: z.number().nonnegative(),
  source: z.string().min(1)
});
export type BonusJackpotAward = z.infer<typeof bonusJackpotAwardSchema>;

export const emberRespinJackpotOrbHitSchema = z.object({
  cell: z.number().int().min(0).max(14),
  tier: jackpotTierSchema
});
export type EmberRespinJackpotOrbHit = z.infer<typeof emberRespinJackpotOrbHitSchema>;

export const emberRespinCollectorLockSessionSchema = z.object({
  type: z.literal("EMBER_RESPIN_COLLECTOR_LOCK"),
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
  type: z.literal("CELESTIAL_WHEEL_ASCENSION"),
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
  value: z.union([z.number().nonnegative(), jackpotTierSchema]).optional()
});
export type RelicVaultBoardSlot = z.infer<typeof relicVaultBoardSlotSchema>;

export const relicVaultPickSessionSchema = z.object({
  type: z.literal("RELIC_VAULT_PICK"),
  keyCount: z.number().int().min(1),
  board: z.array(relicVaultBoardSlotSchema),
  picksAllowed: z.number().int().min(1),
  picksMade: z.number().int().min(0),
  revealed: z.array(z.string().min(1)),
  guaranteedNonBustFirstPick: z.boolean(),
  jackpotTierHits: z.array(jackpotTierSchema),
  finalAward: z.number().nonnegative()
});
export type RelicVaultPickSession = z.infer<typeof relicVaultPickSessionSchema>;

export const bonusSessionSchema = z.discriminatedUnion("type", [
  emberRespinCollectorLockSessionSchema,
  celestialWheelAscensionSessionSchema,
  relicVaultPickSessionSchema
]);
export type BonusSession = z.infer<typeof bonusSessionSchema>;

export const bonusPayloadSchema = z.object({
  type: normalizedBonusTypeSchema,
  sessionId: z.string().min(1),
  revealSeed: z.string().min(1),
  expectedTotalAward: z.number().nonnegative(),
  jackpotTiersHit: z.array(jackpotTierSchema),
  jackpotAwards: z.array(bonusJackpotAwardSchema),
  precomputedOutcome: bonusSessionSchema
});
export type BonusPayload = z.infer<typeof bonusPayloadSchema>;

export function collectBonusSessionJackpotTiers(session: BonusSession): JackpotTier[] {
  if (session.type === "EMBER_RESPIN_COLLECTOR_LOCK") {
    const tiers = new Set<JackpotTier>();
    for (const hit of session.jackpotOrbHits) {
      tiers.add(hit.tier);
    }

    return [...tiers];
  }

  if (session.type === "CELESTIAL_WHEEL_ASCENSION") {
    return [...new Set(session.jackpotTierHits)];
  }

  return [...new Set(session.jackpotTierHits)];
}

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

export const spinResultSchema = z.object({
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
  triggers: triggerFlagsSchema,
  emberLockState: emberLockStateSchema.optional(),
  freeQuestState: freeQuestStateSchema.optional(),
  bonusPayload: bonusPayloadSchema.nullable().optional(),
  signature: z.string().min(16).optional()
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
