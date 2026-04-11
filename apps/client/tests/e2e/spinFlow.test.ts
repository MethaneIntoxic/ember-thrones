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
  let spinCall = 0;
  const spinResponses = [
    {
      spinId: "spin-1",
      reels: [
        ["SCT", "DRG", "ORB"],
        ["SCT", "DRG", "CHS"],
        ["SCT", "DRG", "RNE"],
        ["DRG", "ORB", "CRN"],
        ["WLD", "CHS", "ORB"]
      ],
      wins: [{ kind: "line", amount: 140, detail: "Row 2 DRAGON x5" }],
      triggers: {
        emberLock: false,
        freeQuest: false
      },
      triggerFlags: {
        emberRespin: false,
        wheelAscension: true,
        relicVaultPick: false,
        freeQuest: false
      },
      bonusPayload: {
        type: "WHEEL_ASCENSION",
        sessionId: "bonus-wheel-1",
        revealSeed: "seed-wheel-1",
        expectedTotalAward: 260,
        precomputedOutcome: {
          awardedSpins: 3,
          maxSpins: 5,
          wedgeMap: [
            { wedgeId: "coin-1", kind: "coin", value: 90 },
            { wedgeId: "mult-2", kind: "multiplier", value: 2 }
          ],
          outcomesBySpin: [{ wedgeId: "coin-1", resolvedAward: 140 }]
        },
        jackpotAwards: []
      },
      bonusState: {},
      totalWin: 140,
      updatedWallet: {
        coins: 5115,
        gems: 20,
        lifetimeSpins: 1,
        lifetimeWins: 140
      },
      jackpotLadder: {
        ember: 1210,
        relic: 3810,
        mythic: 9510,
        throne: 28010
      }
    },
    {
      spinId: "spin-2",
      reels: [
        ["CHS", "DRG", "ORB"],
        ["CHS", "RNE", "SCT"],
        ["CHS", "CRN", "ORB"],
        ["WLD", "DRG", "RNE"],
        ["ORB", "CHS", "DRG"]
      ],
      wins: [{ kind: "line", amount: 80, detail: "Row 1 CHEST x3" }],
      triggers: {
        emberLock: false,
        freeQuest: false
      },
      triggerFlags: {
        emberRespin: false,
        wheelAscension: false,
        relicVaultPick: true,
        freeQuest: false
      },
      bonusPayload: null,
      bonusState: {},
      totalWin: 80,
      updatedWallet: {
        coins: 5170,
        gems: 20,
        lifetimeSpins: 2,
        lifetimeWins: 220
      },
      jackpotLadder: {
        ember: 1215,
        relic: 3818,
        mythic: 9518,
        throne: 28018
      }
    },
    {
      spinId: "spin-3",
      reels: [
        ["DRG", "ORB", "SCT"],
        ["RNE", "CRN", "CHS"],
        ["ORB", "RNE", "WLD"],
        ["CRN", "CHS", "DRG"],
        ["RNE", "ORB", "CHS"]
      ],
      wins: [],
      triggers: {
        emberLock: false,
        freeQuest: false
      },
      triggerFlags: {
        emberRespin: false,
        wheelAscension: false,
        relicVaultPick: false,
        freeQuest: false
      },
      bonusPayload: null,
      bonusState: {},
      totalWin: 0,
      updatedWallet: {
        coins: 5145,
        gems: 20,
        lifetimeSpins: 3,
        lifetimeWins: 220
      },
      jackpotLadder: {
        ember: 1220,
        relic: 3826,
        mythic: 9526,
        throne: 28026
      }
    }
  ];

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
      const response = spinResponses[Math.min(spinCall, spinResponses.length - 1)];
      spinCall += 1;
      return jsonResponse(response);
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
      ["DRG", "ORB", "SCT"],
      ["CHS", "RNE", "CRN"],
      ["DRG", "WLD", "ORB"],
      ["SCT", "CHS", "RNE"],
      ["CRN", "DRG", "ORB"]
    ],
    winLines: [],
    lastWin: 0,
    bet: 25,
    spinning: false,
    online: true,
    queuedSpins: 0,
    apiMode: "remote",
    activeBonus: null,
    bonusSessions: [],
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

  it("tracks bonus sessions from spin payloads, trigger flags fallback, and server events", async () => {
    await useGameStore.getState().bootstrap();

    await useGameStore.getState().spin();

    let state = useGameStore.getState();
    expect(state.profile?.playerId).toBe("local-dragon");
    expect(state.activeBonus?.type).toBe("WHEEL_ASCENSION");
    expect(state.activeBonus?.source).toBe("spin");
    expect(state.activeBonus?.expectedTotalAward).toBeGreaterThan(0);
    expect(state.bonusSessions).toHaveLength(1);
    expect(state.progression.forgeMeter).toBeGreaterThan(0);

    await useGameStore.getState().spin();

    state = useGameStore.getState();
    expect(state.activeBonus?.type).toBe("RELIC_VAULT");
    expect(state.activeBonus?.source).toBe("spin");
    expect(state.activeBonus?.sessionId).toContain("spin-2");
    expect(state.bonusSessions).toHaveLength(2);

    await useGameStore.getState().spin();

    state = useGameStore.getState();
    expect(state.activeBonus).toBeNull();
    expect(state.bonusSessions).toHaveLength(2);

    useGameStore.getState().consumeServerEvent({
      type: "bonus",
      ts: Date.now(),
      payload: {
        bonusPayload: {
          type: "EMBER_RESPIN",
          sessionId: "event-ember-1",
          revealSeed: "seed-event-ember",
          expectedTotalAward: 330,
          precomputedOutcome: {
            lockedCells: [0, 2, 4, 5],
            respinsRemaining: 2,
            collectorMultiplier: 2
          },
          jackpotAwards: [{ tier: "ember", amount: 1250, source: "event" }]
        }
      }
    });

    state = useGameStore.getState();
    expect(state.activeBonus?.type).toBe("EMBER_RESPIN");
    expect(state.activeBonus?.source).toBe("event");
    expect(state.bonusSessions).toHaveLength(3);
    expect(state.bonusSessions[0]?.sessionId).toBe("event-ember-1");

    useGameStore.getState().dismissBonus();
    expect(useGameStore.getState().activeBonus).toBeNull();
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
