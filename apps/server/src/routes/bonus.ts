import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { bonusSessionActionRequestSchema } from "@ember-thrones/shared";
import {
  advanceBonusSession,
  claimBonusSession,
  resumeBonusSession,
} from "../lib/bonusSessions.js";

const paramsWithBonusSessionIdSchema = z.object({
  bonusSessionId: z.string().trim().min(1),
});

const paramsWithSessionIdSchema = z.object({
  sessionId: z.string().trim().min(1),
});

const resumableStatuses = ["PENDING", "ACTIVE", "COMPLETED"] as const;

const buildReference = (session: {
  id: string;
  type: string;
  status: string;
}) => ({
  id: session.id,
  type: session.type,
  status: session.status,
});

const syncSessionBonusState = (
  app: Parameters<FastifyPluginAsync>[0],
  bonusSession: {
    id: string;
    sessionId: string;
    type: string;
    status: string;
    updatedAt: string;
  },
  lastActionType: string
): void => {
  const gameSession = app.db.getSession(bonusSession.sessionId);
  if (!gameSession) {
    return;
  }

  app.db.updateSessionState(gameSession.id, {
    ...gameSession.state,
    activeBonusSessionRef:
      bonusSession.status === "CLAIMED" || bonusSession.status === "EXPIRED"
        ? null
        : buildReference(bonusSession),
    lastBonusSessionRef: buildReference(bonusSession),
    lastBonusActionType: lastActionType,
    lastBonusUpdatedAt: bonusSession.updatedAt,
  });
};

const loadSnapshot = (app: Parameters<FastifyPluginAsync>[0], bonusSessionId: string) => {
  const session = app.db.getBonusSession(bonusSessionId);
  if (!session) {
    return null;
  }

  return {
    session,
    actions: app.db.listBonusActions(bonusSessionId),
  };
};

const bonusRoutes: FastifyPluginAsync = async (app) => {
  app.get("/bonus/session/:sessionId/active", async (request, reply) => {
    const params = paramsWithSessionIdSchema.parse(request.params ?? {});
    const session = app.db.getLatestBonusSessionForGameSession(params.sessionId, [...resumableStatuses]);

    if (!session) {
      return reply.code(404).send({
        message: "No resumable bonus session for game session",
      });
    }

    return loadSnapshot(app, session.id);
  });

  app.get("/bonus/:bonusSessionId", async (request, reply) => {
    const params = paramsWithBonusSessionIdSchema.parse(request.params ?? {});
    const snapshot = loadSnapshot(app, params.bonusSessionId);

    if (!snapshot) {
      return reply.code(404).send({
        message: "Bonus session not found",
      });
    }

    return snapshot;
  });

  app.post("/bonus/:bonusSessionId/resume", async (request, reply) => {
    const params = paramsWithBonusSessionIdSchema.parse(request.params ?? {});
    const snapshot = loadSnapshot(app, params.bonusSessionId);

    if (!snapshot) {
      return reply.code(404).send({
        message: "Bonus session not found",
      });
    }

    try {
      const mutation = resumeBonusSession(snapshot.session);
      const result = app.db.applyBonusSessionAction({
        bonusSessionId: snapshot.session.id,
        actionType: "RESUME",
        requestPayload: {},
        resultPayload: mutation.resultPayload,
        progress: mutation.progress,
        status: mutation.status,
        actualAward: mutation.actualAward,
      });

      syncSessionBonusState(app, result.session, "RESUME");

      app.eventBus.publish("bonus", {
        profileId: result.session.profileId,
        sessionId: result.session.sessionId,
        bonusSessionId: result.session.id,
        actionType: "RESUME",
        status: result.session.status,
      });

      return {
        session: result.session,
        action: result.action,
        actions: app.db.listBonusActions(result.session.id),
      };
    } catch (error) {
      return reply.code(409).send({
        message: error instanceof Error ? error.message : "Failed to resume bonus session",
      });
    }
  });

  app.post("/bonus/:bonusSessionId/actions", async (request, reply) => {
    const params = paramsWithBonusSessionIdSchema.parse(request.params ?? {});
    const body = bonusSessionActionRequestSchema.parse(request.body ?? {});
    const snapshot = loadSnapshot(app, params.bonusSessionId);

    if (!snapshot) {
      return reply.code(404).send({
        message: "Bonus session not found",
      });
    }

    try {
      const mutation = advanceBonusSession(snapshot.session, body.actionType);
      const result = app.db.applyBonusSessionAction({
        bonusSessionId: snapshot.session.id,
        actionType: body.actionType,
        requestPayload: body.clientSelection ? { clientSelection: body.clientSelection } : {},
        resultPayload: mutation.resultPayload,
        progress: mutation.progress,
        status: mutation.status,
        actualAward: mutation.actualAward,
      });

      syncSessionBonusState(app, result.session, body.actionType);

      app.eventBus.publish("bonus", {
        profileId: result.session.profileId,
        sessionId: result.session.sessionId,
        bonusSessionId: result.session.id,
        actionType: body.actionType,
        status: result.session.status,
      });

      return {
        session: result.session,
        action: result.action,
        actions: app.db.listBonusActions(result.session.id),
      };
    } catch (error) {
      return reply.code(409).send({
        message: error instanceof Error ? error.message : "Failed to advance bonus session",
      });
    }
  });

  app.post("/bonus/:bonusSessionId/claim", async (request, reply) => {
    const params = paramsWithBonusSessionIdSchema.parse(request.params ?? {});
    const snapshot = loadSnapshot(app, params.bonusSessionId);

    if (!snapshot) {
      return reply.code(404).send({
        message: "Bonus session not found",
      });
    }

    try {
      const mutation = claimBonusSession(snapshot.session);
      const result = app.db.applyBonusSessionAction({
        bonusSessionId: snapshot.session.id,
        actionType: "CLAIM",
        requestPayload: {},
        resultPayload: mutation.resultPayload,
        progress: mutation.progress,
        status: mutation.status,
        actualAward: mutation.actualAward,
        walletDelta: {
          coinsDelta: mutation.actualAward,
          winsDelta: mutation.actualAward,
        },
      });

      syncSessionBonusState(app, result.session, "CLAIM");

      for (const award of result.session.jackpotAwards) {
        if (award.amount <= 0) {
          continue;
        }

        app.eventBus.publish("jackpot", {
          profileId: result.session.profileId,
          sessionId: result.session.sessionId,
          bonusSessionId: result.session.id,
          tier: award.tier,
          amount: award.amount,
        });
      }

      app.eventBus.publish("bonus", {
        profileId: result.session.profileId,
        sessionId: result.session.sessionId,
        bonusSessionId: result.session.id,
        actionType: "CLAIM",
        status: result.session.status,
        rewardCoins: mutation.actualAward,
      });

      return {
        session: result.session,
        action: result.action,
        actions: app.db.listBonusActions(result.session.id),
        wallet: result.wallet,
      };
    } catch (error) {
      return reply.code(409).send({
        message: error instanceof Error ? error.message : "Failed to claim bonus session",
      });
    }
  });
};

export default bonusRoutes;
