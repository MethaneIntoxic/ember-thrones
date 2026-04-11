import { beforeEach, describe, expect, it, vi } from "vitest";

let useGameStore: typeof import("../../src/game/state/store").useGameStore;
let clearOfflineSpinQueue: typeof import("../../src/game/platform/offlineSync").clearOfflineSpinQueue;
let loadOfflineSpinQueue: typeof import("../../src/game/platform/offlineSync").loadOfflineSpinQueue;

interface FetchJsonResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

const defaultJackpot = {
  ember: 1200,
  relic: 3800,
  mythic: 9500,
  throne: 28000
};

function jsonResponse(payload: unknown, status = 200): FetchJsonResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function mockFetchForOnlineFlow(): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.endsWith("/profile")) {
      return jsonResponse({
        profile: {
          id: "local-dragon",
          nickname: "Wyrm Tamer",
          level: 12,
          coins: 5000,
          gems: 20,
          lifetimeSpins: 0,
          lifetimeWins: 0
        }
      });
    }

    if (url.endsWith("/config")) {
      return jsonResponse({
        minBet: 10,
        maxBet: 500,
        defaultBet: 25,
        jackpotLadder: defaultJackpot
      });
    }

    if (url.endsWith("/spin")) {
      return jsonResponse({
        spinId: `spin-${Date.now()}`,
        reels: [
          ["ORB", "DRG", "QST"],
          ["ORB", "DRG", "QST"],
          ["ORB", "DRG", "QST"],
          ["ORB", "DRG", "QST"],
          ["ORB", "DRG", "QST"]
        ],
        wins: [
          { kind: "line", amount: 120, detail: "Row 1 DRAGON x5" }
        ],
        triggers: {
          emberLock: true,
          freeQuest: true
        },
        bonusState: {
          emberLock: {
            active: true,
            lockedCells: [0, 3, 6, 9, 12, 1],
            respinsRemaining: 3
          },
          freeQuest: {
            active: true,
            spinsRemaining: 10,
            retriggerChance: 0.2
          }
        },
        totalWin: 120,
        updatedWallet: {
          coins: 5095,
          gems: 20,
          lifetimeSpins: 1,
          lifetimeWins: 120
        },
        jackpotLadder: {
          ember: 1210,
          relic: 3810,
          mythic: 9510,
          throne: 28010
        }
      });
    }

    return jsonResponse({}, 404);
  });

  vi.stubGlobal("fetch", fetchMock);
}

async function loadClientStateModules(): Promise<void> {
  vi.resetModules();
  vi.stubEnv("VITE_RUNTIME_MODE", "hybrid");

  const [{ useGameStore: store }, offlineSync] = await Promise.all([
    import("../../src/game/state/store"),
    import("../../src/game/platform/offlineSync")
  ]);

  useGameStore = store;
  clearOfflineSpinQueue = offlineSync.clearOfflineSpinQueue;
  loadOfflineSpinQueue = offlineSync.loadOfflineSpinQueue;
}

function resetStore(): void {
  useGameStore.setState({
    sessionId: `sess-${Date.now()}`,
    profile: null,
    config: null,
    wallet: {
      coins: 2500,
      gems: 25,
      lifetimeSpins: 0,
      lifetimeWins: 0
    },
    jackpotLadder: { ...defaultJackpot },
    emberLock: {
      active: false,
      lockedCells: 0,
      respinsRemaining: 0
    },
    freeQuest: {
      active: false,
      spinsRemaining: 0,
      retriggers: 0
    },
    progression: {
      forgeMeter: 0,
      relicShards: 0,
      dailyQuestProgress: 0
    },
    reels: [
      ["DRG", "ORB", "QST"],
      ["BLD", "RNG", "JWL"],
      ["DRG", "WLD", "ORB"],
      ["QST", "BLD", "RNG"],
      ["JWL", "DRG", "ORB"]
    ],
    winLines: [],
    lastWin: 0,
    bet: 25,
    spinning: false,
    online: true,
    queuedSpins: 0,
    apiMode: "remote",
    activeMiniGame: "lantern-pick",
    error: undefined
  });
}

describe("slot e2e store flow", () => {
  beforeEach(async () => {
    await loadClientStateModules();
    resetStore();
    clearOfflineSpinQueue();
    vi.restoreAllMocks();
    mockFetchForOnlineFlow();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true
    });
  });

  it("runs bootstrap -> spin -> mini-game reward progression", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.01);

    await useGameStore.getState().bootstrap();
    await useGameStore.getState().spin();

    const afterSpin = useGameStore.getState();
    expect(afterSpin.profile?.playerId).toBe("local-dragon");
    expect(afterSpin.emberLock.active).toBe(true);
    expect(afterSpin.freeQuest.active).toBe(true);
    expect(afterSpin.activeMiniGame).not.toBe("none");
    expect(afterSpin.progression.forgeMeter).toBeGreaterThan(0);

    useGameStore.getState().awardMiniGameReward(180, 2);
    const afterReward = useGameStore.getState();
    expect(afterReward.wallet.coins).toBeGreaterThan(afterSpin.wallet.coins);
    expect(afterReward.progression.relicShards).toBeGreaterThan(0);

    randomSpy.mockRestore();
  });

  it("queues offline spin then resumes and drains queue", async () => {
    await useGameStore.getState().bootstrap();

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false
    });

    await useGameStore.getState().spin();
    expect(loadOfflineSpinQueue().length).toBe(1);
    expect(useGameStore.getState().queuedSpins).toBe(1);

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true
    });

    await useGameStore.getState().syncOfflineQueue();

    expect(loadOfflineSpinQueue().length).toBe(0);
    expect(useGameStore.getState().queuedSpins).toBe(0);
    expect(useGameStore.getState().wallet.lifetimeSpins).toBeGreaterThan(0);
  });
});
