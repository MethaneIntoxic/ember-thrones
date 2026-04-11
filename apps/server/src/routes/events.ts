import type { FastifyPluginAsync } from "fastify";
import type { ServerEvent } from "../lib/eventBus.js";

const eventsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/events", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const writeEvent = (eventName: string, payload: unknown): void => {
      if (reply.raw.writableEnded) {
        return;
      }

      reply.raw.write(`event: ${eventName}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    writeEvent("connected", {
      ts: new Date().toISOString(),
      message: "SSE stream connected",
    });

    const unsubscribe = app.eventBus.subscribe((event: ServerEvent) => {
      writeEvent(event.type, event);
    });

    const heartbeat = setInterval(() => {
      writeEvent("ping", { ts: new Date().toISOString() });
    }, 15_000);
    heartbeat.unref();

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();

      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    });
  });
};

export default eventsRoutes;
