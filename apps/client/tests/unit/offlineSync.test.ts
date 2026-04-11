import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOfflineSpinQueue,
  drainOfflineSpinQueue,
  enqueueOfflineSpin,
  loadOfflineSpinQueue
} from "../../src/game/platform/offlineSync";

describe("offlineSync", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("queues and loads offline spins", () => {
    enqueueOfflineSpin({
      profileId: "local-dragon",
      sessionId: "s1",
      bet: 25,
      linesMode: 20,
      clientNonce: "nonce-1"
    });

    const queue = loadOfflineSpinQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.bet).toBe(25);
  });

  it("drains queue and returns remaining count", async () => {
    enqueueOfflineSpin({
      profileId: "local-dragon",
      sessionId: "s1",
      bet: 25,
      linesMode: 20,
      clientNonce: "nonce-1"
    });

    enqueueOfflineSpin({
      profileId: "local-dragon",
      sessionId: "s1",
      bet: 50,
      linesMode: 20,
      clientNonce: "nonce-2"
    });

    const result = await drainOfflineSpinQueue(async () => ({ ok: true }));

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.remaining).toBe(0);
    expect(loadOfflineSpinQueue()).toHaveLength(0);

    clearOfflineSpinQueue();
  });
});
