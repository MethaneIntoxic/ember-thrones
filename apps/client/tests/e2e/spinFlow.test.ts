import { beforeEach, describe, expect, it, vi } from "vitest";

let useGameStore: typeof import("../../src/game/state/store").useGameStore;
let clearOfflineSpinQueue: typeof import("../../src/game/platform/offlineSync").clearOfflineSpinQueue;
let loadOfflineSpinQueue: typeof import("../../src/game/platform/offlineSync").loadOfflineSpinQueue;
let buildWagerProfile: typeof import("../../src/game/net/apiClient").buildWagerProfile;
let defaultMathConfig: typeof import("../../src/game/net/apiClient").DEFAULT_BASE_GAME_MATH_CONFIG;

interface FetchJsonResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

const defaultJackpot = {
  mini: 1200,
  minor: 3800,
  major: 9500,
  grand: 28000
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
        ["orb", "dragon", "orb"],
        ["orb", "coin", "lantern"],
        ["dragon", "orb", "ingot"],
        ["scatter", "orb", "dragon"],
        ["wild", "coin", "orb"]
      ],
      lineWins: [{ lineIndex: 2, amount: 140 }],
      totalWin: 140,
      triggers: {
        holdAndSpin: true,
        freeGames: false
      },
      holdAndSpinState: {
        active: true,
        lockedCount: 6,
        respinsRemaining: 3
      },
      freeGamesState: {
        active: false,
        gamesRemaining: 0,
        retriggerCount: 0,
        modifierId: "ROYALS_REMOVED"
      },
      bonusPayload: {
        type: "HOLD_AND_SPIN",
        sessionId: "bonus-hold-1",
        revealSeed: "seed-hold-1",
        gameVariantId: "dragon-link-flagship",
        freeGamesModifierId: "ROYALS_REMOVED",
        expectedTotalAward: 260,
        jackpotTiersHit: ["mini"],
        jackpotAwards: [{ tier: "mini", amount: 1210, source: "spin" }],
        precomputedOutcome: {
          startingOrbs: [
            { position: 0, coinValue: 25 },
            { position: 1, coinValue: 25 },
            { position: 2, coinValue: 50 },
            { position: 3, coinValue: 25 },
            { position: 4, coinValue: 25 },
            { position: 5, jackpotTier: "mini" }
          ],
          steps: [
            {
              respinIndex: 1,
              respinsRemainingAfter: 3,
              landedOrbs: [{ position: 7, coinValue: 50 }]
            }
          ],
          respinsRemaining: 2
        }
      },
      wallet: {
        coins: 5115,
        gems: 20,
        lifetimeSpins: 1,
        lifetimeWins: 140
      },
      jackpotLadder: {
        mini: 1210,
        minor: 3810,
        major: 9510,
        grand: 28010
      }
    },
    {
      spinId: "spin-2",
      reels: [
        ["scatter", "dragon", "orb"],
        ["scatter", "coin", "scatter"],
        ["scatter", "ingot", "orb"],
        ["wild", "dragon", "lantern"],
        ["coin", "scatter", "dragon"]
      ],
      lineWins: [{ lineIndex: 0, amount: 80 }],
      totalWin: 80,
      triggers: {
        holdAndSpin: false,
        freeGames: true
      },
      holdAndSpinState: {
        active: false,
        lockedCount: 0,
        respinsRemaining: 0
      },
      freeGamesState: {
        active: true,
        gamesRemaining: 10,
        retriggerCount: 1,
        modifierId: "EXPANDING_WILD_REELS"
      },
      bonusPayload: {
        type: "FREE_GAMES",
        sessionId: "bonus-free-2",
        revealSeed: "seed-free-2",
        gameVariantId: "dragon-link-flagship",
        freeGamesModifierId: "EXPANDING_WILD_REELS",
        expectedTotalAward: 320,
        jackpotTiersHit: [],
        jackpotAwards: [],
        precomputedOutcome: {
          modifierId: "EXPANDING_WILD_REELS",
          initialGames: 10,
          totalAwardedGames: 12,
          retriggerCount: 1,
          steps: [
            {
              spinIndex: 1,
              awardedWin: 80,
              lineWin: 60,
              scatterCount: 3,
              awardedExtraGames: 2,
              gamesRemainingAfter: 11
            },
            {
              spinIndex: 2,
              awardedWin: 65,
              lineWin: 40,
              scatterCount: 1,
              awardedExtraGames: 0,
              gamesRemainingAfter: 10
            }
          ]
        }
      },
      wallet: {
        coins: 5170,
        gems: 20,
        lifetimeSpins: 2,
        lifetimeWins: 220
      },
      jackpotLadder: {
        mini: 1215,
        minor: 3818,
        major: 9518,
        grand: 28018
      }
    },
    {
      spinId: "spin-3",
      reels: [
        ["dragon", "coin", "orb"],
        ["lantern", "ace", "king"],
        ["orb", "queen", "wild"],
        ["jack", "coin", "dragon"],
        ["king", "orb", "ingot"]
      ],
      lineWins: [],
      totalWin: 0,
      triggers: {
        holdAndSpin: false,
        freeGames: false
      },
      holdAndSpinState: {
        active: false,
        lockedCount: 0,
        respinsRemaining: 0
      },
      freeGamesState: {
        active: false,
        gamesRemaining: 0,
        retriggerCount: 0,
        modifierId: "ROYALS_REMOVED"
      },
      bonusPayload: null,
      wallet: {
        coins: 5145,
        gems: 20,
        lifetimeSpins: 3,
        lifetimeWins: 220
      },
      jackpotLadder: {
        mini: 1220,
        minor: 3826,
        major: 9526,
        grand: 28026
      }
    }
  ];

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.endsWith("/profile/local-dragon")) {
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
        geometry: {
          reels: 5,
          rows: 3,
          paylines: 50
        },
        denominationLadder: [1, 2, 5],
        creditsPerSpinOptions: [10, 25, 50, 75, 100],
        defaultWager: {
          denomination: 1,
          creditsPerSpin: 25
        },
        supportedSpeedModes: ["normal", "turbo", "auto"],
        jackpotLadder: defaultJackpot,
        gameVariant: {
          id: "dragon-link-flagship",
          label: "Prosperity Link",
          cabinetLabel: "Prosperity Cabinet",
          theme: "Dragon Link-inspired cabinet",
          freeGamesModifierId: "ROYALS_REMOVED"
        }
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

async function loadClientStateModules(runtimeMode: "hybrid" | "serverless" = "hybrid"): Promise<void> {
  vi.resetModules();
  vi.stubEnv("VITE_RUNTIME_MODE", runtimeMode);

  const [{ useGameStore: store }, offlineSync, apiClient] = await Promise.all([
    import("../../src/game/state/store"),
    import("../../src/game/platform/offlineSync"),
    import("../../src/game/net/apiClient")
  ]);

  useGameStore = store;
  clearOfflineSpinQueue = offlineSync.clearOfflineSpinQueue;
  loadOfflineSpinQueue = offlineSync.loadOfflineSpinQueue;
  buildWagerProfile = apiClient.buildWagerProfile;
  defaultMathConfig = apiClient.DEFAULT_BASE_GAME_MATH_CONFIG;
}

function resetStore(): void {
  const initialWager = buildWagerProfile(defaultMathConfig, {
    denomination: defaultMathConfig.defaultDenomination,
    creditsPerSpin: defaultMathConfig.defaultCreditsPerSpin,
    speedMode: "normal"
  });

  useGameStore.setState({
    sessionId: `sess-${Date.now()}`,
    profile: null,
    config: {
      minBet: 10,
      maxBet: 500,
      defaultBet: 25,
      jackpotLadder: { ...defaultJackpot },
      mathConfig: { ...defaultMathConfig },
      gameVariant: {
        id: "dragon-link-flagship",
        label: "Prosperity Link",
        cabinetLabel: "Prosperity Cabinet",
        theme: "Dragon Link-inspired cabinet",
        freeGamesModifierId: "ROYALS_REMOVED"
      }
    },
    mathConfig: { ...defaultMathConfig },
    wager: initialWager,
    wallet: {
      coins: 2500,
      gems: 25,
      lifetimeSpins: 0,
      lifetimeWins: 0
    },
    jackpotLadder: { ...defaultJackpot },
    holdAndSpin: {
      active: false,
      lockedCount: 0,
      respinsRemaining: 0
    },
    freeGames: {
      active: false,
      gamesRemaining: 0,
      retriggers: 0,
      modifierId: "ROYALS_REMOVED"
    },
    reels: [
      ["dragon", "orb", "scatter"],
      ["coin", "lantern", "ingot"],
      ["dragon", "wild", "orb"],
      ["scatter", "coin", "lantern"],
      ["ingot", "dragon", "orb"]
    ],
    winLines: [],
    lastWin: 0,
    bet: initialWager.totalBet,
    spinning: false,
    online: true,
    queuedSpins: 0,
    strandedQueuedSpins: 0,
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

  it("applies denomination, credits, speed, and max-bet qualification before tracking feature sessions", async () => {
    await useGameStore.getState().bootstrap();

    let state = useGameStore.getState();
    expect(state.mathConfig.fixedLines).toBe(50);
    expect(state.wager.denomination).toBe(1);
    expect(state.wager.creditsPerSpin).toBe(25);
    expect(state.wager.qualifiesForProgressive).toBe(false);

    state.setDenomination(5);
    state.setCreditsPerSpin(100);
    state.setSpeedMode("turbo");

    state = useGameStore.getState();
    expect(state.wager.totalBet).toBe(500);
    expect(state.wager.speedMode).toBe("turbo");
    expect(state.wager.isMaxBet).toBe(true);
    expect(state.wager.qualifiesForProgressive).toBe(true);

    await state.spin();

    state = useGameStore.getState();
    expect(state.profile?.playerId).toBe("local-dragon");
    expect(state.activeBonus?.type).toBe("HOLD_AND_SPIN");
    expect(state.activeBonus?.source).toBe("spin");
    expect(state.activeBonus?.transport).toBe("streamed");
    expect(state.activeBonus?.featureSession.steps.length).toBeGreaterThan(0);
    expect(state.activeBonus?.featureSession.metrics[0]?.label).toBe("Locked Orbs");
    expect(state.bonusSessions).toHaveLength(1);

    await useGameStore.getState().spin();

    state = useGameStore.getState();
    expect(state.activeBonus?.type).toBe("FREE_GAMES");
    expect(state.activeBonus?.transport).toBe("streamed");
    expect(state.activeBonus?.featureSession.summaryLabel).toContain("free-spin");
    expect(state.activeBonus?.freeGamesModifierId).toBe("EXPANDING_WILD_REELS");
    expect(state.bonusSessions).toHaveLength(2);

    await useGameStore.getState().spin();

    state = useGameStore.getState();
    expect(state.activeBonus).toBeNull();
    expect(state.bonusSessions).toHaveLength(2);

    useGameStore.getState().setMaxBet();
    state = useGameStore.getState();
    expect(state.wager.isMaxBet).toBe(true);
    expect(state.bet).toBe(500);
  });

  it("tracks server bonus events with streamed transport and allows dismissal", async () => {
    await useGameStore.getState().bootstrap();

    useGameStore.getState().consumeServerEvent({
      type: "bonus",
      ts: Date.now(),
      source: "server",
      payload: {
        bonusPayload: {
          type: "HOLD_AND_SPIN",
          sessionId: "event-hold-1",
          revealSeed: "seed-event-hold",
          gameVariantId: "dragon-link-flagship",
          freeGamesModifierId: "ROYALS_REMOVED",
          expectedTotalAward: 330,
          precomputedOutcome: {
            startingOrbs: [
              { position: 0, coinValue: 25 },
              { position: 2, coinValue: 50 },
              { position: 4, coinValue: 75 },
              { position: 5, jackpotTier: "mini" }
            ],
            respinsRemaining: 2,
            steps: [
              {
                respinIndex: 1,
                respinsRemainingAfter: 2,
                landedOrbs: [{ position: 6, coinValue: 50 }]
              }
            ]
          },
          jackpotAwards: [{ tier: "mini", amount: 1250, source: "event" }]
        }
      }
    });

    const state = useGameStore.getState();
    expect(state.activeBonus?.type).toBe("HOLD_AND_SPIN");
    expect(state.activeBonus?.transport).toBe("streamed");
    expect(state.activeBonus?.source).toBe("event");
    expect(state.activeBonus?.featureSession.remainingLabel).toContain("respins");
    expect(state.bonusSessions).toHaveLength(1);

    useGameStore.getState().dismissBonus();
    expect(useGameStore.getState().activeBonus).toBeNull();
  });

  it("surfaces demo runtime truthfully and does not imply queue replay", async () => {
    await loadClientStateModules("serverless");
    resetStore();
    clearOfflineSpinQueue();
    mockFetchForOnlineFlow();

    await useGameStore.getState().bootstrap();

    let state = useGameStore.getState();
    expect(state.runtimeCapabilities.experience).toBe("demo");
    expect(state.runtimeCapabilities.offlineQueue.supported).toBe(false);
    expect(state.eventStreamState).toBe("unavailable");
    expect(state.queueSummary).toContain("disabled in demo runtime");
    expect(state.mathConfig.fixedLines).toBe(50);

    state.setMaxBet();
    state = useGameStore.getState();
    expect(state.wager.isMaxBet).toBe(true);

    await useGameStore.getState().spin();

    state = useGameStore.getState();
    expect(state.apiMode).toBe("fallback");
    expect(state.queuedSpins).toBe(0);
    expect(loadOfflineSpinQueue()).toHaveLength(0);
  });

  it("queues offline spin then resumes and drains queue", async () => {
    await useGameStore.getState().bootstrap();

    useGameStore.getState().setDenomination(2);
    useGameStore.getState().setCreditsPerSpin(50);

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false
    });

    await useGameStore.getState().spin();
    expect(loadOfflineSpinQueue().length).toBe(1);
    expect(useGameStore.getState().queuedSpins).toBe(1);
    expect(loadOfflineSpinQueue()[0]?.bet).toBe(100);
    expect(loadOfflineSpinQueue()[0]?.denomination).toBe(2);
    expect(loadOfflineSpinQueue()[0]?.creditsPerSpin).toBe(50);

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
