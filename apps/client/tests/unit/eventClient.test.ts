import { describe, expect, it } from "vitest";
import { EventClient } from "../../src/game/net/eventClient";

describe("EventClient", () => {
  it("emits a runtime.unavailable event for demo runtime instead of faking a live stream", () => {
    const events: Array<{ type: string; source: string; payload: unknown }> = [];
    const client = new EventClient({ runtimeMode: "serverless" });

    client.connect((event) => {
      events.push({
        type: event.type,
        source: event.source,
        payload: event.payload
      });
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "runtime.unavailable",
      source: "runtime"
    });
    expect(events[0]?.payload).toMatchObject({
      mode: "serverless"
    });
  });
});