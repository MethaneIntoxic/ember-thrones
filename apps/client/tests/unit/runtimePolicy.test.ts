import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRuntimeCapabilities } from "../../src/game/platform/runtimePolicy";

describe("runtimePolicy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads hybrid env defaults and exposes connected capabilities", () => {
    vi.stubEnv("VITE_RUNTIME_MODE", "hybrid");
    vi.stubEnv("VITE_API_BASE_URL", "https://example.test/api");

    const capabilities = resolveRuntimeCapabilities({ apiMode: "remote" });

    expect(capabilities.configuredMode).toBe("hybrid");
    expect(capabilities.experience).toBe("connected");
    expect(capabilities.network.apiBaseUrl).toBe("https://example.test/api");
    expect(capabilities.network.supportsLiveEvents).toBe(true);
    expect(capabilities.offlineQueue.supported).toBe(true);
    expect(capabilities.offlineQueue.canReplayNow).toBe(true);
  });

  it("reads serverless env defaults and disables replay-only features", () => {
    vi.stubEnv("VITE_RUNTIME_MODE", "serverless");

    const capabilities = resolveRuntimeCapabilities();

    expect(capabilities.configuredMode).toBe("serverless");
    expect(capabilities.experience).toBe("demo");
    expect(capabilities.network.supportsLiveEvents).toBe(false);
    expect(capabilities.offlineQueue.supported).toBe(false);
    expect(capabilities.offlineQueue.canReplayNow).toBe(false);
  });
});