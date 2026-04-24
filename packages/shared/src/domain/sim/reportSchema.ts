import { z } from "zod";
import { freeGamesModifierSchema, volatilityProfileSchema } from "../../contracts/api";

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
    freeGamesModifierId: freeGamesModifierSchema
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
    holdAndSpinTriggers: z.number().int().min(0),
    freeGamesTriggers: z.number().int().min(0),
    freeGamesRetriggers: z.number().int().min(0),
    jackpots: z.object({
      mini: z.number().int().min(0),
      minor: z.number().int().min(0),
      major: z.number().int().min(0),
      grand: z.number().int().min(0)
    })
  }),
  frequencies: z.object({
    anyWin: z.number().min(0).max(1),
    holdAndSpinTrigger: z.number().min(0).max(1),
    freeGamesTrigger: z.number().min(0).max(1),
    freeGamesRetrigger: z.number().min(0).max(1),
    freeGamesRetriggerInFeature: z.number().min(0).max(1)
  }),
  cadence: z.object({
    holdAndSpinEverySpins: cadenceBandSchema,
    freeGamesEverySpins: cadenceBandSchema,
    retriggerChanceInFeature: retriggerCadenceSchema
  }),
  averages: z.object({
    winPerSpin: z.number().nonnegative(),
    winPerHit: z.number().nonnegative()
  })
});

export type SimulationReport = z.infer<typeof simulationReportSchema>;
