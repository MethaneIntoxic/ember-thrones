import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  advanceBonusSession,
  claimBonusSession,
  resumeBonusSession,
  serializeBonusSessionSnapshot,
} from "../lib/bonusSessions.js";
import type { BonusSessionRecord } from "../lib/db.js";
import type { ServerBonusAdvanceActionType, ServerBonusType } from "../lib/slotRuntime.js";

const paramsWithBonusSessionIdSchema = z.object({
  bonusSessionId: z.string().trim().min(1),
});

const paramsWithSessionIdSchema = z.object({
  sessionId: z.string().trim().min(1),
});

const bonusActionSchema = z.object({
  actionType: z.enum(["RESPIN", "WHEEL_STOP", "PICK", "FREE_SPIN"]),
  clientSelection: z.record(z.unknown()).optional(),
});

const resumableStatuses = ["PENDING", "ACTIVE", "COMPLETED"] as const;

const expectedActionByType: Record<ServerBonusType, ServerBonusAdvanceActionType> = {
  EMBER_RESPIN: "RESPIN",
  FREE_SPINS: "FREE_SPIN",
  RELIC_VAULT_PICK: "PICK",
  WHEEL_ASCENSION: "WHEEL_STOP",
};

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
  lastActionType: string,
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

const advanceSession = (
  app: Parameters<FastifyPluginAsync>[0],
  snapshot: { session: BonusSessionRecord },
  actionType: ServerBonusAdvanceActionType,
  clientSelection?: Record<string, unknown>,
) => {
  const expectedAction = expectedActionByType[snapshot.session.type];
  if (expectedAction !== actionType) {
    throw new Error(`Session type ${snapshot.session.type} does not support ${actionType}`);
  }

  const mutation = advanceBonusSession(snapshot.session, actionType);
  const result = app.db.applyBonusSessionAction({
    bonusSessionId: snapshot.session.id,
    actionType,
    requestPayload: clientSelection ? { clientSelection } : {},
    resultPayload: mutation.resultPayload,
    progress: mutation.progress,
    status: mutation.status,
    actualAward: mutation.actualAward,
  });

  syncSessionBonusState(app, result.session, actionType);

  app.eventBus.publish("bonus", {
    profileId: result.session.profileId,
    sessionId: result.session.sessionId,
    bonusSessionId: result.session.id,
    bonusType: result.session.type,
    actionType,
    status: result.session.status,
  });

  return serializeBonusSessionSnapshot({
    session: result.session,
    actions: app.db.listBonusActions(result.session.id),
    action: result.action,
    wallet: result.wallet,
  });
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

    return serializeBonusSessionSnapshot({
      session,
      actions: app.db.listBonusActions(session.id),
    });
  });

  app.get("/bonus/:bonusSessionId", async (request, reply) => {
    const params = paramsWithBonusSessionIdSchema.parse(request.params ?? {});
    const snapshot = loadSnapshot(app, params.bonusSessionId);

    if (!snapshot) {
      return reply.code(404).send({
        message: "Bonus session not found",
      });
    }

    return serializeBonusSessionSnapshot({
      session: snapshot.session,
      actions: snapshot.actions,
    });
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
        bonusType: result.session.type,
        actionType: "RESUME",
        status: result.session.status,
      });

      return serializeBonusSessionSnapshot({
        session: result.session,
        actions: app.db.listBonusActions(result.session.id),
        action: result.action,
        wallet: result.wallet,
      });
    } catch (error) {
      return reply.code(409).send({
        message: error instanceof Error ? error.message : "Failed to resume bonus session",
      });
    }
  });

  app.post("/bonus/:bonusSessionId/hold-and-spin/step", async (request, reply) => {
    const params = paramsWithBonusSessionIdSchema.parse(request.params ?? {});
    const snapshot = loadSnapshot(app, params.bonusSessionId);

    if (!snapshot) {
      return reply.code(404).send({ message: "Bonus session not found" });
    }

    try {
      return advanceSession(app, snapshot, "RESPIN");
    } catch (error) {
      return reply.code(409).send({
        message: error instanceof Error ? error.message : "Failed to advance hold-and-spin session",
      });
    }
  });

  app.post("/bonus/:bonusSessionId/free-spins/step", async (request, reply) => {
    const params = paramsWithBonusSessionIdSchema.parse(request.params ?? {});
    const snapshot = loadSnapshot(app, params.bonusSessionId);

    if (!snapshot) {
      return reply.code(404).send({ message: "Bonus session not found" });
    }

    try {
      return advanceSession(app, snapshot, "FREE_SPIN");
    } catch (error) {
      return reply.code(409).send({
        message: error instanceof Error ? error.message : "Failed to advance free-spins session",
      });
    }
  });

  app.post("/bonus/:bonusSessionId/wheel/step", async (request, reply) => {
    const params = paramsWithBonusSessionIdSchema.parse(request.params ?? {});
    const snapshot = loadSnapshot(app, params.bonusSessionId);

    if (!snapshot) {
      return reply.code(404).send({ message: "Bonus session not found" });
    }

    try {
      return advanceSession(app, snapshot, "WHEEL_STOP");
    } catch (error) {
      return reply.code(409).send({
        message: error instanceof Error ? error.message : "Failed to advance wheel session",
      });
    }
  });

  app.post("/bonus/:bonusSessionId/actions", async (request, reply) => {
    const params = paramsWithBonusSessionIdSchema.parse(request.params ?? {});
    const body = bonusActionSchema.parse(request.body ?? {});
    const snapshot = loadSnapshot(app, params.bonusSessionId);

    if (!snapshot) {
      return reply.code(404).send({
        message: "Bonus session not found",
      });
    }

    try {
      return advanceSession(app, snapshot, body.actionType, body.clientSelection);
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
      const jackpotEvents = snapshot.session.jackpotAwards
        .filter((award) => award.amount > 0)
        .map((award) => ({
          tier: award.tier,
          eventType: "CLAIMED" as const,
          amount: award.amount,
          profileId: snapshot.session.profileId,
          sessionId: snapshot.session.sessionId,
          spinId: snapshot.session.spinId,
          bonusSessionId: snapshot.session.id,
          mathProfileVersionId: snapshot.session.mathProfileVersionId,
        }));

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
        ...(jackpotEvents.length > 0 ? { jackpotEvents } : {}),
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
        bonusType: result.session.type,
        actionType: "CLAIM",
        status: result.session.status,
        rewardCoins: mutation.actualAward,
      });

      return serializeBonusSessionSnapshot({
        session: result.session,
        actions: app.db.listBonusActions(result.session.id),
        action: result.action,
        wallet: result.wallet,
      });
    } catch (error) {
      return reply.code(409).send({
        message: error instanceof Error ? error.message : "Failed to claim bonus session",
      });
    }
  });
};

export default bonusRoutes;

