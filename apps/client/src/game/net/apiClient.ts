import { resolveRuntimeMode, type RuntimeMode } from "../platform/runtimePolicy";

export type JackpotTier = "ember" | "relic" | "mythic" | "throne";

export type BonusType = "EMBER_RESPIN" | "WHEEL_ASCENSION" | "RELIC_VAULT_PICK";

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
  precomputedOutcome: Record<string, unknown>;
  expectedTotalAward: number;
  jackpotTiersHit: JackpotTier[];
  jackpotAwards: BonusJackpotAward[];
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
const DEFAULT_LINE_COUNT = 50;
const DEFAULT_MIN_BET = 10;
const DEFAULT_MAX_BET = 500;
const DEFAULT_BET = 25;
const DEFAULT_DENOMINATIONS = [1, 2, 5];
const DEFAULT_CREDITS_PER_SPIN = [10, 25, 50, 75, 100];
const DEFAULT_SPEED_MODES: SpinSpeedMode[] = ["normal", "turbo", "auto"];
const DEFAULT_BOARD_CELLS = 15;

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
  defaultCreditsPerSpin: 25,
  maxBetQualifiesGrand: true,
  speedModes: [...DEFAULT_SPEED_MODES]
};

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

interface WagerCombo {
  denomination: number;
  creditsPerSpin: number;
  totalBet: number;
}

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
  paylines?: number;
  fixedLines?: number;
  denominations?: number[];
  creditsPerSpinOptions?: number[];
  defaultDenomination?: number;
  defaultCreditsPerSpin?: number;
  maxBetQualifiesGrand?: boolean;
  speedModes?: string[];
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
    transport?: string;
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

function normalizeSpeedMode(value: unknown): SpinSpeedMode | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "normal" || normalized === "turbo" || normalized === "auto") {
    return normalized;
  }

  return null;
}

function normalizeTransport(value: unknown): FeatureSessionTransport | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "streamed" || normalized === "stream") {
    return "streamed";
  }

  if (normalized === "demo" || normalized === "fallback") {
    return "demo";
  }

  if (normalized === "seeded" || normalized === "snapshot" || normalized === "session") {
    return "seeded";
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sanitizePositiveOptions(values: unknown, fallback: number[]): number[] {
  const source = Array.isArray(values) ? values : fallback;
  const deduped = new Set<number>();

  for (const entry of source) {
    const value = toNonNegativeInt(entry, 0);
    if (value > 0) {
      deduped.add(value);
    }
  }

  const options = Array.from(deduped).sort((left, right) => left - right);
  return options.length > 0 ? options : [...fallback];
}

function sanitizeSpeedModes(values: unknown): SpinSpeedMode[] {
  const source = Array.isArray(values) ? values : DEFAULT_SPEED_MODES;
  const modes = Array.from(
    new Set(source.map((entry) => normalizeSpeedMode(entry)).filter((entry): entry is SpinSpeedMode => entry !== null))
  );

  return modes.length > 0 ? modes : [...DEFAULT_SPEED_MODES];
}

function randomNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
  return Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => randomWeightedSymbol()));
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

function collectJackpotTiersFromAwards(awards: BonusJackpotAward[]): JackpotTier[] {
  return Array.from(new Set(awards.map((award) => award.tier)));
}

function labelize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toNonNegativeInt(entry, -1))
    .filter((entry): entry is number => entry >= 0);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function normalizeBoardIndex(value: number): number | null {
  if (value >= 0 && value < DEFAULT_BOARD_CELLS) {
    return value;
  }

  if (value >= 1 && value <= DEFAULT_BOARD_CELLS) {
    return value - 1;
  }

  return null;
}

function readValueFromKeys(record: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number") {
      return `${toNonNegativeInt(value).toLocaleString()} coins`;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      return labelize(value);
    }
  }

  return fallback;
}

function readDisplayValue(record: Record<string, unknown>, fallback: string): string {
  const value = record.value;

  if (typeof value === "number") {
    return `${toNonNegativeInt(value).toLocaleString()} coins`;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return labelize(value);
  }

  return fallback;
}

function featureTransportLabel(transport: FeatureSessionTransport): string {
  if (transport === "streamed") {
    return "Authoritative stream";
  }

  if (transport === "demo") {
    return "Demo staging";
  }

  return "Seeded snapshot";
}

function hasStructuredSessionData(outcome: Record<string, unknown>): boolean {
  return (
    Array.isArray(outcome.steps) ||
    Array.isArray(outcome.outcomesBySpin) ||
    Array.isArray(outcome.pickResults) ||
    Array.isArray(outcome.resolvedSteps)
  );
}

function appendPendingStep(
  steps: FeatureStep[],
  title: string,
  detail: string,
  valueLabel: string
): FeatureStep[] {
  return [
    ...steps,
    {
      stepId: `${title.toLowerCase().replace(/\s+/g, "-")}-pending`,
      title,
      detail,
      valueLabel,
      highlight: true
    }
  ];
}

function buildEmberFeatureSession(
  outcome: Record<string, unknown>,
  transport: FeatureSessionTransport
): FeatureSessionState {
  const startingOrbs = toRecordArray(outcome.startingOrbs);
  const revealSteps = toRecordArray(outcome.steps);
  const lockedCells =
    startingOrbs.length > 0
      ? startingOrbs
          .map((entry) => normalizeBoardIndex(toNonNegativeInt(entry.position, -1)))
          .filter((entry): entry is number => entry !== null)
      : toNumberArray(outcome.lockedCells)
          .map((entry) => normalizeBoardIndex(entry))
          .filter((entry): entry is number => entry !== null);
  const collectorMultiplier = Math.max(1, toNonNegativeInt(outcome.collectorMultiplier, 1));
  const latestStep = revealSteps[revealSteps.length - 1];
  const respinsRemaining = latestStep
    ? toNonNegativeInt(latestStep.respinsRemainingAfter, toNonNegativeInt(outcome.respinsRemaining, 3))
    : toNonNegativeInt(outcome.respinsRemaining, 3);

  let steps: FeatureStep[] = revealSteps.length
    ? revealSteps.map((step, index) => {
        const landedOrbs = toRecordArray(step.landedOrbs).length;
        const resolvedRespins = toNonNegativeInt(step.respinsRemainingAfter, respinsRemaining);
        const collector = Math.max(1, toNonNegativeInt(step.collectorMultiplierAfter, collectorMultiplier));
        return {
          stepId: `ember-${index + 1}`,
          title: `Respin ${toNonNegativeInt(step.respinIndex, index + 1)}`,
          detail:
            landedOrbs > 0
              ? `${landedOrbs} orb${landedOrbs === 1 ? "" : "s"} landed and the counter reset.`
              : "No new orb landed before the collector paused the board.",
          valueLabel: `${resolvedRespins} respins left · x${collector}`,
          highlight: landedOrbs > 0
        };
      })
    : [
        {
          stepId: "ember-lock",
          title: "Lock Board",
          detail: `${lockedCells.length} orb position${lockedCells.length === 1 ? "" : "s"} locked onto the 5x3 cabinet.`,
          valueLabel: `${lockedCells.length}/15 locked`,
          highlight: lockedCells.length >= 6
        },
        {
          stepId: "ember-collector",
          title: "Collector Tally",
          detail: "Collector symbols total the locked orb values before the next respin window.",
          valueLabel: `x${collectorMultiplier}`
        },
        {
          stepId: "ember-award",
          title: "Award Settle",
          detail: "The cabinet settles the hold-and-spin prize once the final countdown expires.",
          valueLabel: `${toNonNegativeInt(outcome.finalAward, 0).toLocaleString()} coins`
        }
      ];

  if (respinsRemaining > 0 && transport !== "demo") {
    steps = appendPendingStep(
      steps,
      "Pending Respins",
      "The server can continue streaming collector resets until the board locks or expires.",
      `${respinsRemaining} still hidden`
    );
  }

  return {
    transport,
    summaryLabel: `${lockedCells.length} locked cells across the 5x3 board`,
    remainingLabel:
      respinsRemaining > 0 ? `${respinsRemaining} respin${respinsRemaining === 1 ? "" : "s"} remaining` : "Collector board settled",
    currentStepIndex: Math.max(0, steps.length - 1),
    steps,
    metrics: [
      { label: "Locked Cells", value: `${lockedCells.length}/15` },
      { label: "Respins Remaining", value: `${respinsRemaining}` },
      { label: "Collector Multiplier", value: `x${collectorMultiplier}` },
      { label: "Session Transport", value: featureTransportLabel(transport) }
    ]
  };
}

function buildWheelFeatureSession(
  outcome: Record<string, unknown>,
  transport: FeatureSessionTransport
): FeatureSessionState {
  const wedgeMap = toRecordArray(outcome.wedgeMap);
  const resolvedSteps = toRecordArray(outcome.resolvedSteps);
  const outcomesBySpin = resolvedSteps.length > 0 ? resolvedSteps : toRecordArray(outcome.outcomesBySpin);
  const awardedSpins = Math.max(1, toNonNegativeInt(outcome.awardedSpins, outcomesBySpin.length || 1));
  const maxSpins = Math.max(awardedSpins, toNonNegativeInt(outcome.maxSpins, awardedSpins));
  const remainingSpins = Math.max(0, maxSpins - outcomesBySpin.length);

  let steps: FeatureStep[] = outcomesBySpin.length
    ? outcomesBySpin.map((entry, index) => {
        const jackpotTier = typeof entry.jackpotTier === "string" ? entry.jackpotTier : null;
        const detailLabel = jackpotTier
          ? `${labelize(jackpotTier)} jackpot stop resolved on the orbit wheel.`
          : `${labelize(readString(entry.kind, readString(entry.wedgeId, "reward")))} stop resolved from the seeded wheel.`;
        return {
          stepId: `wheel-${index + 1}`,
          title: `Wheel Stop ${index + 1}`,
          detail: detailLabel,
          valueLabel: readValueFromKeys(entry, ["resolvedAward", "value"], "Stored"),
          highlight: jackpotTier !== null
        };
      })
    : wedgeMap.slice(0, 4).map((entry, index) => ({
        stepId: `wheel-lane-${index + 1}`,
        title: `Lane ${index + 1}`,
        detail: `${labelize(readString(entry.kind, "reward"))} wedge is loaded on the wheel ring.`,
        valueLabel: readDisplayValue(entry, "Mystery"),
        highlight: readString(entry.kind, "reward") === "jackpot"
      }));

  if (remainingSpins > 0 && transport !== "demo") {
    steps = appendPendingStep(
      steps,
      "Pending Wheel Stops",
      "Additional wheel beats remain hidden until the connected session streams the next stop.",
      `${remainingSpins} remaining`
    );
  }

  return {
    transport,
    summaryLabel: `${Math.max(outcomesBySpin.length, 1)} of ${maxSpins} wheel beats visible`,
    remainingLabel:
      remainingSpins > 0 ? `${remainingSpins} wheel beat${remainingSpins === 1 ? "" : "s"} pending` : "Wheel session settled",
    currentStepIndex: Math.max(0, steps.length - 1),
    steps,
    metrics: [
      { label: "Awarded Spins", value: `${awardedSpins}` },
      { label: "Spin Cap", value: `${maxSpins}` },
      { label: "Resolved Wedges", value: `${Math.max(outcomesBySpin.length, wedgeMap.length)}` },
      { label: "Session Transport", value: featureTransportLabel(transport) }
    ]
  };
}

function buildRelicFeatureSession(
  outcome: Record<string, unknown>,
  transport: FeatureSessionTransport
): FeatureSessionState {
  const keyCount = Math.max(1, toNonNegativeInt(outcome.keyCount, 3));
  const picksAllowed = Math.max(1, toNonNegativeInt(outcome.picksAllowed, keyCount));
  const picksMade = Math.min(
    picksAllowed,
    Math.max(toNonNegativeInt(outcome.picksMade, 0), toRecordArray(outcome.pickResults).length, toStringArray(outcome.revealed).length)
  );
  const remainingPicks = Math.max(0, picksAllowed - picksMade);
  const pickResults = toRecordArray(outcome.pickResults);
  const board = toRecordArray(outcome.board);

  let steps: FeatureStep[] = pickResults.length
    ? pickResults.map((entry, index) => ({
        stepId: `vault-${index + 1}`,
        title: `Pick ${index + 1}`,
        detail: `Tile ${readString(entry.slotId, `S${index + 1}`)} opened from the seeded relic chamber.`,
        valueLabel: readValueFromKeys(entry, ["value", "jackpotTierGranted", "hidden"], "Revealed"),
        highlight: typeof entry.jackpotTierGranted === "string"
      }))
    : [
        {
          stepId: "vault-open",
          title: "Open Chamber",
          detail: `${board.length || 12} tiles wait behind the vault seal once the feature opens.`,
          valueLabel: `${keyCount} keys granted`
        },
        {
          stepId: "vault-pick",
          title: "Seeded Picks",
          detail: "Each pick resolves from the trigger-time seed rather than a client-invented choice.",
          valueLabel: `${picksAllowed} picks allowed`
        },
        {
          stepId: "vault-settle",
          title: "Vault Settle",
          detail: "The feature banks jackpot emblems, multipliers, and coin reveals after the final key.",
          valueLabel: `${toNonNegativeInt(outcome.finalAward, 0).toLocaleString()} coins`
        }
      ];

  if (remainingPicks > 0 && transport !== "demo") {
    steps = appendPendingStep(
      steps,
      "Pending Picks",
      "Connected play can continue streaming vault selections until the final key is spent.",
      `${remainingPicks} remaining`
    );
  }

  return {
    transport,
    summaryLabel: `${picksMade} of ${picksAllowed} vault picks revealed`,
    remainingLabel:
      remainingPicks > 0 ? `${remainingPicks} key${remainingPicks === 1 ? "" : "s"} still available` : "Vault chamber settled",
    currentStepIndex: Math.max(0, steps.length - 1),
    steps,
    metrics: [
      { label: "Keys", value: `${keyCount}` },
      { label: "Picks Allowed", value: `${picksAllowed}` },
      { label: "Picks Made", value: `${picksMade}` },
      { label: "Session Transport", value: featureTransportLabel(transport) }
    ]
  };
}

export function createFeatureSessionState(
  type: BonusType,
  outcome: Record<string, unknown>,
  transport: FeatureSessionTransport
): FeatureSessionState {
  if (type === "EMBER_RESPIN") {
    return buildEmberFeatureSession(outcome, transport);
  }

  if (type === "WHEEL_ASCENSION") {
    return buildWheelFeatureSession(outcome, transport);
  }

  return buildRelicFeatureSession(outcome, transport);
}

function buildAllWagerCombos(mathConfig: BaseGameMathConfig): WagerCombo[] {
  const combos: WagerCombo[] = [];

  for (const denomination of mathConfig.denominations) {
    for (const creditsPerSpin of mathConfig.creditsPerSpinOptions) {
      combos.push({
        denomination,
        creditsPerSpin,
        totalBet: denomination * creditsPerSpin
      });
    }
  }

  return combos.sort(
    (left, right) =>
      left.totalBet - right.totalBet || left.denomination - right.denomination || left.creditsPerSpin - right.creditsPerSpin
  );
}

function chooseClosestCombo(combos: WagerCombo[], targetTotalBet: number): WagerCombo {
  const fallback = combos[0] ?? {
    denomination: DEFAULT_BASE_GAME_MATH_CONFIG.defaultDenomination,
    creditsPerSpin: DEFAULT_BASE_GAME_MATH_CONFIG.defaultCreditsPerSpin,
    totalBet: DEFAULT_BASE_GAME_MATH_CONFIG.defaultDenomination * DEFAULT_BASE_GAME_MATH_CONFIG.defaultCreditsPerSpin
  };

  return combos.reduce((best, candidate) => {
    const candidateDistance = Math.abs(candidate.totalBet - targetTotalBet);
    const bestDistance = Math.abs(best.totalBet - targetTotalBet);
    return candidateDistance < bestDistance ? candidate : best;
  }, fallback);
}

function buildAllowedWagerCombos(
  mathConfig: BaseGameMathConfig,
  constraints: WagerConstraints
): WagerCombo[] {
  const allCombos = buildAllWagerCombos(mathConfig);
  const minBet = Math.max(1, constraints.minBet);
  const maxBet = Math.max(minBet, constraints.maxBet);
  const inRange = allCombos.filter((combo) => combo.totalBet >= minBet && combo.totalBet <= maxBet);

  if (inRange.length > 0) {
    return inRange;
  }

  const underCeiling = allCombos.filter((combo) => combo.totalBet <= maxBet);
  if (underCeiling.length > 0) {
    return underCeiling;
  }

  return allCombos;
}

export function getMaxBetSelection(
  mathConfig: BaseGameMathConfig,
  constraints: WagerConstraints = DEFAULT_WAGER_CONSTRAINTS
): Pick<WagerProfile, "denomination" | "creditsPerSpin" | "totalBet"> {
  const combos = buildAllowedWagerCombos(mathConfig, constraints);
  const selected = combos[combos.length - 1] ?? chooseClosestCombo(buildAllWagerCombos(mathConfig), constraints.maxBet);

  return {
    denomination: selected.denomination,
    creditsPerSpin: selected.creditsPerSpin,
    totalBet: selected.totalBet
  };
}

export function buildWagerProfile(
  mathConfig: BaseGameMathConfig,
  selection: Partial<Pick<WagerProfile, "denomination" | "creditsPerSpin" | "speedMode">>,
  constraints: WagerConstraints = DEFAULT_WAGER_CONSTRAINTS
): WagerProfile {
  const allowedCombos = buildAllowedWagerCombos(mathConfig, constraints);
  const allCombos = buildAllWagerCombos(mathConfig);
  const safeSelection = {
    denomination: toNonNegativeInt(selection.denomination, mathConfig.defaultDenomination),
    creditsPerSpin: toNonNegativeInt(selection.creditsPerSpin, mathConfig.defaultCreditsPerSpin)
  };
  const requestedTotal = safeSelection.denomination * safeSelection.creditsPerSpin;
  const byExactMatch = allowedCombos.find(
    (combo) => combo.denomination === safeSelection.denomination && combo.creditsPerSpin === safeSelection.creditsPerSpin
  );
  const selectedCombo =
    byExactMatch ??
    chooseClosestCombo(
      allowedCombos.length > 0 ? allowedCombos : allCombos,
      requestedTotal || mathConfig.defaultDenomination * mathConfig.defaultCreditsPerSpin
    );
  const maxCombo = getMaxBetSelection(mathConfig, constraints);
  const speedMode =
    normalizeSpeedMode(selection.speedMode) ?? mathConfig.speedModes[0] ?? DEFAULT_BASE_GAME_MATH_CONFIG.speedModes[0] ?? "normal";
  const isMaxBet = selectedCombo.totalBet >= maxCombo.totalBet;
  const qualifiesForProgressive = mathConfig.maxBetQualifiesGrand ? isMaxBet : true;
  const progressiveLabel = mathConfig.maxBetQualifiesGrand
    ? isMaxBet
      ? "Grand progressive active on this wager"
      : `Grand progressive requires max bet of ${maxCombo.totalBet.toLocaleString()} coins`
    : "All progressive tiers qualify on every wager";

  return {
    denomination: selectedCombo.denomination,
    creditsPerSpin: selectedCombo.creditsPerSpin,
    totalBet: selectedCombo.totalBet,
    lineCount: mathConfig.fixedLines,
    speedMode,
    isMaxBet,
    qualifiesForProgressive,
    progressiveLabel
  };
}

function normalizeMathConfig(
  server: ServerConfigResponse,
  constraints: WagerConstraints
): BaseGameMathConfig {
  const mathConfig: BaseGameMathConfig = {
    reels: 5,
    rows: 3,
    fixedLines: clamp(
      toNonNegativeInt(server.fixedLines ?? server.paylines, DEFAULT_BASE_GAME_MATH_CONFIG.fixedLines),
      1,
      100
    ),
    denominations: sanitizePositiveOptions(server.denominations, DEFAULT_DENOMINATIONS),
    creditsPerSpinOptions: sanitizePositiveOptions(server.creditsPerSpinOptions, DEFAULT_CREDITS_PER_SPIN),
    defaultDenomination: toNonNegativeInt(server.defaultDenomination, DEFAULT_BASE_GAME_MATH_CONFIG.defaultDenomination),
    defaultCreditsPerSpin: toNonNegativeInt(server.defaultCreditsPerSpin, DEFAULT_BASE_GAME_MATH_CONFIG.defaultCreditsPerSpin),
    maxBetQualifiesGrand: server.maxBetQualifiesGrand ?? true,
    speedModes: sanitizeSpeedModes(server.speedModes)
  };
  const defaultTarget = toNonNegativeInt(server.defaultBet, DEFAULT_BET);
  const defaultWager = buildWagerProfile(
    mathConfig,
    {
      denomination: mathConfig.defaultDenomination,
      creditsPerSpin: mathConfig.defaultCreditsPerSpin
    },
    constraints
  );

  if (defaultWager.totalBet === defaultTarget) {
    return mathConfig;
  }

  const selected = chooseClosestCombo(buildAllowedWagerCombos(mathConfig, constraints), defaultTarget);
  return {
    ...mathConfig,
    defaultDenomination: selected.denomination,
    defaultCreditsPerSpin: selected.creditsPerSpin
  };
}

export function createBonusPayloadFromSource(
  rawPayload: unknown,
  options: {
    fallbackType?: BonusType | null;
    fallbackAward?: number;
    transport?: FeatureSessionTransport;
  } = {}
): BonusPayload | null {
  const envelope = isRecord(rawPayload)
    ? isRecord(rawPayload.bonusPayload)
      ? rawPayload.bonusPayload
      : rawPayload
    : null;

  if (!envelope) {
    return null;
  }

  const type = normalizeBonusType(envelope.type) ?? options.fallbackType ?? null;
  if (!type) {
    return null;
  }

  const precomputedOutcome = isRecord(envelope.precomputedOutcome) ? envelope.precomputedOutcome : {};
  const jackpotAwards = (Array.isArray(envelope.jackpotAwards) ? envelope.jackpotAwards : [])
    .map((award) => {
      if (!isRecord(award) || !isJackpotTier(award.tier)) {
        return null;
      }

      return {
        tier: award.tier,
        amount: toNonNegativeInt(award.amount),
        source: typeof award.source === "string" ? award.source : "trigger"
      };
    })
    .filter((award): award is BonusJackpotAward => award !== null);
  const inferredTransport =
    options.transport ?? normalizeTransport(envelope.transport) ?? (hasStructuredSessionData(precomputedOutcome) ? "streamed" : "seeded");
  const expectedTotalAward = toNonNegativeInt(envelope.expectedTotalAward, options.fallbackAward ?? 0);

  return {
    type,
    sessionId:
      typeof envelope.sessionId === "string" && envelope.sessionId.length > 0
        ? envelope.sessionId
        : `${type.toLowerCase()}-${Date.now().toString(36)}`,
    revealSeed:
      typeof envelope.revealSeed === "string" && envelope.revealSeed.length > 0
        ? envelope.revealSeed
        : randomNonce(),
    precomputedOutcome,
    expectedTotalAward,
    jackpotTiersHit: Array.isArray(envelope.jackpotTiersHit)
      ? envelope.jackpotTiersHit.filter((tier): tier is JackpotTier => isJackpotTier(tier))
      : collectJackpotTiersFromAwards(jackpotAwards),
    jackpotAwards,
    transport: inferredTransport,
    featureSession: createFeatureSessionState(type, precomputedOutcome, inferredTransport)
  };
}

export type ApiSpinPolicy = "allow-demo-fallback" | "require-remote";

export class RemoteAuthoritativeUnavailableError extends Error {
  public constructor(message = "Server-authoritative runtime unavailable.") {
    super(message);
    this.name = "RemoteAuthoritativeUnavailableError";
  }
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
    const minBet = clamp(server.minBet ?? DEFAULT_MIN_BET, 1, 10000);
    const maxBet = clamp(server.maxBet ?? DEFAULT_MAX_BET, minBet, 100000);
    const defaultBet = clamp(server.defaultBet ?? DEFAULT_BET, minBet, maxBet);
    const serverLadder = server.jackpotLadder ?? {};
    this.fallbackJackpot = {
      ember: serverLadder.ember ?? this.fallbackJackpot.ember,
      relic: serverLadder.relic ?? this.fallbackJackpot.relic,
      mythic: serverLadder.mythic ?? this.fallbackJackpot.mythic,
      throne: serverLadder.throne ?? this.fallbackJackpot.throne
    };
    const mathConfig = normalizeMathConfig(server, { minBet, maxBet });
    const defaultWager = buildWagerProfile(
      mathConfig,
      {
        denomination: mathConfig.defaultDenomination,
        creditsPerSpin: mathConfig.defaultCreditsPerSpin
      },
      { minBet, maxBet }
    );

    return {
      minBet,
      maxBet,
      defaultBet: defaultWager.totalBet || defaultBet,
      jackpotLadder: { ...this.fallbackJackpot },
      mathConfig: {
        ...mathConfig,
        defaultDenomination: defaultWager.denomination,
        defaultCreditsPerSpin: defaultWager.creditsPerSpin
      }
    };
  }

  private toSpinRequestBody(request: SpinRequest): Record<string, unknown> {
    const profileId = request.profileId || request.playerId || DEFAULT_PROFILE_ID;
    const lines = clamp(toNonNegativeInt(request.lines ?? request.linesMode, request.linesMode), 1, DEFAULT_LINE_COUNT);

    return {
      profileId,
      playerId: request.playerId ?? profileId,
      sessionId: request.sessionId,
      bet: request.bet,
      denomination: request.denomination ?? 1,
      creditsPerSpin: request.creditsPerSpin ?? request.bet,
      maxBet: request.isMaxBet ?? false,
      qualifiesForProgressive: request.qualifiesForProgressive ?? false,
      speedMode: request.speedMode ?? "normal",
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
        if (typeof (win as unknown as Record<string, unknown>).lineIndex === "number") {
          return (win as unknown as Record<string, unknown>).lineIndex as number;
        }

        const match = /(?:Row|Line)\s+(\d+)/i.exec(win.detail);
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
    const fallbackType: BonusType | null = flags.emberRespinTriggered
      ? "EMBER_RESPIN"
      : flags.wheelTriggered
        ? "WHEEL_ASCENSION"
        : flags.relicTriggered
          ? "RELIC_VAULT_PICK"
          : null;
    const explicitPayload = createBonusPayloadFromSource(server.bonusPayload, {
      fallbackType,
      fallbackAward: totalWin,
      transport: this.runtimeMode === "serverless" ? "demo" : undefined
    });

    if (explicitPayload) {
      return explicitPayload;
    }

    if (!fallbackType) {
      return null;
    }

    const precomputedOutcome = this.buildFallbackOutcome(fallbackType, server, totalWin);
    return createBonusPayloadFromSource(
      {
        type: fallbackType,
        sessionId: `${server.spinId}-${fallbackType.toLowerCase()}`,
        revealSeed: randomNonce(),
        transport: this.runtimeMode === "serverless" ? "demo" : hasStructuredSessionData(precomputedOutcome) ? "streamed" : "seeded",
        precomputedOutcome,
        expectedTotalAward: Math.max(totalWin, Math.floor(totalWin * 1.15)),
        jackpotTiersHit: [],
        jackpotAwards: []
      },
      {
        fallbackType,
        fallbackAward: totalWin,
        transport: this.runtimeMode === "serverless" ? "demo" : "seeded"
      }
    );
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
        { slotId: "A3", hidden: "jackpot tier" },
        { slotId: "B1", hidden: "coin" }
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

    const contribution = Math.max(1, Math.floor(bet * 0.05));
    const ember = Math.floor(contribution * 0.4);
    const relic = Math.floor(contribution * 0.3);
    const mythic = Math.floor(contribution * 0.2);
    const throne = contribution - ember - relic - mythic;
    this.fallbackJackpot = {
      ember: this.fallbackJackpot.ember + ember,
      relic: this.fallbackJackpot.relic + relic,
      mythic: this.fallbackJackpot.mythic + mythic,
      throne: this.fallbackJackpot.throne + throne
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
      minBet: DEFAULT_MIN_BET,
      maxBet: DEFAULT_MAX_BET,
      defaultBet: DEFAULT_BET,
      jackpotLadder: this.fallbackJackpot,
      mathConfig: { ...DEFAULT_BASE_GAME_MATH_CONFIG }
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
    const bonusPayload = this.normalizeBonusPayload(
      {
        spinId,
        reels,
        wins: [],
        triggers: {
          emberLock: emberRespin,
          freeQuest: triggerSet.has("FREE_QUEST")
        },
        triggerFlags: {
          emberRespin,
          wheelAscension,
          relicVaultPick: relicVault,
          freeQuest: triggerSet.has("FREE_QUEST")
        },
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
  wager: WagerProfile,
  profileId = DEFAULT_PROFILE_ID
): SpinRequest {
  return {
    profileId,
    playerId: profileId,
    sessionId,
    bet: wager.totalBet,
    denomination: wager.denomination,
    creditsPerSpin: wager.creditsPerSpin,
    speedMode: wager.speedMode,
    isMaxBet: wager.isMaxBet,
    qualifiesForProgressive: wager.qualifiesForProgressive,
    linesMode: wager.lineCount,
    lines: wager.lineCount,
    clientNonce: randomNonce()
  };
}

export const apiClient = new ApiClient();
