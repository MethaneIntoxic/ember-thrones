import { create } from "zustand";
import {
  apiClient,
  buildWagerProfile,
  createBonusPayloadFromSource,
  createSpinRequest,
  DEFAULT_BASE_GAME_MATH_CONFIG,
  DEFAULT_WAGER_CONSTRAINTS,
  getMaxBetSelection,
  RemoteAuthoritativeUnavailableError,
  type BaseGameMathConfig,
  type BonusPayload,
  type BonusType,
  type ConfigResponse,
  type FeatureSessionState,
  type FeatureSessionTransport,
  type FreeGamesStatus,
  type HoldAndSpinStatus,
  type JackpotTier,
  type ProfileResponse,
  type SpinSpeedMode,
  type SpinResponse,
  type WagerConstraints,
  type WagerProfile,
  type WalletState
} from "../net/apiClient";
import type { ServerEvent } from "../net/eventClient";
import {
  drainOfflineSpinQueue,
  enqueueOfflineSpin,
  getOfflineSpinQueueSnapshot
} from "../platform/offlineSync";
import { resolveRuntimeCapabilities, type RuntimeCapabilities } from "../platform/runtimePolicy";

type JackpotLadder = Record<JackpotTier, number>;
type BonusSource = "spin" | "event";
type EventStreamState = "idle" | "connected" | "disconnected" | "unavailable";

const MAX_BONUS_SESSIONS = 18;

export interface ActiveBonusPresentation {
  type: BonusType;
  sessionId: string;
  revealSeed: string;
  gameVariantId: string;
  freeGamesModifierId: BonusPayload["freeGamesModifierId"];
  expectedTotalAward: number;
  jackpotTiersHit: BonusPayload["jackpotTiersHit"];
  jackpotAwards: BonusPayload["jackpotAwards"];
  jackpotConfig: BonusPayload["jackpotConfig"];
  orbTriggerConfig: BonusPayload["orbTriggerConfig"];
  scatterTriggerConfig: BonusPayload["scatterTriggerConfig"];
  precomputedOutcome: Record<string, unknown>;
  featureSession: FeatureSessionState;
  transport: FeatureSessionTransport;
  triggerSpinId: string;
  openedAt: number;
  source: BonusSource;
}

const DEFAULT_REELS = [
  ["dragon", "orb", "scatter"],
  ["coin", "lantern", "ingot"],
  ["dragon", "wild", "orb"],
  ["scatter", "coin", "lantern"],
  ["ingot", "dragon", "orb"]
];

const DEFAULT_WALLET: WalletState = {
  coins: 2500,
  gems: 25,
  lifetimeSpins: 0,
  lifetimeWins: 0
};

const DEFAULT_JACKPOT: JackpotLadder = {
  mini: 5000,
  minor: 25000,
  major: 100000,
  grand: 1000000
};

const DEFAULT_HOLD_AND_SPIN: HoldAndSpinStatus = {
  active: false,
  lockedCount: 0,
  respinsRemaining: 0
};

const DEFAULT_FREE_GAMES: FreeGamesStatus = {
  active: false,
  gamesRemaining: 0,
  retriggers: 0,
  modifierId: "ROYALS_REMOVED"
};

function getOnlineStatus(): boolean {
  if (typeof navigator === "undefined") {
    return true;
  }

  return navigator.onLine;
}

function randomSessionId(): string {
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveCurrentRuntimeCapabilities(): RuntimeCapabilities {
  return resolveRuntimeCapabilities({ apiMode: apiClient.mode });
}

function currentWagerConstraints(config: ConfigResponse | null): WagerConstraints {
  return {
    minBet: config?.minBet ?? DEFAULT_WAGER_CONSTRAINTS.minBet,
    maxBet: config?.maxBet ?? DEFAULT_WAGER_CONSTRAINTS.maxBet
  };
}

function toBonusPresentation(
  spinId: string,
  payload: BonusPayload,
  source: BonusSource
): ActiveBonusPresentation {
  return {
    type: payload.type,
    sessionId: payload.sessionId,
    revealSeed: payload.revealSeed,
    gameVariantId: payload.gameVariantId,
    freeGamesModifierId: payload.freeGamesModifierId,
    expectedTotalAward: payload.expectedTotalAward,
    jackpotTiersHit: payload.jackpotTiersHit,
    jackpotAwards: payload.jackpotAwards,
    jackpotConfig: payload.jackpotConfig,
    orbTriggerConfig: payload.orbTriggerConfig,
    scatterTriggerConfig: payload.scatterTriggerConfig,
    precomputedOutcome: payload.precomputedOutcome,
    featureSession: payload.featureSession,
    transport: payload.transport,
    triggerSpinId: spinId,
    openedAt: Date.now(),
    source
  };
}

function upsertBonusSession(
  sessions: ActiveBonusPresentation[],
  nextSession: ActiveBonusPresentation
): ActiveBonusPresentation[] {
  const deduped = sessions.filter((session) => session.sessionId !== nextSession.sessionId);
  return [nextSession, ...deduped].slice(0, MAX_BONUS_SESSIONS);
}

interface RuntimeDerivedState {
  runtimeCapabilities: RuntimeCapabilities;
  runtimeSummary: string;
  queueSummary: string;
  queuedSpins: number;
  strandedQueuedSpins: number;
}

function describeRuntimeSummary(
  runtimeCapabilities: RuntimeCapabilities,
  eventStreamState: EventStreamState
): string {
  if (runtimeCapabilities.experience === "connected") {
    if (eventStreamState === "idle") {
      return "Connected runtime: server-authoritative spins are active, and live events are available when the stream confirms.";
    }

    if (eventStreamState === "disconnected") {
      return "Connected runtime: server-authoritative spins are active while live events reconnect.";
    }

    return "Connected runtime: server-authoritative spins, live events, and queue replay are active.";
  }

  if (runtimeCapabilities.experience === "disconnected") {
    return "Disconnected runtime: cached profile data is visible, but spins queue for server replay until the API returns.";
  }

  return "Demo runtime: spins resolve locally, and live sync or queue replay are unavailable.";
}

function describeQueueSummary(runtimeCapabilities: RuntimeCapabilities): string {
  const snapshot = getOfflineSpinQueueSnapshot();

  if (snapshot.queued > 0) {
    if (runtimeCapabilities.offlineQueue.canReplayNow) {
      return `${snapshot.queued} queued spin(s) are pending server replay.`;
    }

    if (runtimeCapabilities.offlineQueue.supported) {
      return `${snapshot.queued} queued spin(s) are waiting for the connected runtime to return.`;
    }

    return `${snapshot.queued} queued server spin(s) are parked locally because demo runtime cannot replay them.`;
  }

  if (snapshot.stranded > 0) {
    return `${snapshot.stranded} legacy queue item(s) are ambiguous and remain local-only.`;
  }

  if (runtimeCapabilities.offlineQueue.supported) {
    return "Offline queue is ready for server replay if the connection drops.";
  }

  return "Offline queue is disabled in demo runtime.";
}

function buildRuntimeDerivedState(eventStreamState: EventStreamState): RuntimeDerivedState {
  const runtimeCapabilities = resolveCurrentRuntimeCapabilities();
  const snapshot = getOfflineSpinQueueSnapshot();

  return {
    runtimeCapabilities,
    runtimeSummary: describeRuntimeSummary(runtimeCapabilities, eventStreamState),
    queueSummary: describeQueueSummary(runtimeCapabilities),
    queuedSpins: snapshot.queued,
    strandedQueuedSpins: snapshot.stranded
  };
}

function deriveWagerState(
  config: ConfigResponse | null,
  mathConfig: BaseGameMathConfig,
  selection: Partial<Pick<WagerProfile, "denomination" | "creditsPerSpin" | "speedMode">>
): Pick<GameStore, "wager" | "bet"> {
  const wager = buildWagerProfile(mathConfig, selection, currentWagerConstraints(config));
  return {
    wager,
    bet: wager.totalBet
  };
}

function nextWagerSelection(
  current: WagerProfile,
  updates: Partial<Pick<WagerProfile, "denomination" | "creditsPerSpin" | "speedMode">>
): Partial<Pick<WagerProfile, "denomination" | "creditsPerSpin" | "speedMode">> {
  return {
    denomination: updates.denomination ?? current.denomination,
    creditsPerSpin: updates.creditsPerSpin ?? current.creditsPerSpin,
    speedMode: updates.speedMode ?? current.speedMode
  };
}

function applySpinToState(
  result: SpinResponse,
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
  error?: string
): void {
  const current = get();
  const runtimeState = buildRuntimeDerivedState(current.eventStreamState);
  const nextBonus = result.bonusPayload ? toBonusPresentation(result.spinId, result.bonusPayload, "spin") : null;
  const nextSessions = nextBonus ? upsertBonusSession(current.bonusSessions, nextBonus) : current.bonusSessions;

  set({
    reels: result.reels,
    winLines: result.winLines,
    lastWin: result.winCoins,
    wallet: result.wallet,
    jackpotLadder: result.jackpotLadder,
    holdAndSpin: result.holdAndSpin,
    freeGames: result.freeGames,
    activeBonus: nextBonus,
    bonusSessions: nextSessions,
    apiMode: apiClient.mode,
    ...runtimeState,
    error
  });
}

export interface GameStore {
  sessionId: string;
  profile: ProfileResponse | null;
  config: ConfigResponse | null;
  mathConfig: BaseGameMathConfig;
  wager: WagerProfile;
  runtimeCapabilities: RuntimeCapabilities;
  runtimeSummary: string;
  queueSummary: string;
  eventStreamState: EventStreamState;
  wallet: WalletState;
  jackpotLadder: JackpotLadder;
  holdAndSpin: HoldAndSpinStatus;
  freeGames: FreeGamesStatus;
  reels: string[][];
  winLines: number[];
  lastWin: number;
  bet: number;
  spinning: boolean;
  online: boolean;
  queuedSpins: number;
  strandedQueuedSpins: number;
  apiMode: "remote" | "fallback";
  activeBonus: ActiveBonusPresentation | null;
  bonusSessions: ActiveBonusPresentation[];
  error?: string;
  bootstrap: () => Promise<void>;
  spin: () => Promise<void>;
  syncOfflineQueue: () => Promise<void>;
  setOnlineStatus: (online: boolean) => void;
  setBet: (value: number) => void;
  adjustBet: (delta: number) => void;
  setDenomination: (value: number) => void;
  setCreditsPerSpin: (value: number) => void;
  setSpeedMode: (value: SpinSpeedMode) => void;
  setMaxBet: () => void;
  dismissBonus: () => void;
  consumeServerEvent: (event: ServerEvent) => void;
}

const initialRuntimeCapabilities = resolveCurrentRuntimeCapabilities();
const initialEventStreamState: EventStreamState = initialRuntimeCapabilities.network.supportsLiveEvents
  ? "idle"
  : "unavailable";
const initialRuntimeState = buildRuntimeDerivedState(initialEventStreamState);
const initialWager = buildWagerProfile(DEFAULT_BASE_GAME_MATH_CONFIG, {
  denomination: DEFAULT_BASE_GAME_MATH_CONFIG.defaultDenomination,
  creditsPerSpin: DEFAULT_BASE_GAME_MATH_CONFIG.defaultCreditsPerSpin,
  speedMode: DEFAULT_BASE_GAME_MATH_CONFIG.speedModes[0]
});

export const useGameStore = create<GameStore>((set, get) => ({
  sessionId: randomSessionId(),
  profile: null,
  config: null,
  mathConfig: { ...DEFAULT_BASE_GAME_MATH_CONFIG },
  wager: initialWager,
  runtimeCapabilities: initialRuntimeState.runtimeCapabilities,
  runtimeSummary: initialRuntimeState.runtimeSummary,
  queueSummary: initialRuntimeState.queueSummary,
  eventStreamState: initialEventStreamState,
  wallet: DEFAULT_WALLET,
  jackpotLadder: DEFAULT_JACKPOT,
  holdAndSpin: DEFAULT_HOLD_AND_SPIN,
  freeGames: DEFAULT_FREE_GAMES,
  reels: DEFAULT_REELS,
  winLines: [],
  lastWin: 0,
  bet: initialWager.totalBet,
  spinning: false,
  online: getOnlineStatus(),
  queuedSpins: initialRuntimeState.queuedSpins,
  strandedQueuedSpins: initialRuntimeState.strandedQueuedSpins,
  apiMode: apiClient.mode,
  activeBonus: null,
  bonusSessions: [],
  error: undefined,

  bootstrap: async () => {
    try {
      const [profile, config] = await Promise.all([apiClient.getProfile(), apiClient.getConfig()]);
      const runtimeState = buildRuntimeDerivedState(get().eventStreamState);
      const initialState = deriveWagerState(config, config.mathConfig, {
        denomination: config.mathConfig.defaultDenomination,
        creditsPerSpin: config.mathConfig.defaultCreditsPerSpin,
        speedMode: get().wager.speedMode
      });

      set({
        profile,
        config,
        mathConfig: config.mathConfig,
        wallet: profile.wallet,
        jackpotLadder: config.jackpotLadder,
        online: getOnlineStatus(),
        apiMode: apiClient.mode,
        ...runtimeState,
        ...initialState,
        error:
          runtimeState.runtimeCapabilities.experience === "disconnected"
            ? "Connected runtime unavailable. Spins will queue for server replay until the API returns."
            : undefined
      });
    } catch {
      const runtimeState = buildRuntimeDerivedState(get().eventStreamState);
      set({
        online: getOnlineStatus(),
        apiMode: apiClient.mode,
        ...runtimeState,
        error: "Failed to load profile/config."
      });
    }
  },

  spin: async () => {
    const state = get();
    if (state.spinning) {
      return;
    }

    const online = getOnlineStatus();
    const request = createSpinRequest(state.sessionId, state.wager, state.profile?.playerId ?? "local-dragon");

    set({ spinning: true, online, error: undefined });

    const runtimeCapabilities = resolveCurrentRuntimeCapabilities();
    if (runtimeCapabilities.experience === "demo") {
      try {
        const result = await apiClient.spin(request);
        applySpinToState(result, set, get);
      } finally {
        const runtimeState = buildRuntimeDerivedState(get().eventStreamState);
        set({ spinning: false, online, apiMode: apiClient.mode, ...runtimeState });
      }
      return;
    }

    if (!online) {
      enqueueOfflineSpin(request);
      const runtimeState = buildRuntimeDerivedState(get().eventStreamState);
      set({
        spinning: false,
        online: false,
        apiMode: apiClient.mode,
        ...runtimeState,
        error: "Offline: spin queued for server replay when the connected runtime returns."
      });
      return;
    }

    try {
      await get().syncOfflineQueue();
      const result = await apiClient.spin(request, { policy: "require-remote" });
      applySpinToState(result, set, get);
    } catch (error) {
      if (error instanceof RemoteAuthoritativeUnavailableError) {
        enqueueOfflineSpin(request);
        const runtimeState = buildRuntimeDerivedState(get().eventStreamState);
        set({
          online: getOnlineStatus(),
          apiMode: apiClient.mode,
          ...runtimeState,
          error: "Connected runtime unavailable. Spin queued for server replay."
        });
      } else {
        const runtimeState = buildRuntimeDerivedState(get().eventStreamState);
        set({
          online: getOnlineStatus(),
          apiMode: apiClient.mode,
          ...runtimeState,
          error: "Spin failed."
        });
      }
    } finally {
      const runtimeState = buildRuntimeDerivedState(get().eventStreamState);
      set({
        spinning: false,
        online: getOnlineStatus(),
        apiMode: apiClient.mode,
        ...runtimeState
      });
    }
  },

  syncOfflineQueue: async () => {
    const online = getOnlineStatus();
    if (!online) {
      const runtimeState = buildRuntimeDerivedState(get().eventStreamState);
      set({ online: false, apiMode: apiClient.mode, ...runtimeState });
      return;
    }

    const runtimeCapabilities = resolveCurrentRuntimeCapabilities();
    if (!runtimeCapabilities.offlineQueue.supported) {
      const runtimeState = buildRuntimeDerivedState(get().eventStreamState);
      set({ online: true, apiMode: apiClient.mode, ...runtimeState });
      return;
    }

    const drainResult = await drainOfflineSpinQueue((request) =>
      apiClient.spin(request, { policy: "require-remote" })
    );

    const runtimeState = buildRuntimeDerivedState(get().eventStreamState);
    if (drainResult.lastResult) {
      applySpinToState(
        drainResult.lastResult,
        set,
        get,
        drainResult.failed > 0
          ? "Connected runtime unavailable. Remaining spins are still queued for replay."
          : drainResult.stranded > 0
            ? "Some legacy queued spins remain local-only."
            : undefined
      );
      return;
    }

    set({
      online: true,
      apiMode: apiClient.mode,
      ...runtimeState,
      error:
        drainResult.failed > 0
          ? "Connected runtime unavailable. Remaining spins are still queued for replay."
          : drainResult.stranded > 0
            ? "Some legacy queued spins remain local-only."
            : undefined
    });
  },

  setOnlineStatus: (online) => {
    const runtimeState = buildRuntimeDerivedState(get().eventStreamState);
    set({ online, apiMode: apiClient.mode, ...runtimeState });
  },

  setBet: (value) => {
    const state = get();
    const estimatedCredits = Math.max(1, Math.round(value / Math.max(1, state.wager.denomination)));
    set(
      deriveWagerState(
        state.config,
        state.mathConfig,
        nextWagerSelection(state.wager, { creditsPerSpin: estimatedCredits })
      )
    );
  },

  adjustBet: (delta) => {
    get().setBet(get().bet + delta);
  },

  setDenomination: (value) => {
    const state = get();
    set(
      deriveWagerState(
        state.config,
        state.mathConfig,
        nextWagerSelection(state.wager, { denomination: value })
      )
    );
  },

  setCreditsPerSpin: (value) => {
    const state = get();
    set(
      deriveWagerState(
        state.config,
        state.mathConfig,
        nextWagerSelection(state.wager, { creditsPerSpin: value })
      )
    );
  },

  setSpeedMode: (value) => {
    const state = get();
    set(
      deriveWagerState(
        state.config,
        state.mathConfig,
        nextWagerSelection(state.wager, { speedMode: value })
      )
    );
  },

  setMaxBet: () => {
    const state = get();
    const maxWager = getMaxBetSelection(state.mathConfig, currentWagerConstraints(state.config));
    set(
      deriveWagerState(
        state.config,
        state.mathConfig,
        nextWagerSelection(state.wager, {
          denomination: maxWager.denomination,
          creditsPerSpin: maxWager.creditsPerSpin
        })
      )
    );
  },

  dismissBonus: () => {
    set({ activeBonus: null });
  },

  consumeServerEvent: (event) => {
    if (event.type === "runtime.connected" || event.type === "connected") {
      set({ eventStreamState: "connected", ...buildRuntimeDerivedState("connected") });
      return;
    }

    if (event.type === "runtime.disconnected") {
      set({ eventStreamState: "disconnected", ...buildRuntimeDerivedState("disconnected") });
      return;
    }

    if (event.type === "runtime.unavailable") {
      set({ eventStreamState: "unavailable", ...buildRuntimeDerivedState("unavailable") });
      return;
    }

    if (event.type === "runtime.ping" || event.type === "ping") {
      return;
    }

    if (event.type === "jackpot" || event.type === "jackpot.hit") {
      const payload = event.payload as { tier?: JackpotTier; amount?: number };
      if (!payload.tier || typeof payload.amount !== "number") {
        return;
      }

      set({
        jackpotLadder: {
          ...get().jackpotLadder,
          [payload.tier]: payload.amount
        }
      });
      return;
    }

    if (event.type === "bonus") {
      const runtimeExperience = get().runtimeCapabilities.experience;
      const payload = createBonusPayloadFromSource(event.payload, {
        transport:
          runtimeExperience === "demo"
            ? "demo"
            : event.source === "server"
              ? "streamed"
              : "seeded"
      });

      if (!payload) {
        return;
      }

      const presentation = toBonusPresentation(`event-${event.ts}`, payload, "event");
      set({
        activeBonus: presentation,
        bonusSessions: upsertBonusSession(get().bonusSessions, presentation)
      });
    }
  }
}));
