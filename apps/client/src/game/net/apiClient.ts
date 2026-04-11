export type JackpotTier = "ember" | "relic" | "mythic" | "throne";

export interface WalletState {
  coins: number;
  gems: number;
  lifetimeSpins: number;
  lifetimeWins: number;
}

export interface ProfileResponse {
  playerId: string;
  nickname: string;
  level: number;
  wallet: WalletState;
}

export interface ConfigResponse {
  minBet: number;
  maxBet: number;
  defaultBet: number;
  jackpotLadder: Record<JackpotTier, number>;
}

export interface SpinRequest {
  profileId: string;
  sessionId: string;
  bet: number;
  linesMode: number;
  clientNonce: string;
}

export interface EmberLockStatus {
  active: boolean;
  lockedCells: number;
  respinsRemaining: number;
}

export interface FreeQuestStatus {
  active: boolean;
  spinsRemaining: number;
  retriggers: number;
}

export type SpinTrigger = "EMBER_LOCK" | "FREE_QUEST" | "MINI_GAME";

export interface SpinResponse {
  spinId: string;
  reels: string[][];
  winCoins: number;
  winLines: number[];
  triggers: SpinTrigger[];
  wallet: WalletState;
  jackpotLadder: Record<JackpotTier, number>;
  emberLock: EmberLockStatus;
  freeQuest: FreeQuestStatus;
}

type RuntimeMode = "hybrid" | "serverless";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4300").replace(/\/$/, "");
const runtimeModeEnv = (import.meta.env.VITE_RUNTIME_MODE ?? "").toLowerCase();
const RUNTIME_MODE: RuntimeMode = runtimeModeEnv === "hybrid" ? "hybrid" : "serverless";
const DEFAULT_PROFILE_ID = "local-dragon";
const SYMBOL_POOL = ["DRG", "ORB", "QST", "BLD", "RNG", "JWL", "WLD"];

interface ServerProfileEnvelope {
  profile: {
    id: string;
    nickname: string;
    level: number;
    coins: number;
    gems: number;
    lifetimeSpins: number;
    lifetimeWins: number;
  };
}

interface ServerConfigResponse {
  minBet?: number;
  maxBet?: number;
  defaultBet?: number;
  jackpotLadder?: Partial<Record<JackpotTier, number>>;
}

interface ServerSpinWin {
  kind: "line" | "feature" | "jackpot";
  amount: number;
  detail: string;
}

interface ServerSpinResponse {
  spinId: string;
  reels: string[][];
  wins: ServerSpinWin[];
  triggers: {
    emberLock: boolean;
    freeQuest: boolean;
    jackpotTier?: JackpotTier;
  };
  bonusState: {
    emberLock?: {
      active: boolean;
      lockedCells: number[];
      respinsRemaining: number;
    };
    freeQuest?: {
      active: boolean;
      spinsRemaining: number;
      retriggerChance?: number;
    };
  };
  totalWin: number;
  updatedWallet: WalletState;
  jackpotLadder?: Partial<Record<JackpotTier, number>>;
}

function randomFrom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function randomNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function createMockReels(): string[][] {
  return Array.from({ length: 5 }, () =>
    Array.from({ length: 3 }, () => randomFrom(SYMBOL_POOL))
  );
}

function hasTriple(line: string[]): boolean {
  if (line.length < 3) {
    return false;
  }

  return line[0] === line[1] && line[1] === line[2];
}

function evaluateLineWins(reels: string[][]): { winLines: number[]; winCoins: number } {
  const winLines: number[] = [];
  const rows = 3;

  for (let row = 0; row < rows; row += 1) {
    const symbols = reels.map((column) => column[row]).filter(Boolean) as string[];
    if (symbols.length >= 3 && hasTriple(symbols.slice(0, 3))) {
      winLines.push(row);
    }
  }

  const winCoins = winLines.length * (20 + Math.floor(Math.random() * 80));
  return { winLines, winCoins };
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly profileId: string;
  private readonly runtimeMode: RuntimeMode;

  private fallbackWallet: WalletState = {
    coins: 2500,
    gems: 25,
    lifetimeSpins: 0,
    lifetimeWins: 0
  };

  private fallbackJackpot: Record<JackpotTier, number> = {
    ember: 1200,
    relic: 3800,
    mythic: 9500,
    throne: 28000
  };

  public mode: "remote" | "fallback" = "remote";

  public constructor(
    baseUrl = API_BASE_URL,
    profileId = DEFAULT_PROFILE_ID,
    runtimeMode: RuntimeMode = RUNTIME_MODE
  ) {
    this.baseUrl = baseUrl;
    this.profileId = profileId;
    this.runtimeMode = runtimeMode;
  }

  private mapProfileResponse(server: ServerProfileEnvelope): ProfileResponse {
    const profile = server.profile;
    this.fallbackWallet = {
      coins: profile.coins,
      gems: profile.gems,
      lifetimeSpins: profile.lifetimeSpins,
      lifetimeWins: profile.lifetimeWins
    };

    return {
      playerId: profile.id,
      nickname: profile.nickname,
      level: profile.level,
      wallet: { ...this.fallbackWallet }
    };
  }

  private mapConfigResponse(server: ServerConfigResponse): ConfigResponse {
    const serverLadder = server.jackpotLadder ?? {};
    this.fallbackJackpot = {
      ember: serverLadder.ember ?? this.fallbackJackpot.ember,
      relic: serverLadder.relic ?? this.fallbackJackpot.relic,
      mythic: serverLadder.mythic ?? this.fallbackJackpot.mythic,
      throne: serverLadder.throne ?? this.fallbackJackpot.throne
    };

    return {
      minBet: clamp(server.minBet ?? 10, 1, 10000),
      maxBet: clamp(server.maxBet ?? 500, 10, 100000),
      defaultBet: clamp(server.defaultBet ?? 25, 1, 10000),
      jackpotLadder: { ...this.fallbackJackpot }
    };
  }

  private mapSpinResponse(server: ServerSpinResponse): SpinResponse {
    this.fallbackWallet = { ...server.updatedWallet };

    const ladder = server.jackpotLadder ?? {};
    this.fallbackJackpot = {
      ember: ladder.ember ?? this.fallbackJackpot.ember,
      relic: ladder.relic ?? this.fallbackJackpot.relic,
      mythic: ladder.mythic ?? this.fallbackJackpot.mythic,
      throne: ladder.throne ?? this.fallbackJackpot.throne
    };

    const winLines = (server.wins ?? [])
      .filter((win) => win.kind === "line")
      .map((win) => {
        const match = /Row\s+(\d+)/i.exec(win.detail);
        if (!match) {
          return null;
        }
        return Math.max(0, Number(match[1]) - 1);
      })
      .filter((line): line is number => typeof line === "number");

    const triggers: SpinTrigger[] = [];
    if (server.triggers.emberLock) {
      triggers.push("EMBER_LOCK");
    }
    if (server.triggers.freeQuest) {
      triggers.push("FREE_QUEST");
    }
    if (server.totalWin >= 75 && Math.random() < 0.18) {
      triggers.push("MINI_GAME");
    }

    return {
      spinId: server.spinId,
      reels: server.reels,
      winCoins: Math.max(0, Math.floor(server.totalWin ?? 0)),
      winLines,
      triggers,
      wallet: { ...this.fallbackWallet },
      jackpotLadder: { ...this.fallbackJackpot },
      emberLock: {
        active: server.bonusState.emberLock?.active ?? server.triggers.emberLock,
        lockedCells: server.bonusState.emberLock?.lockedCells?.length ?? 0,
        respinsRemaining: server.bonusState.emberLock?.respinsRemaining ?? 0
      },
      freeQuest: {
        active: server.bonusState.freeQuest?.active ?? server.triggers.freeQuest,
        spinsRemaining: server.bonusState.freeQuest?.spinsRemaining ?? 0,
        retriggers: server.bonusState.freeQuest?.active
          ? Math.max(1, Math.round((server.bonusState.freeQuest.retriggerChance ?? 0.2) * 10))
          : 0
      }
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed for ${path}: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  private applyFallbackContribution(bet: number, winCoins: number): void {
    this.fallbackWallet.coins = Math.max(0, this.fallbackWallet.coins - bet + winCoins);
    this.fallbackWallet.lifetimeSpins += 1;
    this.fallbackWallet.lifetimeWins += winCoins;

    this.fallbackJackpot = {
      ember: this.fallbackJackpot.ember + Math.floor(bet * 0.05),
      relic: this.fallbackJackpot.relic + Math.floor(bet * 0.08),
      mythic: this.fallbackJackpot.mythic + Math.floor(bet * 0.1),
      throne: this.fallbackJackpot.throne + Math.floor(bet * 0.15)
    };
  }

  private mockProfile(): ProfileResponse {
    return {
      playerId: "local-dragon",
      nickname: "Wyrm Tamer",
      level: 12,
      wallet: this.fallbackWallet
    };
  }

  private mockConfig(): ConfigResponse {
    return {
      minBet: 10,
      maxBet: 500,
      defaultBet: 25,
      jackpotLadder: this.fallbackJackpot
    };
  }

  private mockSpin(request: SpinRequest): SpinResponse {
    const reels = createMockReels();
    const { winLines, winCoins } = evaluateLineWins(reels);
    const orbCount = reels.flat().filter((symbol) => symbol === "ORB").length;
    const questCount = reels.flat().filter((symbol) => symbol === "QST").length;
    const miniGameTrigger = Math.random() < 0.12;

    const triggers: SpinTrigger[] = [];

    if (orbCount >= 6) {
      triggers.push("EMBER_LOCK");
    }

    if (questCount >= 4) {
      triggers.push("FREE_QUEST");
    }

    if (miniGameTrigger) {
      triggers.push("MINI_GAME");
    }

    this.applyFallbackContribution(request.bet, winCoins);

    return {
      spinId: `mock-${randomNonce()}`,
      reels,
      winCoins,
      winLines,
      triggers,
      wallet: { ...this.fallbackWallet },
      jackpotLadder: { ...this.fallbackJackpot },
      emberLock: {
        active: triggers.includes("EMBER_LOCK"),
        lockedCells: orbCount,
        respinsRemaining: triggers.includes("EMBER_LOCK") ? 3 : 0
      },
      freeQuest: {
        active: triggers.includes("FREE_QUEST"),
        spinsRemaining: triggers.includes("FREE_QUEST") ? 8 : 0,
        retriggers: triggers.includes("FREE_QUEST") ? 1 : 0
      }
    };
  }

  public async getProfile(): Promise<ProfileResponse> {
    if (this.runtimeMode === "serverless") {
      this.mode = "fallback";
      return this.mockProfile();
    }

    try {
      const result = await this.request<ServerProfileEnvelope>("/profile", {
        method: "POST",
        body: JSON.stringify({
          profileId: this.profileId,
          nickname: "Wyrm Tamer"
        })
      });
      this.mode = "remote";
      return this.mapProfileResponse(result);
    } catch {
      this.mode = "fallback";
      return this.mockProfile();
    }
  }

  public async getConfig(): Promise<ConfigResponse> {
    if (this.runtimeMode === "serverless") {
      this.mode = "fallback";
      return this.mockConfig();
    }

    try {
      const result = await this.request<ServerConfigResponse>("/config");
      this.mode = "remote";
      return this.mapConfigResponse(result);
    } catch {
      this.mode = "fallback";
      return this.mockConfig();
    }
  }

  public async spin(request: SpinRequest): Promise<SpinResponse> {
    if (this.runtimeMode === "serverless") {
      this.mode = "fallback";
      return this.mockSpin(request);
    }

    try {
      const result = await this.request<ServerSpinResponse>("/spin", {
        method: "POST",
        body: JSON.stringify(request)
      });
      this.mode = "remote";
      return this.mapSpinResponse(result);
    } catch {
      this.mode = "fallback";
      return this.mockSpin(request);
    }
  }
}

export function createSpinRequest(
  sessionId: string,
  bet: number,
  profileId = DEFAULT_PROFILE_ID
): SpinRequest {
  return {
    profileId,
    sessionId,
    bet,
    linesMode: 20,
    clientNonce: randomNonce()
  };
}

export const apiClient = new ApiClient();
