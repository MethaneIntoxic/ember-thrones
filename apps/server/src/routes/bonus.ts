import { createHash } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createDefaultProfile } from "../seeds/defaultProfile.js";

type BonusMode = "lantern-pick" | "sky-path" | "wyrm-duel";

interface BonusProgress {
  sessionId: string;
  profileId: string;
  mode: BonusMode;
  seed: string;
  stage: number;
  rewardCoins: number;
  resolved: boolean;
  claimed: boolean;
  history: Array<{
    stage: number;
    action: string;
    reward: number;
  }>;
  updatedAt: string;
}

const activeBonuses = new Map<string, BonusProgress>();

const startBonusBodySchema = z.object({
  sessionId: z.string().trim().min(1),
  profileId: z.string().trim().min(1).optional(),
  mode: z.enum(["lantern-pick", "sky-path", "wyrm-duel"]).default("lantern-pick"),
  seed: z.string().trim().min(4).max(64).optional(),
});

const advanceBonusBodySchema = z.object({
  sessionId: z.string().trim().min(1),
  action: z.string().trim().min(1).max(48),
});

const resolveBonusBodySchema = z.object({
  sessionId: z.string().trim().min(1),
});

const deterministicReward = (seed: string, stage: number, action: string): number => {
  const digest = createHash("sha256")
    .update(`${seed}|${stage}|${action}`)
    .digest();
  const bucket = (digest[0] ?? 0) % 41;
  return 10 + bucket;
};

const bonusRoutes: FastifyPluginAsync = async (app) => {
  app.post("/bonus/start", async (request, reply) => {
    const body = startBonusBodySchema.parse(request.body ?? {});
    const existingSession = app.db.getSession(body.sessionId);

    const profileId = existingSession?.profileId ?? body.profileId;
    if (!profileId) {
      return reply.code(400).send({
        message: "profileId is required when starting bonus for a new session",
      });
    }

    const profile = app.db.ensureProfile(createDefaultProfile({ id: profileId }));
    const session = app.db.upsertSession({
      id: body.sessionId,
      profileId: profile.id,
      volatility: existingSession?.volatility ?? "medium",
      state: existingSession?.state ?? {},
    });

    const seed = body.seed ?? `${body.sessionId}:${session.updatedAt}`;
    const progress: BonusProgress = {
      sessionId: session.id,
      profileId: profile.id,
      mode: body.mode,
      seed,
      stage: 0,
      rewardCoins: 0,
      resolved: false,
      claimed: false,
      history: [],
      updatedAt: new Date().toISOString(),
    };

    activeBonuses.set(session.id, progress);

    app.db.updateSessionState(session.id, {
      ...session.state,
      bonus: {
        mode: progress.mode,
        stage: progress.stage,
        rewardCoins: progress.rewardCoins,
        resolved: progress.resolved,
      },
    });

    app.eventBus.publish("bonus", {
      profileId: profile.id,
      sessionId: session.id,
      action: "started",
      mode: progress.mode,
    });

    return {
      bonus: progress,
    };
  });

  app.post("/bonus/advance", async (request, reply) => {
    const body = advanceBonusBodySchema.parse(request.body ?? {});
    const progress = activeBonuses.get(body.sessionId);

    if (!progress) {
      return reply.code(404).send({
        message: "No active bonus session",
      });
    }

    if (progress.claimed) {
      return reply.code(409).send({
        message: "Bonus already resolved and claimed",
      });
    }

    if (!progress.resolved) {
      const nextStage = progress.stage + 1;
      const reward = deterministicReward(progress.seed, nextStage, body.action);
      const resolved = nextStage >= 3;

      progress.stage = nextStage;
      progress.rewardCoins += reward;
      progress.resolved = resolved;
      progress.updatedAt = new Date().toISOString();
      progress.history.push({
        stage: nextStage,
        action: body.action,
        reward,
      });

      activeBonuses.set(progress.sessionId, progress);
    }

    const session = app.db.getSession(progress.sessionId);
    if (session) {
      app.db.updateSessionState(session.id, {
        ...session.state,
        bonus: {
          mode: progress.mode,
          stage: progress.stage,
          rewardCoins: progress.rewardCoins,
          resolved: progress.resolved,
        },
      });
    }

    return {
      bonus: progress,
    };
  });

  app.post("/bonus/resolve", async (request, reply) => {
    const body = resolveBonusBodySchema.parse(request.body ?? {});
    const progress = activeBonuses.get(body.sessionId);

    if (!progress) {
      return reply.code(404).send({
        message: "No active bonus session",
      });
    }

    if (progress.claimed) {
      return reply.code(409).send({
        message: "Bonus already claimed",
      });
    }

    progress.resolved = true;
    progress.claimed = true;
    progress.updatedAt = new Date().toISOString();

    const updatedWallet = app.db.applyWalletDelta(progress.profileId, {
      coinsDelta: progress.rewardCoins,
      winsDelta: progress.rewardCoins,
    });

    const session = app.db.getSession(progress.sessionId);
    if (session) {
      app.db.updateSessionState(session.id, {
        ...session.state,
        bonus: {
          mode: progress.mode,
          stage: progress.stage,
          rewardCoins: progress.rewardCoins,
          resolved: true,
          claimed: true,
        },
      });
    }

    app.eventBus.publish("bonus", {
      profileId: progress.profileId,
      sessionId: progress.sessionId,
      action: "claimed",
      rewardCoins: progress.rewardCoins,
      mode: progress.mode,
    });

    return {
      sessionId: progress.sessionId,
      profileId: progress.profileId,
      rewardCoins: progress.rewardCoins,
      wallet: updatedWallet,
      bonus: progress,
    };
  });

  app.get("/bonus/:sessionId", async (request, reply) => {
    const sessionId = z.string().trim().min(1).parse((request.params as { sessionId: string }).sessionId);
    const bonus = activeBonuses.get(sessionId);

    if (!bonus) {
      return reply.code(404).send({
        message: "No bonus state for session",
      });
    }

    return {
      bonus,
    };
  });
};

export default bonusRoutes;
