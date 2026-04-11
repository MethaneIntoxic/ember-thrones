import { createApp, registerApp } from "./index.js";

const port = Number.parseInt(process.env.PORT ?? "4300", 10);
const host = process.env.HOST ?? "127.0.0.1";

const app = createApp({
  dbFilePath: process.env.DRAGON_LINK_DB_PATH ?? "./data/server.sqlite",
  signatureSecret: process.env.DRAGON_LINK_HMAC_SECRET ?? "dragon-link-local-signing-secret",
  replayTtlMs: Number.parseInt(process.env.DRAGON_LINK_REPLAY_TTL_MS ?? "120000", 10),
});

try {
  await registerApp(app);
  await app.listen({ port, host });
  app.log.info({ port, host }, "Dragon Link server listening");
} catch (error) {
  app.log.error(error, "Failed to start Dragon Link server");
  process.exitCode = 1;
}
