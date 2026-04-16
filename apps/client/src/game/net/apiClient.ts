import { resolveRuntimeMode, type RuntimeMode } from "../platform/runtimePolicy";

export type JackpotTier = "ember" | "relic" | "mythic" | "throne";

export type BonusType = "EMBER_RESPIN" | "WHEEL_ASCENSION" | "RELIC_VAULT_PICK";

export interface BonusJackpotAward {
  tier: JackpotTier;
  amount: number;
  source: string;
}

export interface BonusPayload {
  type: BonusType;
  sessionId: string;
  revealSeed: string;
  precomputedOutcome: Record<string, unknown>;
  expectedTotalAward: number;
  jackpotTiersHit: JackpotTier[];
  jackpotAwards: BonusJackpotAward[];
}

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
  playerId?: string;
  sessionId: string;
  bet: number;
  linesMode: number;
  lines?: number;
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

export type SpinTrigger =
  | "EMBER_LOCK"
  | "FREE_QUEST"
  | "EMBER_RESPIN"
  | "WHEEL_ASCENSION"
  | "RELIC_VAULT"
  | "BONUS";

export interface SpinResponse {
  spinId: string;
  reels: string[][];
  winCoins: number;
  winLines: number[];
  triggers: SpinTrigger[];
  bonusPayload: BonusPayload | null;
  wallet: WalletState;
  jackpotLadder: Record<JackpotTier, number>;
  emberLock: EmberLockStatus;
  freeQuest: FreeQuestStatus;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4300").replace(/\/$/, "");
const RUNTIME_MODE: RuntimeMode = resolveRuntimeMode(import.meta.env.VITE_RUNTIME_MODE);
const DEFAULT_PROFILE_ID = "local-dragon";

const FALLBACK_SYMBOL_WEIGHTS: Array<{ symbol: string; weight: number }> = [
  { symbol: "DRG", weight: 7 },
  { symbol: "ORB", weight: 8 },
  { symbol: "SCT", weight: 6 },
  { symbol: "WLD", weight: 8 },
  { symbol: "CHS", weight: 20 },
  { symbol: "RNE", weight: 20 },
  { symbol: "CRN", weight: 21 }
];

const FALLBACK_WEIGHT_TOTAL = FALLBACK_SYMBOL_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);

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
  triggers?: {
    emberLock: boolean;
    freeQuest: boolean;
    jackpotTier?: JackpotTier;
  };
  triggerFlags?: {
    emberRespin?: boolean;
    emberRespinCollectorLock?: boolean;
    wheelAscension?: boolean;
    celestialWheelAscension?: boolean;
    relicVaultPick?: boolean;
    freeQuest?: boolean;
  };
  bonusPayload?: {
    type?: string;
    sessionId?: string;
    revealSeed?: string;
    precomputedOutcome?: unknown;
    expectedTotalAward?: number;
    jackpotTiersHit?: Array<string>;
    jackpotAwards?: Array<{ tier?: string; amount?: number; source?: string }>;
  } | null;
  bonusState: {
    emberLock?: {
      active: boolean;
      lockedCells: number[];
      respinsRemaining: number;
      collectorMultiplier?: number;
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
  jackpotSnapshotAfter?: Partial<Record<JackpotTier, number>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isJackpotTier(value: unknown): value is JackpotTier {
  return value === "ember" || value === "relic" || value === "mythic" || value === "throne";
}

function normalizeBonusType(value: unknown): BonusType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "EMBER_RESPIN" || normalized === "EMBER_RESPIN_COLLECTOR_LOCK") {
    return "EMBER_RESPIN";
  }

  if (normalized === "WHEEL_ASCENSION" || normalized === "CELESTIAL_WHEEL_ASCENSION") {
    return "WHEEL_ASCENSION";
  }

  if (normalized === "RELIC_VAULT" || normalized === "RELIC_VAULT_PICK") {
    return "RELIC_VAULT_PICK";
  }

  return null;
}

function toNonNegativeInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
}

function randomNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function collectJackpotTiersFromAwards(awards: BonusJackpotAward[]): JackpotTier[] {
  return Array.from(new Set(awards.map((award) => award.tier)));
}

export type ApiSpinPolicy = "allow-demo-fallback" | "require-remote";

export class RemoteAuthoritativeUnavailableError extends Error {
  public constructor(message = "Server-authoritative runtime unavailable.") {
    super(message);
    this.name = "RemoteAuthoritativeUnavailableError";
  }
}

function randomWeightedSymbol(): string {
  let needle = Math.random() * FALLBACK_WEIGHT_TOTAL;

  for (const entry of FALLBACK_SYMBOL_WEIGHTS) {
    needle -= entry.weight;
    if (needle <= 0) {
      return entry.symbol;
    }
  }

  return FALLBACK_SYMBOL_WEIGHTS[FALLBACK_SYMBOL_WEIGHTS.length - 1]?.symbol ?? "DRG";
}

function createMockReels(): string[][] {
  return Array.from({ length: 5 }, () =>
    Array.from({ length: 3 }, () => randomWeightedSymbol())
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

  public mode: "remote" | "fallback" = "fallback";

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

  private toSpinRequestBody(request: SpinRequest): Record<string, unknown> {
    const profileId = request.profileId || request.playerId || DEFAULT_PROFILE_ID;
    const lines = clamp(toNonNegativeInt(request.lines ?? request.linesMode, request.linesMode), 1, 30);

    return {
      profileId,
      playerId: request.playerId ?? profileId,
      sessionId: request.sessionId,
      bet: request.bet,
      linesMode: lines,
      lines,
      clientNonce: request.clientNonce
    };
  }

  private mapSpinResponse(server: ServerSpinResponse): SpinResponse {
    this.fallbackWallet = { ...server.updatedWallet };

    const ladder = server.jackpotSnapshotAfter ?? server.jackpotLadder ?? {};
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

    const legacyTriggers = server.triggers ?? { emberLock: false, freeQuest: false };
    const triggerFlags = server.triggerFlags ?? {};

    const emberRespinTriggered = Boolean(
      triggerFlags.emberRespin ?? triggerFlags.emberRespinCollectorLock ?? legacyTriggers.emberLock
    );
    const wheelTriggered = Boolean(triggerFlags.wheelAscension ?? triggerFlags.celestialWheelAscension);
    const relicTriggered = Boolean(triggerFlags.relicVaultPick);
    const freeQuestTriggered = Boolean(triggerFlags.freeQuest ?? legacyTriggers.freeQuest);

    const triggerSet = new Set<SpinTrigger>();

    if (emberRespinTriggered) {
      triggerSet.add("EMBER_RESPIN");
      triggerSet.add("EMBER_LOCK");
    }

    if (wheelTriggered) {
      triggerSet.add("WHEEL_ASCENSION");
    }

    if (relicTriggered) {
      triggerSet.add("RELIC_VAULT");
    }

    if (freeQuestTriggered) {
      triggerSet.add("FREE_QUEST");
    }

    if (emberRespinTriggered || wheelTriggered || relicTriggered) {
      triggerSet.add("BONUS");
    }

    const totalWin = toNonNegativeInt(server.totalWin);
    const bonusPayload = this.normalizeBonusPayload(server, totalWin, {
      emberRespinTriggered,
      wheelTriggered,
      relicTriggered
    });

    return {
      spinId: server.spinId,
      reels: server.reels,
      winCoins: totalWin,
      winLines,
      triggers: Array.from(triggerSet),
      bonusPayload,
      wallet: { ...this.fallbackWallet },
      jackpotLadder: { ...this.fallbackJackpot },
      emberLock: {
        active: server.bonusState.emberLock?.active ?? emberRespinTriggered,
        lockedCells: server.bonusState.emberLock?.lockedCells?.length ?? 0,
        respinsRemaining: server.bonusState.emberLock?.respinsRemaining ?? 0
      },
      freeQuest: {
        active: server.bonusState.freeQuest?.active ?? freeQuestTriggered,
        spinsRemaining: server.bonusState.freeQuest?.spinsRemaining ?? 0,
        retriggers: server.bonusState.freeQuest?.active
          ? Math.max(1, Math.round((server.bonusState.freeQuest.retriggerChance ?? 0.2) * 10))
          : 0
      }
    };
  }

  private normalizeBonusPayload(
    server: ServerSpinResponse,
    totalWin: number,
    flags: {
      emberRespinTriggered: boolean;
      wheelTriggered: boolean;
      relicTriggered: boolean;
    }
  ): BonusPayload | null {
    const payload = server.bonusPayload;
    const explicitType = normalizeBonusType(payload?.type);

    if (explicitType) {
      const jackpotAwards = (payload?.jackpotAwards ?? [])
        .map((award) => {
          if (!isJackpotTier(award.tier)) {
            return null;
          }

          return {
            tier: award.tier,
            amount: toNonNegativeInt(award.amount),
            source: typeof award.source === "string" ? award.source : "trigger"
          };
        })
        .filter((award): award is BonusJackpotAward => award !== null);

      return {
        type: explicitType,
        sessionId:
          typeof payload?.sessionId === "string" && payload.sessionId.length > 0
            ? payload.sessionId
            : `${server.spinId}-${explicitType.toLowerCase()}`,
        revealSeed:
          typeof payload?.revealSeed === "string" && payload.revealSeed.length > 0
            ? payload.revealSeed
            : randomNonce(),
        precomputedOutcome: isRecord(payload?.precomputedOutcome) ? payload.precomputedOutcome : {},
        expectedTotalAward: toNonNegativeInt(payload?.expectedTotalAward, totalWin),
        jackpotTiersHit: Array.isArray(payload?.jackpotTiersHit)
          ? payload.jackpotTiersHit.filter((tier): tier is JackpotTier => isJackpotTier(tier))
          : collectJackpotTiersFromAwards(jackpotAwards),
        jackpotAwards
      };
    }

    const fallbackType: BonusType | null = flags.emberRespinTriggered
      ? "EMBER_RESPIN"
      : flags.wheelTriggered
        ? "WHEEL_ASCENSION"
        : flags.relicTriggered
          ? "RELIC_VAULT_PICK"
          : null;

    if (!fallbackType) {
      return null;
    }

    return {
      type: fallbackType,
      sessionId: `${server.spinId}-${fallbackType.toLowerCase()}`,
      revealSeed: randomNonce(),
      precomputedOutcome: this.buildFallbackOutcome(fallbackType, server, totalWin),
      expectedTotalAward: Math.max(totalWin, Math.floor(totalWin * 1.15)),
      jackpotTiersHit: [],
      jackpotAwards: []
    };
  }

  private buildFallbackOutcome(
    type: BonusType,
    server: ServerSpinResponse,
    totalWin: number
  ): Record<string, unknown> {
    if (type === "EMBER_RESPIN") {
      return {
        lockedCells: server.bonusState.emberLock?.lockedCells ?? [],
        orbValues: (server.bonusState.emberLock?.lockedCells ?? []).map((_, index) => 25 + index * 10),
        respinsRemaining: server.bonusState.emberLock?.respinsRemaining ?? 3,
        collectorMultiplier: server.bonusState.emberLock?.collectorMultiplier ?? 1,
        finalAward: Math.max(totalWin, 80)
      };
    }

    if (type === "WHEEL_ASCENSION") {
      return {
        wedgeMap: [
          { wedgeId: "coin-1", kind: "coin", value: 80 },
          { wedgeId: "mult-2", kind: "multiplier", value: 2 },
          { wedgeId: "jackpot-ember", kind: "jackpot", value: "ember" },
          { wedgeId: "respin", kind: "respin", value: 1 }
        ],
        awardedSpins: 2,
        maxSpins: 4,
        outcomesBySpin: [{ wedgeId: "coin-1", resolvedAward: Math.max(60, totalWin) }],
        finalAward: Math.max(totalWin, 90)
      };
    }

    return {
      keyCount: 3,
      board: [
        { slotId: "A1", hidden: "coin" },
        { slotId: "A2", hidden: "multiplier" },
        { slotId: "A3", hidden: "jackpotTier" }
      ],
      picksAllowed: 3,
      picksMade: 0,
      revealed: [],
      guaranteedNonBustFirstPick: true,
      finalAward: Math.max(totalWin, 70)
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
    const scatterCount = reels.flat().filter((symbol) => symbol === "SCT").length;
    const dragonCount = reels.flat().filter((symbol) => symbol === "DRG").length;
    const wildCount = reels.flat().filter((symbol) => symbol === "WLD").length;

    const emberRespin = orbCount >= 6;
    const wheelAscension = scatterCount >= 4 && dragonCount >= 1;
    const relicVault = dragonCount >= 4 && wildCount >= 2;

    const triggerSet = new Set<SpinTrigger>();

    if (emberRespin) {
      triggerSet.add("EMBER_RESPIN");
      triggerSet.add("EMBER_LOCK");
    }

    if (wheelAscension) {
      triggerSet.add("WHEEL_ASCENSION");
    }

    if (relicVault) {
      triggerSet.add("RELIC_VAULT");
    }

    if (emberRespin || wheelAscension || relicVault) {
      triggerSet.add("BONUS");
    }

    if (scatterCount >= 3) {
      triggerSet.add("FREE_QUEST");
    }

    this.applyFallbackContribution(request.bet, winCoins);

    const spinId = `mock-${randomNonce()}`;
    const triggerFlags = {
      emberRespin,
      wheelAscension,
      relicVaultPick: relicVault,
      freeQuest: triggerSet.has("FREE_QUEST")
    };

    const bonusPayload = this.normalizeBonusPayload(
      {
        spinId,
        reels,
        wins: [],
        triggers: {
          emberLock: emberRespin,
          freeQuest: triggerSet.has("FREE_QUEST")
        },
        triggerFlags,
        bonusPayload: null,
        bonusState: {
          emberLock: emberRespin
            ? {
                active: true,
                lockedCells: Array.from({ length: orbCount }, (_, index) => index),
                respinsRemaining: 3,
                collectorMultiplier: Math.random() < 0.33 ? 2 : 1
              }
            : undefined,
          freeQuest: triggerSet.has("FREE_QUEST")
            ? {
                active: true,
                spinsRemaining: 8,
                retriggerChance: 0.2
              }
            : undefined
        },
        totalWin: winCoins,
        updatedWallet: { ...this.fallbackWallet },
        jackpotLadder: { ...this.fallbackJackpot }
      },
      winCoins,
      {
        emberRespinTriggered: emberRespin,
        wheelTriggered: wheelAscension,
        relicTriggered: relicVault
      }
    );

    return {
      spinId,
      reels,
      winCoins,
      winLines,
      triggers: Array.from(triggerSet),
      bonusPayload,
      wallet: { ...this.fallbackWallet },
      jackpotLadder: { ...this.fallbackJackpot },
      emberLock: {
        active: triggerSet.has("EMBER_LOCK"),
        lockedCells: orbCount,
        respinsRemaining: triggerSet.has("EMBER_LOCK") ? 3 : 0
      },
      freeQuest: {
        active: triggerSet.has("FREE_QUEST"),
        spinsRemaining: triggerSet.has("FREE_QUEST") ? 8 : 0,
        retriggers: triggerSet.has("FREE_QUEST") ? 1 : 0
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

  public async spin(
    request: SpinRequest,
    options: { policy?: ApiSpinPolicy } = {}
  ): Promise<SpinResponse> {
    const policy = options.policy ?? "allow-demo-fallback";

    if (this.runtimeMode === "serverless") {
      this.mode = "fallback";

      if (policy === "require-remote") {
        throw new RemoteAuthoritativeUnavailableError(
          "Configured runtime is demo-only and cannot replay spins to a server."
        );
      }

      return this.mockSpin(request);
    }

    try {
      const result = await this.request<ServerSpinResponse>("/spin", {
        method: "POST",
        body: JSON.stringify(this.toSpinRequestBody(request))
      });
      this.mode = "remote";
      return this.mapSpinResponse(result);
    } catch {
      this.mode = "fallback";

      if (policy === "require-remote") {
        throw new RemoteAuthoritativeUnavailableError(
          "Remote spin failed, so the request must remain queued for server replay."
        );
      }

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
    playerId: profileId,
    sessionId,
    bet,
    linesMode: 20,
    lines: 20,
    clientNonce: randomNonce()
  };
}

export const apiClient = new ApiClient();
