import { resolveRuntimeMode, type RuntimeMode } from "../platform/runtimePolicy";

export type JackpotTier = "mini" | "minor" | "major" | "grand";
export type BonusType = "HOLD_AND_SPIN" | "FREE_GAMES";
export type SpinSpeedMode = "normal" | "turbo" | "auto";
export type FeatureSessionTransport = "streamed" | "seeded" | "demo";

export interface FeatureMetric {
  label: string;
  value: string;
}

export interface FeatureStep {
  stepId: string;
  title: string;
  detail: string;
  valueLabel?: string;
  highlight?: boolean;
}

export interface FeatureSessionState {
  transport: FeatureSessionTransport;
  summaryLabel: string;
  remainingLabel: string;
  currentStepIndex: number;
  steps: FeatureStep[];
  metrics: FeatureMetric[];
}

export interface BonusJackpotAward {
  tier: JackpotTier;
  amount: number;
  source: string;
}

export interface BonusPayload {
  type: BonusType;
  sessionId: string;
  revealSeed: string;
  gameVariantId: string;
  freeGamesModifierId: "ROYALS_REMOVED" | "MYSTERY_SPECIAL_REVEAL" | "EXPANDING_WILD_REELS";
  expectedTotalAward: number;
  jackpotTiersHit: JackpotTier[];
  jackpotAwards: BonusJackpotAward[];
  jackpotConfig: {
    resetAmounts: Record<JackpotTier, number>;
    contributionShares: Record<JackpotTier, number>;
    maxBetRequiredForGrand: boolean;
  };
  orbTriggerConfig: {
    minOrbs: number;
    resetSpins: number;
    boardCells: number;
    grandRequiresFullBoard: boolean;
  };
  scatterTriggerConfig: {
    minScatters: number;
    baseAwardedGames: number;
    extraGamesPerExtraScatter: number;
    retriggerAward: number;
  };
  precomputedOutcome: Record<string, unknown>;
  transport: FeatureSessionTransport;
  featureSession: FeatureSessionState;
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

export interface BaseGameMathConfig {
  reels: number;
  rows: number;
  fixedLines: number;
  denominations: number[];
  creditsPerSpinOptions: number[];
  defaultDenomination: number;
  defaultCreditsPerSpin: number;
  maxBetQualifiesGrand: boolean;
  speedModes: SpinSpeedMode[];
  gameVariantId: string;
}

export interface WagerConstraints {
  minBet: number;
  maxBet: number;
}

export interface WagerProfile {
  denomination: number;
  creditsPerSpin: number;
  totalBet: number;
  lineCount: number;
  speedMode: SpinSpeedMode;
  isMaxBet: boolean;
  qualifiesForProgressive: boolean;
  progressiveLabel: string;
}

export interface ConfigResponse {
  minBet: number;
  maxBet: number;
  defaultBet: number;
  jackpotLadder: Record<JackpotTier, number>;
  mathConfig: BaseGameMathConfig;
  gameVariant: {
    id: string;
    label: string;
    cabinetLabel: string;
    theme: string;
    freeGamesModifierId: BonusPayload["freeGamesModifierId"];
  };
}

export interface SpinRequest {
  profileId: string;
  playerId?: string;
  sessionId: string;
  bet: number;
  linesMode: number;
  lines?: number;
  clientNonce: string;
  denomination?: number;
  creditsPerSpin?: number;
  speedMode?: SpinSpeedMode;
  isMaxBet?: boolean;
  qualifiesForProgressive?: boolean;
}

export interface HoldAndSpinStatus {
  active: boolean;
  lockedCount: number;
  respinsRemaining: number;
}

export interface FreeGamesStatus {
  active: boolean;
  gamesRemaining: number;
  retriggers: number;
  modifierId: BonusPayload["freeGamesModifierId"];
}

export interface SpinResponse {
  spinId: string;
  reels: string[][];
  winCoins: number;
  winLines: number[];
  triggerFlags: {
    holdAndSpin: boolean;
    freeGames: boolean;
  };
  bonusPayload: BonusPayload | null;
  wallet: WalletState;
  jackpotLadder: Record<JackpotTier, number>;
  holdAndSpin: HoldAndSpinStatus;
  freeGames: FreeGamesStatus;
}

interface BonusPayloadSource {
  type?: string;
  sessionId?: string;
  revealSeed?: string;
  gameVariantId?: string;
  freeGamesModifierId?: BonusPayload["freeGamesModifierId"];
  expectedTotalAward?: number;
  jackpotTiersHit?: JackpotTier[];
  jackpotAwards?: BonusJackpotAward[];
  jackpotConfig?: BonusPayload["jackpotConfig"];
  orbTriggerConfig?: BonusPayload["orbTriggerConfig"];
  scatterTriggerConfig?: BonusPayload["scatterTriggerConfig"];
  precomputedOutcome?: Record<string, unknown>;
  bonusPayload?: BonusPayloadSource;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:4300").replace(/\/$/, "");
const RUNTIME_MODE: RuntimeMode = resolveRuntimeMode(import.meta.env.VITE_RUNTIME_MODE);
const DEFAULT_PROFILE_ID = "local-dragon";
const DEFAULT_LINE_COUNT = 50;
const DEFAULT_MIN_BET = 25;
const DEFAULT_MAX_BET = 10_000;
const DEFAULT_DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100];
const DEFAULT_CREDITS_PER_SPIN = [25, 50, 75, 100];
const DEFAULT_SPEED_MODES: SpinSpeedMode[] = ["normal", "turbo", "auto"];
const DEFAULT_VARIANT_ID = "dragon-link-flagship";

export class RemoteAuthoritativeUnavailableError extends Error {
  public constructor(message = "Connected runtime unavailable") {
    super(message);
    this.name = "RemoteAuthoritativeUnavailableError";
  }
}

export const DEFAULT_WAGER_CONSTRAINTS: WagerConstraints = {
  minBet: DEFAULT_MIN_BET,
  maxBet: DEFAULT_MAX_BET
};

export const DEFAULT_BASE_GAME_MATH_CONFIG: BaseGameMathConfig = {
  reels: 5,
  rows: 3,
  fixedLines: DEFAULT_LINE_COUNT,
  denominations: [...DEFAULT_DENOMINATIONS],
  creditsPerSpinOptions: [...DEFAULT_CREDITS_PER_SPIN],
  defaultDenomination: 1,
  defaultCreditsPerSpin: 50,
  maxBetQualifiesGrand: true,
  speedModes: [...DEFAULT_SPEED_MODES],
  gameVariantId: DEFAULT_VARIANT_ID
};

const DEFAULT_JACKPOT: Record<JackpotTier, number> = {
  mini: 5_000,
  minor: 25_000,
  major: 100_000,
  grand: 1_000_000
};

const DEFAULT_BONUS_CONFIG = {
  jackpotConfig: {
    resetAmounts: { ...DEFAULT_JACKPOT },
    contributionShares: {
      mini: 0.4,
      minor: 0.3,
      major: 0.2,
      grand: 0.1
    },
    maxBetRequiredForGrand: true
  },
  orbTriggerConfig: {
    minOrbs: 6,
    resetSpins: 3,
    boardCells: 15,
    grandRequiresFullBoard: true
  },
  scatterTriggerConfig: {
    minScatters: 3,
    baseAwardedGames: 10,
    extraGamesPerExtraScatter: 2,
    retriggerAward: 3
  }
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function createFeatureSession(
  payload: Pick<BonusPayload, "type" | "precomputedOutcome" | "expectedTotalAward" | "transport" | "freeGamesModifierId">
): FeatureSessionState {
  const outcome = payload.precomputedOutcome;

  if (payload.type === "HOLD_AND_SPIN") {
    const startingOrbs = Array.isArray(outcome.startingOrbs) ? outcome.startingOrbs : [];
    const steps = Array.isArray(outcome.steps) ? outcome.steps : [];
    const currentStepIndex = Math.max(0, steps.length - 1);

    return {
      transport: payload.transport,
      summaryLabel: `${startingOrbs.length} orbs locked with ${steps.length} reveal beat${steps.length === 1 ? "" : "s"} staged.`,
      remainingLabel: `${readNumber(outcome.respinsRemaining, 3)} respins primed`,
      currentStepIndex,
      metrics: [
        { label: "Locked Orbs", value: String(startingOrbs.length) },
        { label: "Reveal Steps", value: String(steps.length) },
        { label: "Expected Award", value: `${Math.floor(payload.expectedTotalAward).toLocaleString()} coins` }
      ],
      steps: steps.map((step, index) => {
        const record = isRecord(step) ? step : {};
        const landedOrbs = Array.isArray(record.landedOrbs) ? record.landedOrbs.length : 0;
        return {
          stepId: `hold-${index + 1}`,
          title: `Respin ${index + 1}`,
          detail: landedOrbs > 0 ? `${landedOrbs} new orb${landedOrbs === 1 ? "" : "s"} landed.` : "No new orb landed.",
          valueLabel: `${readNumber(record.respinsRemainingAfter, 0)} left`,
          highlight: index === currentStepIndex
        };
      })
    };
  }

  const steps = Array.isArray(outcome.steps) ? outcome.steps : [];
  const currentStepIndex = Math.max(0, steps.length - 1);
  return {
    transport: payload.transport,
    summaryLabel: `${steps.length} free-spin reveal${steps.length === 1 ? "" : "s"} staged under ${payload.freeGamesModifierId.toLowerCase().replace(/_/g, " ")}.`,
    remainingLabel: `${readNumber(outcome.initialGames, 0)} games awarded`,
    currentStepIndex,
    metrics: [
      { label: "Modifier", value: payload.freeGamesModifierId.replace(/_/g, " ") },
      { label: "Awarded Games", value: String(readNumber(outcome.totalAwardedGames, readNumber(outcome.initialGames, 0))) },
      { label: "Expected Award", value: `${Math.floor(payload.expectedTotalAward).toLocaleString()} coins` }
    ],
    steps: steps.map((step, index) => {
      const record = isRecord(step) ? step : {};
      const awardedWin = readNumber(record.awardedWin, 0);
      const extraGames = readNumber(record.awardedExtraGames, 0);
      return {
        stepId: `free-${index + 1}`,
        title: `Game ${index + 1}`,
        detail:
          extraGames > 0
            ? `${awardedWin.toLocaleString()} coins and ${extraGames} retrigger game${extraGames === 1 ? "" : "s"}.`
            : `${awardedWin.toLocaleString()} coins collected.`,
        valueLabel: `${readNumber(record.gamesRemainingAfter, 0)} left`,
        highlight: index === currentStepIndex
      };
    })
  };
}

export function buildWagerProfile(
  mathConfig: BaseGameMathConfig,
  selection: Partial<Pick<WagerProfile, "denomination" | "creditsPerSpin" | "speedMode">>,
  constraints: WagerConstraints = DEFAULT_WAGER_CONSTRAINTS
): WagerProfile {
  const denomination = selection.denomination ?? mathConfig.defaultDenomination;
  const creditsPerSpin = selection.creditsPerSpin ?? mathConfig.defaultCreditsPerSpin;
  const speedMode = selection.speedMode ?? mathConfig.speedModes[0] ?? "normal";
  const totalBet = denomination * creditsPerSpin;
  const clampedBet = clamp(totalBet, constraints.minBet, constraints.maxBet);
  const isMaxBet = creditsPerSpin === Math.max(...mathConfig.creditsPerSpinOptions);
  const qualifiesForProgressive = mathConfig.maxBetQualifiesGrand ? isMaxBet : true;

  return {
    denomination,
    creditsPerSpin,
    totalBet: clampedBet,
    lineCount: mathConfig.fixedLines,
    speedMode,
    isMaxBet,
    qualifiesForProgressive,
    progressiveLabel: qualifiesForProgressive ? "Grand is live at this wager." : "Grand requires max bet."
  };
}

export function getMaxBetSelection(
  mathConfig: BaseGameMathConfig,
  constraints: WagerConstraints = DEFAULT_WAGER_CONSTRAINTS
): Pick<WagerProfile, "denomination" | "creditsPerSpin"> {
  const denomination = mathConfig.denominations[mathConfig.denominations.length - 1] ?? mathConfig.defaultDenomination;
  const creditsPerSpin =
    mathConfig.creditsPerSpinOptions[mathConfig.creditsPerSpinOptions.length - 1] ??
    mathConfig.defaultCreditsPerSpin;

  const totalBet = clamp(denomination * creditsPerSpin, constraints.minBet, constraints.maxBet);
  if (totalBet !== denomination * creditsPerSpin) {
    return {
      denomination: mathConfig.defaultDenomination,
      creditsPerSpin:
        mathConfig.creditsPerSpinOptions[mathConfig.creditsPerSpinOptions.length - 1] ??
        mathConfig.defaultCreditsPerSpin
    };
  }

  return { denomination, creditsPerSpin };
}

export function createSpinRequest(sessionId: string, wager: WagerProfile, playerId = DEFAULT_PROFILE_ID): SpinRequest {
  return {
    profileId: playerId,
    playerId,
    sessionId,
    bet: wager.totalBet,
    linesMode: wager.lineCount,
    lines: wager.lineCount,
    clientNonce: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    denomination: wager.denomination,
    creditsPerSpin: wager.creditsPerSpin,
    speedMode: wager.speedMode,
    isMaxBet: wager.isMaxBet,
    qualifiesForProgressive: wager.qualifiesForProgressive
  };
}

function normalizeConfig(server: Record<string, unknown>): ConfigResponse {
  const gameVariant = isRecord(server.gameVariant) ? server.gameVariant : {};
  const defaultWager = isRecord(server.defaultWager) ? server.defaultWager : {};
  const mathConfig: BaseGameMathConfig = {
    reels: readNumber((server.geometry as Record<string, unknown> | undefined)?.reels, 5),
    rows: readNumber((server.geometry as Record<string, unknown> | undefined)?.rows, 3),
    fixedLines: readNumber((server.geometry as Record<string, unknown> | undefined)?.paylines, DEFAULT_LINE_COUNT),
    denominations: Array.isArray(server.denominationLadder)
      ? server.denominationLadder.filter((value): value is number => typeof value === "number")
      : [...DEFAULT_DENOMINATIONS],
    creditsPerSpinOptions: Array.isArray(server.creditsPerSpinOptions)
      ? server.creditsPerSpinOptions.filter((value): value is number => typeof value === "number")
      : [...DEFAULT_CREDITS_PER_SPIN],
    defaultDenomination: readNumber(defaultWager.denomination, DEFAULT_BASE_GAME_MATH_CONFIG.defaultDenomination),
    defaultCreditsPerSpin: readNumber(
      defaultWager.creditsPerSpin,
      DEFAULT_BASE_GAME_MATH_CONFIG.defaultCreditsPerSpin
    ),
    maxBetQualifiesGrand: true,
    speedModes: Array.isArray(server.supportedSpeedModes)
      ? server.supportedSpeedModes.filter(
          (value): value is SpinSpeedMode => value === "normal" || value === "turbo" || value === "auto"
        )
      : [...DEFAULT_SPEED_MODES],
    gameVariantId: readString(gameVariant.id, DEFAULT_VARIANT_ID)
  };

  return {
    minBet: readNumber(server.minBet, DEFAULT_MIN_BET),
    maxBet: readNumber(server.maxBet, DEFAULT_MAX_BET),
    defaultBet: readNumber(server.defaultBet, mathConfig.defaultDenomination * mathConfig.defaultCreditsPerSpin),
    jackpotLadder: {
      mini: readNumber((server.jackpotLadder as Record<string, unknown> | undefined)?.mini, DEFAULT_JACKPOT.mini),
      minor: readNumber((server.jackpotLadder as Record<string, unknown> | undefined)?.minor, DEFAULT_JACKPOT.minor),
      major: readNumber((server.jackpotLadder as Record<string, unknown> | undefined)?.major, DEFAULT_JACKPOT.major),
      grand: readNumber((server.jackpotLadder as Record<string, unknown> | undefined)?.grand, DEFAULT_JACKPOT.grand)
    },
    mathConfig,
    gameVariant: {
      id: readString(gameVariant.id, DEFAULT_VARIANT_ID),
      label: readString(gameVariant.label, "Dragon Link Flagship"),
      cabinetLabel: readString(gameVariant.cabinetLabel, "Prosperity Cabinet"),
      theme: readString(gameVariant.theme, "Dragon Link-inspired cabinet"),
      freeGamesModifierId:
        readString(gameVariant.freeGamesModifierId, "ROYALS_REMOVED") as BonusPayload["freeGamesModifierId"]
    }
  };
}

function normalizeProfile(server: Record<string, unknown>): ProfileResponse {
  const profile = isRecord(server.profile) ? server.profile : server;

  return {
    playerId: readString(profile.id, DEFAULT_PROFILE_ID),
    nickname: readString(profile.nickname, "Dragon Player"),
    level: readNumber(profile.level, 1),
    wallet: {
      coins: readNumber(profile.coins, 50_000),
      gems: readNumber(profile.gems, 0),
      lifetimeSpins: readNumber(profile.lifetimeSpins, 0),
      lifetimeWins: readNumber(profile.lifetimeWins, 0)
    }
  };
}

export function createBonusPayloadFromSource(
  source: unknown,
  options: { transport: FeatureSessionTransport }
): BonusPayload | null {
  const record = isRecord(source) ? source : null;
  const payloadSource = isRecord(record?.bonusPayload) ? (record?.bonusPayload as BonusPayloadSource) : (record as BonusPayloadSource | null);
  if (!payloadSource?.type || !payloadSource.sessionId || !payloadSource.revealSeed) {
    return null;
  }

  const type = payloadSource.type === "HOLD_AND_SPIN" ? "HOLD_AND_SPIN" : payloadSource.type === "FREE_GAMES" ? "FREE_GAMES" : null;
  if (!type) {
    return null;
  }

  const normalizedPayload: BonusPayload = {
    type,
    sessionId: payloadSource.sessionId,
    revealSeed: payloadSource.revealSeed,
    gameVariantId: readString(payloadSource.gameVariantId, DEFAULT_VARIANT_ID),
    freeGamesModifierId: payloadSource.freeGamesModifierId ?? "ROYALS_REMOVED",
    expectedTotalAward: readNumber(payloadSource.expectedTotalAward, 0),
    jackpotTiersHit: Array.isArray(payloadSource.jackpotTiersHit)
      ? payloadSource.jackpotTiersHit.filter(
          (tier): tier is JackpotTier => tier === "mini" || tier === "minor" || tier === "major" || tier === "grand"
        )
      : [],
    jackpotAwards: Array.isArray(payloadSource.jackpotAwards)
      ? payloadSource.jackpotAwards.filter(
          (award): award is BonusJackpotAward =>
            isRecord(award) &&
            (award.tier === "mini" || award.tier === "minor" || award.tier === "major" || award.tier === "grand") &&
            typeof award.amount === "number" &&
            typeof award.source === "string"
        )
      : [],
    jackpotConfig: payloadSource.jackpotConfig ?? { ...DEFAULT_BONUS_CONFIG.jackpotConfig },
    orbTriggerConfig: payloadSource.orbTriggerConfig ?? { ...DEFAULT_BONUS_CONFIG.orbTriggerConfig },
    scatterTriggerConfig: payloadSource.scatterTriggerConfig ?? { ...DEFAULT_BONUS_CONFIG.scatterTriggerConfig },
    precomputedOutcome: payloadSource.precomputedOutcome ?? {},
    transport: options.transport,
    featureSession: {
      transport: options.transport,
      summaryLabel: "",
      remainingLabel: "",
      currentStepIndex: 0,
      steps: [],
      metrics: []
    }
  };

  normalizedPayload.featureSession = createFeatureSession(normalizedPayload);
  return normalizedPayload;
}

function normalizeSpin(server: Record<string, unknown>, transport: FeatureSessionTransport): SpinResponse {
  const bonusPayload = createBonusPayloadFromSource(server.bonusPayload, { transport });
  const triggerFlags = isRecord(server.triggers)
    ? {
        holdAndSpin: Boolean(server.triggers.holdAndSpin),
        freeGames: Boolean(server.triggers.freeGames)
      }
    : {
        holdAndSpin: Boolean((server.triggerFlags as Record<string, unknown> | undefined)?.holdAndSpin),
        freeGames: Boolean((server.triggerFlags as Record<string, unknown> | undefined)?.freeGames)
      };

  return {
    spinId: readString(server.spinId, `spin-${Date.now()}`),
    reels: Array.isArray(server.reels)
      ? (server.reels as unknown[]).map((column) => readStringArray(column))
      : Array.isArray(server.grid)
        ? (server.grid as unknown[]).map((column) => readStringArray(column))
        : [],
    winCoins: readNumber(server.totalWin, 0),
    winLines: Array.isArray(server.lineWins)
      ? (server.lineWins as Array<Record<string, unknown>>).map((lineWin) => readNumber(lineWin.lineIndex, 0))
      : [],
    triggerFlags,
    bonusPayload,
    wallet: isRecord(server.wallet)
      ? {
          coins: readNumber(server.wallet.coins, 0),
          gems: readNumber(server.wallet.gems, 0),
          lifetimeSpins: readNumber(server.wallet.lifetimeSpins, 0),
          lifetimeWins: readNumber(server.wallet.lifetimeWins, 0)
        }
      : {
          coins: 0,
          gems: 0,
          lifetimeSpins: 0,
          lifetimeWins: 0
        },
    jackpotLadder: {
      mini: readNumber((server.jackpotLadder as Record<string, unknown> | undefined)?.mini, DEFAULT_JACKPOT.mini),
      minor: readNumber((server.jackpotLadder as Record<string, unknown> | undefined)?.minor, DEFAULT_JACKPOT.minor),
      major: readNumber((server.jackpotLadder as Record<string, unknown> | undefined)?.major, DEFAULT_JACKPOT.major),
      grand: readNumber((server.jackpotLadder as Record<string, unknown> | undefined)?.grand, DEFAULT_JACKPOT.grand)
    },
    holdAndSpin: {
      active: Boolean((server.holdAndSpinState as Record<string, unknown> | undefined)?.active ?? triggerFlags.holdAndSpin),
      lockedCount: readNumber((server.holdAndSpinState as Record<string, unknown> | undefined)?.lockedCount, 0),
      respinsRemaining: readNumber(
        (server.holdAndSpinState as Record<string, unknown> | undefined)?.respinsRemaining,
        triggerFlags.holdAndSpin ? 3 : 0
      )
    },
    freeGames: {
      active: Boolean((server.freeGamesState as Record<string, unknown> | undefined)?.active ?? triggerFlags.freeGames),
      gamesRemaining: readNumber(
        (server.freeGamesState as Record<string, unknown> | undefined)?.gamesRemaining,
        triggerFlags.freeGames ? 10 : 0
      ),
      retriggers: readNumber((server.freeGamesState as Record<string, unknown> | undefined)?.retriggerCount, 0),
      modifierId:
        (readString(
          (server.freeGamesState as Record<string, unknown> | undefined)?.modifierId,
          bonusPayload?.freeGamesModifierId ?? "ROYALS_REMOVED"
        ) as FreeGamesStatus["modifierId"]) ?? "ROYALS_REMOVED"
    }
  };
}

function demoSpin(request: SpinRequest): SpinResponse {
  const symbols = ["ten", "jack", "queen", "king", "ace", "coin", "lantern", "ingot", "dragon", "wild", "orb", "scatter"];
  const seed = Array.from(request.clientNonce).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const reels = Array.from({ length: 5 }, (_, reelIndex) =>
    Array.from({ length: 3 }, (_, rowIndex) => symbols[(seed + reelIndex * 7 + rowIndex * 3) % symbols.length]!)
  );
  const orbCount = reels.flat().filter((symbol) => symbol === "orb").length;
  const scatterCount = reels.flat().filter((symbol) => symbol === "scatter").length;
  const holdAndSpin = orbCount >= 6;
  const freeGames = !holdAndSpin && scatterCount >= 3;
  const winCoins = holdAndSpin ? 0 : freeGames ? Math.floor(request.bet * 0.5) : (seed % 3 === 0 ? Math.floor(request.bet * 0.8) : 0);

  const rawPayload =
    holdAndSpin || freeGames
      ? {
          type: holdAndSpin ? "HOLD_AND_SPIN" : "FREE_GAMES",
          sessionId: `demo-${request.clientNonce}`,
          revealSeed: `demo-seed-${request.clientNonce}`,
          gameVariantId: DEFAULT_VARIANT_ID,
          freeGamesModifierId: "ROYALS_REMOVED" as const,
          expectedTotalAward: holdAndSpin ? request.bet * 4 : request.bet * 3,
          jackpotTiersHit: holdAndSpin && request.isMaxBet ? (["mini"] as JackpotTier[]) : [],
          jackpotAwards: holdAndSpin && request.isMaxBet ? [{ tier: "mini" as JackpotTier, amount: DEFAULT_JACKPOT.mini, source: "demo" }] : [],
          jackpotConfig: DEFAULT_BONUS_CONFIG.jackpotConfig,
          orbTriggerConfig: DEFAULT_BONUS_CONFIG.orbTriggerConfig,
          scatterTriggerConfig: DEFAULT_BONUS_CONFIG.scatterTriggerConfig,
          precomputedOutcome: holdAndSpin
            ? {
                type: "HOLD_AND_SPIN",
                gameVariantId: DEFAULT_VARIANT_ID,
                startingOrbs: Array.from({ length: 6 }, (_, index) => ({
                  position: index,
                  coinValue: request.bet * 0.25
                })),
                steps: [
                  {
                    respinIndex: 1,
                    landedOrbs: [{ position: 8, coinValue: request.bet * 0.5 }],
                    respinsRemainingAfter: 3,
                    boardCompleted: false
                  }
                ],
                filledPositions: [0, 1, 2, 3, 4, 5, 8],
                respinsRemaining: 2,
                jackpotTierHits: request.isMaxBet ? ["mini"] : [],
                finalAward: request.bet * 4
              }
            : {
                type: "FREE_GAMES",
                gameVariantId: DEFAULT_VARIANT_ID,
                modifierId: "ROYALS_REMOVED",
                initialGames: 10,
                totalAwardedGames: 10,
                retriggerCount: 0,
                steps: [
                  {
                    spinIndex: 1,
                    lineWin: request.bet * 0.4,
                    awardedWin: request.bet * 0.6,
                    runningAward: request.bet * 0.6,
                    scatterCount: 2,
                    retriggered: false,
                    awardedExtraGames: 0,
                    gamesRemainingAfter: 9,
                    multiplier: 1
                  }
                ],
                finalAward: request.bet * 3
              }
        }
      : null;

  return {
    spinId: `demo-spin-${Date.now()}`,
    reels,
    winCoins,
    winLines: winCoins > 0 ? [0] : [],
    triggerFlags: { holdAndSpin, freeGames },
    bonusPayload: rawPayload ? createBonusPayloadFromSource(rawPayload, { transport: "demo" }) : null,
    wallet: {
      coins: 50_000 - request.bet + winCoins,
      gems: 0,
      lifetimeSpins: 1,
      lifetimeWins: winCoins
    },
    jackpotLadder: { ...DEFAULT_JACKPOT },
    holdAndSpin: {
      active: holdAndSpin,
      lockedCount: holdAndSpin ? 6 : 0,
      respinsRemaining: holdAndSpin ? 3 : 0
    },
    freeGames: {
      active: freeGames,
      gamesRemaining: freeGames ? 10 : 0,
      retriggers: 0,
      modifierId: "ROYALS_REMOVED"
    }
  };
}

class ApiClient {
  private apiMode: "remote" | "fallback" = RUNTIME_MODE === "hybrid" ? "remote" : "fallback";

  public get mode(): "remote" | "fallback" {
    return this.apiMode;
  }

  private async fetchJson(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(`${API_BASE_URL}${path}`, init);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }

  public async getProfile(profileId = DEFAULT_PROFILE_ID): Promise<ProfileResponse> {
    if (RUNTIME_MODE !== "hybrid") {
      this.apiMode = "fallback";
      return {
        playerId: profileId,
        nickname: "Demo Dragon",
        level: 1,
        wallet: {
          coins: 50_000,
          gems: 0,
          lifetimeSpins: 0,
          lifetimeWins: 0
        }
      };
    }

    try {
      const payload = await this.fetchJson(`/profile/${profileId}`);
      this.apiMode = "remote";
      return normalizeProfile(payload);
    } catch {
      this.apiMode = "fallback";
      return {
        playerId: profileId,
        nickname: "Offline Dragon",
        level: 1,
        wallet: {
          coins: 50_000,
          gems: 0,
          lifetimeSpins: 0,
          lifetimeWins: 0
        }
      };
    }
  }

  public async getConfig(): Promise<ConfigResponse> {
    if (RUNTIME_MODE !== "hybrid") {
      this.apiMode = "fallback";
      return {
        minBet: DEFAULT_MIN_BET,
        maxBet: DEFAULT_MAX_BET,
        defaultBet: DEFAULT_BASE_GAME_MATH_CONFIG.defaultDenomination * DEFAULT_BASE_GAME_MATH_CONFIG.defaultCreditsPerSpin,
        jackpotLadder: { ...DEFAULT_JACKPOT },
        mathConfig: { ...DEFAULT_BASE_GAME_MATH_CONFIG },
        gameVariant: {
          id: DEFAULT_VARIANT_ID,
          label: "Dragon Link Flagship",
          cabinetLabel: "Prosperity Cabinet",
          theme: "Dragon Link-inspired cabinet",
          freeGamesModifierId: "ROYALS_REMOVED"
        }
      };
    }

    try {
      const payload = await this.fetchJson("/config");
      this.apiMode = "remote";
      return normalizeConfig(payload);
    } catch {
      this.apiMode = "fallback";
      return {
        minBet: DEFAULT_MIN_BET,
        maxBet: DEFAULT_MAX_BET,
        defaultBet: DEFAULT_BASE_GAME_MATH_CONFIG.defaultDenomination * DEFAULT_BASE_GAME_MATH_CONFIG.defaultCreditsPerSpin,
        jackpotLadder: { ...DEFAULT_JACKPOT },
        mathConfig: { ...DEFAULT_BASE_GAME_MATH_CONFIG },
        gameVariant: {
          id: DEFAULT_VARIANT_ID,
          label: "Dragon Link Flagship",
          cabinetLabel: "Prosperity Cabinet",
          theme: "Dragon Link-inspired cabinet",
          freeGamesModifierId: "ROYALS_REMOVED"
        }
      };
    }
  }

  public async spin(
    request: SpinRequest,
    options: { policy?: "allow-fallback" | "require-remote" } = {}
  ): Promise<SpinResponse> {
    if (RUNTIME_MODE !== "hybrid") {
      this.apiMode = "fallback";
      return demoSpin(request);
    }

    try {
      const payload = await this.fetchJson("/spin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      });
      this.apiMode = "remote";
      return normalizeSpin(payload, "streamed");
    } catch (error) {
      this.apiMode = "fallback";
      if (options.policy === "require-remote") {
        throw new RemoteAuthoritativeUnavailableError(
          error instanceof Error ? error.message : "Connected runtime unavailable"
        );
      }

      return demoSpin(request);
    }
  }
}

export const apiClient = new ApiClient();
