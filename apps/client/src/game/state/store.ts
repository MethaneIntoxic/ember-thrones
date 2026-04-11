import { create } from "zustand";
import {
  apiClient,
  createSpinRequest,
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

export type MiniGameType = "none" | "lantern-pick" | "sky-path" | "wyrm-duel";

type JackpotLadder = Record<JackpotTier, number>;

export interface ProgressionState {
  forgeMeter: number;
  relicShards: number;
  dailyQuestProgress: number;
}

const DEFAULT_REELS: string[][] = [
  ["DRG", "ORB", "QST"],
  ["BLD", "RNG", "JWL"],
  ["DRG", "WLD", "ORB"],
  ["QST", "BLD", "RNG"],
  ["JWL", "DRG", "ORB"]
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

function pickMiniGame(spinId: string): MiniGameType {
  const games: MiniGameType[] = ["lantern-pick", "sky-path", "wyrm-duel"];
  const hash = spinId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return games[hash % games.length] ?? "lantern-pick";
}

function applySpinToState(
  result: SpinResponse,
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore
): void {
  const current = get();
  const nextMiniGame = result.triggers.includes("MINI_GAME")
    ? pickMiniGame(result.spinId)
    : current.activeMiniGame;

  const forgeGain =
    1 +
    Math.floor(result.winCoins / 75) +
    (result.triggers.includes("EMBER_LOCK") ? 3 : 0) +
    (result.triggers.includes("FREE_QUEST") ? 2 : 0);

  const nextProgression: ProgressionState = {
    forgeMeter: current.progression.forgeMeter + forgeGain,
    relicShards: current.progression.relicShards,
    dailyQuestProgress: current.progression.dailyQuestProgress + 1
  };

  set({
    reels: result.reels,
    winLines: result.winLines,
    lastWin: result.winCoins,
    wallet: result.wallet,
    jackpotLadder: result.jackpotLadder,
    emberLock: result.emberLock,
    freeQuest: result.freeQuest,
    activeMiniGame: nextMiniGame,
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
  activeMiniGame: MiniGameType;
  error?: string;
  bootstrap: () => Promise<void>;
  spin: () => Promise<void>;
  syncOfflineQueue: () => Promise<void>;
  setOnlineStatus: (online: boolean) => void;
  setBet: (value: number) => void;
  adjustBet: (delta: number) => void;
  setMiniGame: (value: MiniGameType) => void;
  awardMiniGameReward: (coins: number, gems?: number) => void;
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
  activeMiniGame: "lantern-pick",
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

  setMiniGame: (value) => {
    set({ activeMiniGame: value });
  },

  awardMiniGameReward: (coins, gems = 0) => {
    const wallet = get().wallet;
    const progression = get().progression;
    const forgeBonus = Math.max(1, Math.floor(coins / 60));
    const shardBonus = Math.max(1, Math.floor(coins / 150));
    set({
      wallet: {
        ...wallet,
        coins: wallet.coins + coins,
        gems: wallet.gems + gems,
        lifetimeWins: wallet.lifetimeWins + Math.max(0, coins)
      },
      progression: {
        forgeMeter: progression.forgeMeter + forgeBonus,
        relicShards: progression.relicShards + shardBonus,
        dailyQuestProgress: progression.dailyQuestProgress + 1
      }
    });
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
  }
}));
