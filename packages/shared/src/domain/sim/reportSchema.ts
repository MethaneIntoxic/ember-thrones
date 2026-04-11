import { z } from "zod";
import { freeQuestStanceSchema, volatilityProfileSchema } from "../../contracts/api";

const cadenceBandSchema = z.object({
  observed: z.number().positive().nullable(),
  targetMin: z.number().positive(),
  targetMax: z.number().positive(),
  inRange: z.boolean()
});

const retriggerCadenceSchema = z.object({
  observed: z.number().min(0).max(1).nullable(),
  targetMin: z.number().min(0).max(1),
  targetMax: z.number().min(0).max(1),
  inRange: z.boolean()
});

export const simulationReportSchema = z.object({
  config: z.object({
    spins: z.number().int().positive(),
    betPerSpin: z.number().positive(),
    seed: z.union([z.number(), z.string()]),
    volatility: volatilityProfileSchema,
    freeQuestStance: freeQuestStanceSchema
  }),
  totals: z.object({
    totalBet: z.number().nonnegative(),
    baseWin: z.number().nonnegative(),
    featureWin: z.number().nonnegative(),
    totalWin: z.number().nonnegative(),
    rtp: z.number().nonnegative()
  }),
  counters: z.object({
    spinsWithWin: z.number().int().min(0),
    emberLockTriggers: z.number().int().min(0),
    freeQuestTriggers: z.number().int().min(0),
    freeQuestRetriggers: z.number().int().min(0),
    jackpots: z.object({
      ember: z.number().int().min(0),
      relic: z.number().int().min(0),
      mythic: z.number().int().min(0),
      throne: z.number().int().min(0)
    })
  }),
  frequencies: z.object({
    anyWin: z.number().min(0).max(1),
    emberLockTrigger: z.number().min(0).max(1),
    freeQuestTrigger: z.number().min(0).max(1),
    freeQuestRetrigger: z.number().min(0).max(1),
    freeQuestRetriggerInFeature: z.number().min(0).max(1)
  }),
  cadence: z.object({
    emberLockEverySpins: cadenceBandSchema,
    freeQuestEverySpins: cadenceBandSchema,
    retriggerChanceInFeature: retriggerCadenceSchema
  }),
  averages: z.object({
    winPerSpin: z.number().nonnegative(),
    winPerHit: z.number().nonnegative()
  })
});

export type SimulationReport = z.infer<typeof simulationReportSchema>;
