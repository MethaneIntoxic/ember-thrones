import { z } from "zod";
import {
  freeQuestStanceSchema,
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

export const emberLockEnteredEventSchema = eventBaseSchema.extend({
  type: z.literal("feature.emberLock.entered"),
  payload: z.object({
    orbCount: z.number().int().min(6),
    minimumRequired: z.literal(6)
  })
});

export const emberLockResolvedEventSchema = eventBaseSchema.extend({
  type: z.literal("feature.emberLock.resolved"),
  payload: z.object({
    totalWin: z.number().nonnegative(),
    orbCount: z.number().int().min(6),
    jackpotHits: z.object({
      ember: z.number().int().min(0),
      relic: z.number().int().min(0),
      mythic: z.number().int().min(0),
      throne: z.number().int().min(0)
    })
  })
});

export const freeQuestStartedEventSchema = eventBaseSchema.extend({
  type: z.literal("feature.freeQuest.started"),
  payload: z.object({
    stance: freeQuestStanceSchema,
    awardedSpins: z.number().int().positive(),
    triggerScatters: z.number().int().min(3)
  })
});

export const freeQuestRetriggeredEventSchema = eventBaseSchema.extend({
  type: z.literal("feature.freeQuest.retriggered"),
  payload: z.object({
    stance: freeQuestStanceSchema,
    awardedSpins: z.number().int().positive(),
    retriggerCount: z.number().int().min(1),
    chanceUsed: z.number().min(0).max(1)
  })
});

export const freeQuestCompletedEventSchema = eventBaseSchema.extend({
  type: z.literal("feature.freeQuest.completed"),
  payload: z.object({
    stance: freeQuestStanceSchema,
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
  emberLockEnteredEventSchema,
  emberLockResolvedEventSchema,
  freeQuestStartedEventSchema,
  freeQuestRetriggeredEventSchema,
  freeQuestCompletedEventSchema,
  jackpotHitEventSchema
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
