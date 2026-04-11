import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { createServerDb, type ServerDb } from "./lib/db.js";
import { EventBus } from "./lib/eventBus.js";
import { ReplayGuard } from "./lib/replayGuard.js";
import bonusRoutes from "./routes/bonus.js";
import configRoutes from "./routes/config.js";
import eventsRoutes from "./routes/events.js";
import profileRoutes from "./routes/profile.js";
import spinRoutes from "./routes/spin.js";

export interface AppFactoryOptions {
  dbFilePath?: string;
  signatureSecret?: string;
  replayTtlMs?: number;
  logger?: FastifyServerOptions["logger"];
}

declare module "fastify" {
  interface FastifyInstance {
    db: ServerDb;
    replayGuard: ReplayGuard;
    eventBus: EventBus;
    signatureSecret: string;
  }
}

export const createApp = (options: AppFactoryOptions = {}): FastifyInstance => {
  const app = Fastify({ logger: options.logger ?? true });

  const db = createServerDb({
    ...(options.dbFilePath ? { filePath: options.dbFilePath } : {}),
  });
  const replayGuard = new ReplayGuard({
    ...(options.replayTtlMs !== undefined ? { ttlMs: options.replayTtlMs } : {}),
  });
  const eventBus = new EventBus();
  const signatureSecret = options.signatureSecret ?? "dragon-link-local-signing-secret";

  app.decorate("db", db);
  app.decorate("replayGuard", replayGuard);
  app.decorate("eventBus", eventBus);
  app.decorate("signatureSecret", signatureSecret);

  app.addHook("onClose", async () => {
    replayGuard.dispose();
    db.close();
  });

  return app;
};

export const registerApp = async (app: FastifyInstance): Promise<void> => {
  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
  });

  await app.register(profileRoutes);
  await app.register(spinRoutes);
  await app.register(bonusRoutes);
  await app.register(configRoutes);
  await app.register(eventsRoutes);

  app.get("/health", async () => {
    return {
      ok: true,
      ts: new Date().toISOString(),
    };
  });
};
