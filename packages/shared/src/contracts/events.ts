import { z } from "zod";
import {
  freeGamesModifierSchema,
  jackpotTierSchema,
  normalizedTriggerFlagsSchema,
  volatilityProfileSchema
} from "./api";

const eventBaseSchema = z.object({
  eventId: z.string().min(1),
  sessionId: z.string().min(1),
  occurredAt: z.string().datetime()
});

export const spinRequestedEventSchema = eventBaseSchema.extend({
  type: z.literal("spin.requested"),
  payload: z.object({
    bet: z.number().positive(),
    lines: z.number().int().positive(),
    clientNonce: z.string().min(1),
    volatility: volatilityProfileSchema
  })
});

export const spinResolvedEventSchema = eventBaseSchema.extend({
  type: z.literal("spin.resolved"),
  payload: z.object({
    spinId: z.string().min(1),
    baseWin: z.number().nonnegative(),
    featureWin: z.number().nonnegative(),
    totalWin: z.number().nonnegative(),
    orbCount: z.number().int().min(0),
    scatterCount: z.number().int().min(0),
    triggers: normalizedTriggerFlagsSchema
  })
});

export const holdAndSpinEnteredEventSchema = eventBaseSchema.extend({
  type: z.literal("feature.holdAndSpin.entered"),
  payload: z.object({
    orbCount: z.number().int().min(6),
    minimumRequired: z.literal(6)
  })
});

export const holdAndSpinResolvedEventSchema = eventBaseSchema.extend({
  type: z.literal("feature.holdAndSpin.resolved"),
  payload: z.object({
    totalWin: z.number().nonnegative(),
    orbCount: z.number().int().min(6),
    jackpotHits: z.object({
      mini: z.number().int().min(0),
      minor: z.number().int().min(0),
      major: z.number().int().min(0),
      grand: z.number().int().min(0)
    })
  })
});

export const freeGamesStartedEventSchema = eventBaseSchema.extend({
  type: z.literal("feature.freeGames.started"),
  payload: z.object({
    modifierId: freeGamesModifierSchema,
    awardedGames: z.number().int().positive(),
    triggerScatters: z.number().int().min(3)
  })
});

export const freeGamesRetriggeredEventSchema = eventBaseSchema.extend({
  type: z.literal("feature.freeGames.retriggered"),
  payload: z.object({
    modifierId: freeGamesModifierSchema,
    awardedGames: z.number().int().positive(),
    retriggerCount: z.number().int().min(1),
    chanceUsed: z.number().min(0).max(1)
  })
});

export const freeGamesCompletedEventSchema = eventBaseSchema.extend({
  type: z.literal("feature.freeGames.completed"),
  payload: z.object({
    modifierId: freeGamesModifierSchema,
    totalWin: z.number().nonnegative(),
    retriggerCount: z.number().int().min(0)
  })
});

export const jackpotHitEventSchema = eventBaseSchema.extend({
  type: z.literal("jackpot.hit"),
  payload: z.object({
    tier: jackpotTierSchema,
    amount: z.number().positive()
  })
});

export const domainEventSchema = z.discriminatedUnion("type", [
  spinRequestedEventSchema,
  spinResolvedEventSchema,
  holdAndSpinEnteredEventSchema,
  holdAndSpinResolvedEventSchema,
  freeGamesStartedEventSchema,
  freeGamesRetriggeredEventSchema,
  freeGamesCompletedEventSchema,
  jackpotHitEventSchema
]);

export const emberLockEnteredEventSchema = holdAndSpinEnteredEventSchema;
export const emberLockResolvedEventSchema = holdAndSpinResolvedEventSchema;
export const freeQuestStartedEventSchema = freeGamesStartedEventSchema;
export const freeQuestRetriggeredEventSchema = freeGamesRetriggeredEventSchema;
export const freeQuestCompletedEventSchema = freeGamesCompletedEventSchema;

export type DomainEvent = z.infer<typeof domainEventSchema>;
