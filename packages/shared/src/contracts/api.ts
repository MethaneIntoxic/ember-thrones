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
  freeQuest: z.boolean()
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
