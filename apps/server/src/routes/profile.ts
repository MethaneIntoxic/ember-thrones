import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createDefaultProfile, DEFAULT_PROFILE_ID } from "../seeds/defaultProfile.js";
import { signPayload } from "../lib/signature.js";

const createProfileBodySchema = z.object({
  profileId: z.string().trim().min(1).optional(),
  nickname: z.string().trim().min(1).max(24).optional(),
  coins: z.number().int().min(0).optional(),
  gems: z.number().int().min(0).optional(),
});

const updateWalletBodySchema = z.object({
  coinsDelta: z.number().int().optional(),
  gemsDelta: z.number().int().optional(),
});

const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get("/profile/:profileId", async (request, reply) => {
    const profileId = z.string().trim().min(1).parse((request.params as { profileId: string }).profileId);
    let profile = app.db.getProfile(profileId);

    if (!profile && profileId === DEFAULT_PROFILE_ID) {
      profile = app.db.ensureProfile(createDefaultProfile());
    }

    if (!profile) {
      return reply.code(404).send({
        message: "Profile not found",
      });
    }

    return {
      profile,
    };
  });

  app.post("/profile", async (request) => {
    const body = createProfileBodySchema.parse(request.body ?? {});
    const profileId = body.profileId ?? DEFAULT_PROFILE_ID;

    const profile = app.db.ensureProfile(
      createDefaultProfile({
        id: profileId,
        ...(body.nickname ? { nickname: body.nickname } : {}),
        ...(body.coins !== undefined ? { coins: body.coins } : {}),
        ...(body.gems !== undefined ? { gems: body.gems } : {}),
      }),
    );

    return {
      profile,
    };
  });

  app.get("/wallet/:profileId", async (request, reply) => {
    const profileId = z.string().trim().min(1).parse((request.params as { profileId: string }).profileId);

    const wallet = app.db.getWallet(profileId);
    if (!wallet) {
      return reply.code(404).send({
        message: "Profile wallet not found",
      });
    }

    return {
      profileId,
      wallet,
    };
  });

  app.post("/wallet/:profileId", async (request, reply) => {
    const profileId = z.string().trim().min(1).parse((request.params as { profileId: string }).profileId);
    const body = updateWalletBodySchema.parse(request.body ?? {});

    const exists = app.db.getProfile(profileId);
    if (!exists) {
      return reply.code(404).send({
        message: "Profile not found",
      });
    }

    const wallet = app.db.applyWalletDelta(profileId, {
      ...(body.coinsDelta !== undefined ? { coinsDelta: body.coinsDelta } : {}),
      ...(body.gemsDelta !== undefined ? { gemsDelta: body.gemsDelta } : {}),
    });

    return {
      profileId,
      wallet,
    };
  });

  app.get("/integrity/:profileId/:sessionId", async (request, reply) => {
    const params = z
      .object({
        profileId: z.string().trim().min(1),
        sessionId: z.string().trim().min(1),
      })
      .parse(request.params ?? {});

    const profile = app.db.getProfile(params.profileId);
    if (!profile) {
      return reply.code(404).send({
        message: "Profile not found",
      });
    }

    const wallet = app.db.getWallet(params.profileId);
    const session = app.db.getSession(params.sessionId);

    if (!wallet || !session) {
      return reply.code(404).send({
        message: "Session or wallet not found",
      });
    }

    if (session.profileId !== params.profileId) {
      return reply.code(409).send({
        message: "Session belongs to another profile",
      });
    }

    const payload = {
      profileId: params.profileId,
      sessionId: params.sessionId,
      wallet,
      sessionState: session.state,
      jackpots: app.db.getJackpots(),
    };

    const checksum = signPayload(payload, app.signatureSecret);

    return {
      ...payload,
      checksum,
      generatedAt: new Date().toISOString(),
    };
  });
};

export default profileRoutes;
