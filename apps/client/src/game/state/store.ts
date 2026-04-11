import { create } from "zustand";
import {
  apiClient,
  createSpinRequest,
  type BonusPayload,
  type BonusType,
  type ConfigResponse,
  type EmberLockStatus,
  type FreeQuestStatus,
  type JackpotTier,
  type ProfileResponse,
  type SpinResponse,
  type WalletState
} from "../net/apiClient";
import type { ServerEvent } from "../net/eventClient";
import {
  drainOfflineSpinQueue,
  enqueueOfflineSpin,
  loadOfflineSpinQueue
} from "../platform/offlineSync";

type JackpotLadder = Record<JackpotTier, number>;
type BonusSource = "spin" | "event";

const MAX_BONUS_SESSIONS = 18;

export interface ActiveBonusPresentation {
  type: BonusType;
  sessionId: string;
  revealSeed: string;
  expectedTotalAward: number;
  jackpotAwards: BonusPayload["jackpotAwards"];
  precomputedOutcome: Record<string, unknown>;
  triggerSpinId: string;
  openedAt: number;
  source: BonusSource;
}

export interface ProgressionState {
  forgeMeter: number;
  relicShards: number;
  dailyQuestProgress: number;
}

const DEFAULT_REELS: string[][] = [
  ["DRG", "ORB", "SCT"],
  ["CHS", "RNE", "CRN"],
  ["DRG", "WLD", "ORB"],
  ["SCT", "CHS", "RNE"],
  ["CRN", "DRG", "ORB"]
];

const DEFAULT_WALLET: WalletState = {
  coins: 2500,
  gems: 25,
  lifetimeSpins: 0,
  lifetimeWins: 0
};

const DEFAULT_JACKPOT: JackpotLadder = {
  ember: 1200,
  relic: 3800,
  mythic: 9500,
  throne: 28000
};

const DEFAULT_EMBER_LOCK: EmberLockStatus = {
  active: false,
  lockedCells: 0,
  respinsRemaining: 0
};

const DEFAULT_FREE_QUEST: FreeQuestStatus = {
  active: false,
  spinsRemaining: 0,
  retriggers: 0
};

const DEFAULT_PROGRESSION: ProgressionState = {
  forgeMeter: 0,
  relicShards: 0,
  dailyQuestProgress: 0
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBonusType(value: unknown): BonusType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "EMBER_RESPIN") {
    return "EMBER_RESPIN";
  }

  if (normalized === "WHEEL_ASCENSION") {
    return "WHEEL_ASCENSION";
  }

  if (normalized === "RELIC_VAULT" || normalized === "RELIC_VAULT_PICK") {
    return "RELIC_VAULT";
  }

  return null;
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
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
    expectedTotalAward: payload.expectedTotalAward,
    jackpotAwards: payload.jackpotAwards,
    precomputedOutcome: payload.precomputedOutcome,
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

function normalizeEventBonusPayload(rawPayload: unknown): BonusPayload | null {
  const envelope = isRecord(rawPayload)
    ? isRecord(rawPayload.bonusPayload)
      ? rawPayload.bonusPayload
      : rawPayload
    : null;

  if (!envelope) {
    return null;
  }

  const type = normalizeBonusType(envelope.type);
  if (!type) {
    return null;
  }

  const rawJackpotAwards = Array.isArray(envelope.jackpotAwards) ? envelope.jackpotAwards : [];
  const jackpotAwards = rawJackpotAwards
    .map((award) => {
      if (!isRecord(award)) {
        return null;
      }

      const tier = award.tier;
      if (tier !== "ember" && tier !== "relic" && tier !== "mythic" && tier !== "throne") {
        return null;
      }

      return {
        tier,
        amount: toInt(award.amount),
        source: typeof award.source === "string" ? award.source : "event"
      };
    })
    .filter((award): award is BonusPayload["jackpotAwards"][number] => award !== null);

  return {
    type,
    sessionId:
      typeof envelope.sessionId === "string" && envelope.sessionId.length > 0
        ? envelope.sessionId
        : `event-${Date.now().toString(36)}`,
    revealSeed:
      typeof envelope.revealSeed === "string" && envelope.revealSeed.length > 0
        ? envelope.revealSeed
        : `seed-${Math.random().toString(36).slice(2, 10)}`,
    precomputedOutcome: isRecord(envelope.precomputedOutcome) ? envelope.precomputedOutcome : {},
    expectedTotalAward: toInt(envelope.expectedTotalAward),
    jackpotAwards
  };
}

function applySpinToState(
  result: SpinResponse,
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore
): void {
  const current = get();

  const emberTriggered =
    result.triggers.includes("EMBER_RESPIN") || result.triggers.includes("EMBER_LOCK");
  const freeQuestTriggered = result.triggers.includes("FREE_QUEST");
  const relicTriggered = result.triggers.includes("RELIC_VAULT");
  const anyBonusTriggered = result.triggers.includes("BONUS") || result.bonusPayload !== null;

  const forgeGain =
    1 +
    Math.floor(result.winCoins / 75) +
    (emberTriggered ? 3 : 0) +
    (freeQuestTriggered ? 2 : 0) +
    (anyBonusTriggered ? 2 : 0);

  const relicShardGain = relicTriggered ? 2 : 0;

  const nextProgression: ProgressionState = {
    forgeMeter: current.progression.forgeMeter + forgeGain,
    relicShards: current.progression.relicShards + relicShardGain,
    dailyQuestProgress: current.progression.dailyQuestProgress + 1
  };

  const nextBonus = result.bonusPayload
    ? toBonusPresentation(result.spinId, result.bonusPayload, "spin")
    : null;
  const nextSessions = nextBonus
    ? upsertBonusSession(current.bonusSessions, nextBonus)
    : current.bonusSessions;

  set({
    reels: result.reels,
    winLines: result.winLines,
    lastWin: result.winCoins,
    wallet: result.wallet,
    jackpotLadder: result.jackpotLadder,
    emberLock: result.emberLock,
    freeQuest: result.freeQuest,
    activeBonus: nextBonus,
    bonusSessions: nextSessions,
    progression: nextProgression,
    apiMode: apiClient.mode,
    error: undefined
  });
}

export interface GameStore {
  sessionId: string;
  profile: ProfileResponse | null;
  config: ConfigResponse | null;
  wallet: WalletState;
  jackpotLadder: JackpotLadder;
  emberLock: EmberLockStatus;
  freeQuest: FreeQuestStatus;
  progression: ProgressionState;
  reels: string[][];
  winLines: number[];
  lastWin: number;
  bet: number;
  spinning: boolean;
  online: boolean;
  queuedSpins: number;
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
  dismissBonus: () => void;
  consumeServerEvent: (event: ServerEvent) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  sessionId: randomSessionId(),
  profile: null,
  config: null,
  wallet: DEFAULT_WALLET,
  jackpotLadder: DEFAULT_JACKPOT,
  emberLock: DEFAULT_EMBER_LOCK,
  freeQuest: DEFAULT_FREE_QUEST,
  progression: DEFAULT_PROGRESSION,
  reels: DEFAULT_REELS,
  winLines: [],
  lastWin: 0,
  bet: 25,
  spinning: false,
  online: getOnlineStatus(),
  queuedSpins: loadOfflineSpinQueue().length,
  apiMode: apiClient.mode,
  activeBonus: null,
  bonusSessions: [],
  error: undefined,

  bootstrap: async () => {
    try {
      const [profile, config] = await Promise.all([apiClient.getProfile(), apiClient.getConfig()]);
      set({
        profile,
        config,
        wallet: profile.wallet,
        jackpotLadder: config.jackpotLadder,
        bet: config.defaultBet,
        online: getOnlineStatus(),
        queuedSpins: loadOfflineSpinQueue().length,
        apiMode: apiClient.mode,
        error: undefined
      });
    } catch {
      set({
        online: getOnlineStatus(),
        error: "Failed to load profile/config. Running in local fallback mode."
      });
    }
  },

  spin: async () => {
    const state = get();
    if (state.spinning) {
      return;
    }

    const online = getOnlineStatus();
    const request = createSpinRequest(
      state.sessionId,
      state.bet,
      state.profile?.playerId ?? "local-dragon"
    );

    set({ spinning: true, online, error: undefined });

    if (!online) {
      const queue = enqueueOfflineSpin(request);
      set({
        spinning: false,
        queuedSpins: queue.length,
        error: "Offline: spin queued and will sync when connection returns."
      });
      return;
    }

    try {
      await get().syncOfflineQueue();
      const result = await apiClient.spin(request);
      applySpinToState(result, set, get);
    } catch {
      const queue = enqueueOfflineSpin(request);
      set({
        error: "Spin failed. Request queued for retry.",
        queuedSpins: queue.length
      });
    } finally {
      set({ spinning: false, apiMode: apiClient.mode });
    }
  },

  syncOfflineQueue: async () => {
    const online = getOnlineStatus();
    if (!online) {
      set({ online: false });
      return;
    }

    const drainResult = await drainOfflineSpinQueue((request) => apiClient.spin(request));

    set({
      queuedSpins: drainResult.remaining,
      online: true,
      apiMode: apiClient.mode
    });

    if (drainResult.lastResult) {
      applySpinToState(drainResult.lastResult, set, get);
    }
  },

  setOnlineStatus: (online) => {
    set({ online });
  },

  setBet: (value) => {
    const config = get().config;
    const minBet = config?.minBet ?? 10;
    const maxBet = config?.maxBet ?? 500;
    const normalized = Math.max(minBet, Math.min(maxBet, Math.round(value)));
    set({ bet: normalized });
  },

  adjustBet: (delta) => {
    const nextBet = get().bet + delta;
    get().setBet(nextBet);
  },

  dismissBonus: () => {
    set({ activeBonus: null });
  },

  consumeServerEvent: (event) => {
    if (event.type === "jackpot") {
      const payload = event.payload as { tier?: JackpotTier; amount?: number };
      const tier = payload.tier;
      const amount = payload.amount;

      if (!tier || typeof amount !== "number") {
        return;
      }

      set({
        jackpotLadder: {
          ...get().jackpotLadder,
          [tier]: amount
        }
      });
      return;
    }

    if (event.type === "achievement") {
      const progression = get().progression;
      set({
        progression: {
          ...progression,
          relicShards: progression.relicShards + 1
        }
      });
    }

    if (event.type === "bonus") {
      const payload = normalizeEventBonusPayload(event.payload);
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
