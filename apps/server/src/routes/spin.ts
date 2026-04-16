import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  collectBonusSessionJackpotTiers,
  resolveCelestialWheelAscension,
  resolveEmberRespinCollectorLock,
  resolveRelicVaultPick,
  type BonusJackpotAward as SharedBonusJackpotAward,
  type BonusPayload as SharedBonusPayload,
  type BonusSessionReference,
  type BonusType as SharedBonusType,
  type OrbLanding,
} from "@ember-thrones/shared";
import { buildBonusSessionSeed } from "../lib/bonusSessions.js";
import { type JackpotTier, type VolatilityPreset, type WalletState } from "../lib/db.js";
import { signPayload } from "../lib/signature.js";
import { createDefaultProfile } from "../seeds/defaultProfile.js";

const require = createRequire(import.meta.url);

const SPIN_COLUMNS = 5;
const SPIN_ROWS = 3;
const DEFAULT_LINES_MODE = 20;
const JACKPOT_BASE_RESETS: Record<JackpotTier, number> = {
  ember: 5_000,
  relic: 25_000,
  mythic: 100_000,
  throne: 1_000_000,
};
const JACKPOT_TIERS: JackpotTier[] = ["ember", "relic", "mythic", "throne"];

type SymbolCode =
  | "A"
  | "K"
  | "Q"
  | "J"
  | "10"
  | "WILD"
  | "SCATTER"
  | "ORB"
  | "DRAGON";

type WinKind = "line" | "feature" | "jackpot";

export interface TriggerFlags {
  emberRespin: boolean;
  wheelAscension: boolean;
  relicVaultPick: boolean;
  freeQuest: boolean;
}

export type BonusJackpotAward = SharedBonusJackpotAward;

export type SpinBonusPayload = SharedBonusPayload;

export interface SpinWin {
  kind: WinKind;
  amount: number;
  detail: string;
}

export interface SpinTriggers {
  emberLock: boolean;
  freeQuest: boolean;
  jackpotTier?: JackpotTier;
}

export interface SpinBonusState {
  emberLock?: {
    active: boolean;
    lockedCells: number[];
    respinsRemaining: number;
    orbValues: number[];
    jackpotFlags: Partial<Record<JackpotTier, boolean>>;
  };
  freeQuest?: {
    active: boolean;
    spinsRemaining: number;
    retriggerChance: number;
  };
  wheelAscension?: {
    active: boolean;
    currentSpin: number;
    awardedSpins: number;
    maxSpins: number;
  };
  relicVault?: {
    active: boolean;
    keys: number;
    picksRemaining: number;
    revealed: string[];
  };
}

export interface SpinResult {
  spinId: string;
  profileId: string;
  sessionId: string;
  bet: number;
  linesMode: number;
  reels: string[][];
  wins: SpinWin[];
  triggers: SpinTriggers;
  triggerFlags: TriggerFlags;
  bonusState: SpinBonusState;
  bonusSessionRef: BonusSessionReference | null;
  bonusPayload: SpinBonusPayload | null;
  totalWin: number;
  updatedWallet: WalletState;
  jackpotSnapshotBefore?: Record<JackpotTier, number>;
  jackpotSnapshotAfter?: Record<JackpotTier, number>;
  jackpotLadder: Record<JackpotTier, number>;
  signature: string;
}

interface SpinComputation {
  reels: SymbolCode[][];
  wins: SpinWin[];
  triggers: SpinTriggers;
  triggerFlags: TriggerFlags;
  bonusState: SpinBonusState;
  bonusPayload: SpinBonusPayload | null;
  totalWin: number;
}

interface SharedSpinInput {
  sessionId: string;
  profileId: string;
  bet: number;
  linesMode: number;
  volatility: VolatilityPreset;
  clientNonce: string;
  featureFlags: Record<string, boolean>;
}

const spinBodySchema = z.object({
  profileId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  bet: z.number().int().positive().max(1_000_000),
  linesMode: z.number().int().min(1).max(50).optional(),
  clientNonce: z.string().trim().min(8).max(128),
  volatility: z.enum(["low", "medium", "high"]).optional(),
  featureFlags: z.record(z.boolean()).optional(),
  nickname: z.string().trim().min(1).max(24).optional(),
});

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const asFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
};

const isJackpotTier = (value: unknown): value is JackpotTier => {
  return value === "ember" || value === "relic" || value === "mythic" || value === "throne";
};

const buildSeedBase = (input: SharedSpinInput): string => {
  return `${input.sessionId}|${input.profileId}|${input.clientNonce}|${input.bet}|${input.linesMode}`;
};

const asSymbolCode = (value: unknown): SymbolCode => {
  const normalized = String(value).toUpperCase();
  switch (normalized) {
    case "A":
    case "K":
    case "Q":
    case "J":
    case "10":
    case "WILD":
    case "SCATTER":
    case "ORB":
    case "DRAGON":
      return normalized;
    default:
      return "A";
  }
};

interface ReelAnalysis {
  flattened: SymbolCode[];
  orbPositions: number[];
  orbCount: number;
  scatterCount: number;
  dragonCount: number;
  wildCount: number;
}

const analyzeReels = (reels: SymbolCode[][]): ReelAnalysis => {
  const flattened: SymbolCode[] = [];
  const orbPositions: number[] = [];
  let orbCount = 0;
  let scatterCount = 0;
  let dragonCount = 0;
  let wildCount = 0;

  for (let col = 0; col < reels.length; col += 1) {
    const column = reels[col] ?? [];
    for (let row = 0; row < column.length; row += 1) {
      const symbol = column[row] ?? "A";
      const flatIndex = col * SPIN_ROWS + row;
      flattened.push(symbol);

      if (symbol === "ORB") {
        orbCount += 1;
        orbPositions.push(flatIndex);
      }
      if (symbol === "SCATTER") {
        scatterCount += 1;
      }
      if (symbol === "DRAGON") {
        dragonCount += 1;
      }
      if (symbol === "WILD") {
        wildCount += 1;
      }
    }
  }

  return {
    flattened,
    orbPositions,
    orbCount,
    scatterCount,
    dragonCount,
    wildCount,
  };
};

const deriveTriggerFlags = (analysis: ReelAnalysis): TriggerFlags => {
  return {
    emberRespin: analysis.orbCount >= 6,
    wheelAscension: analysis.scatterCount >= 4 && analysis.dragonCount >= 1,
    relicVaultPick: analysis.dragonCount >= 4 && analysis.wildCount >= 2,
    freeQuest: analysis.scatterCount >= 3,
  };
};

const selectPrimaryBonusType = (triggerFlags: TriggerFlags): SharedBonusType | null => {
  if (triggerFlags.emberRespin) {
    return "EMBER_RESPIN";
  }

  if (triggerFlags.wheelAscension) {
    return "WHEEL_ASCENSION";
  }

  if (triggerFlags.relicVaultPick) {
    return "RELIC_VAULT_PICK";
  }

  return null;
};

const buildRevealSeed = (
  input: SharedSpinInput,
  bonusType: SharedBonusType,
  flattenedReels: SymbolCode[],
): string => {
  return createHash("sha256")
    .update(`${buildSeedBase(input)}|${bonusType}|${flattenedReels.join(",")}`)
    .digest("hex");
};

const dedupeJackpotAwards = (awards: BonusJackpotAward[]): BonusJackpotAward[] => {
  const byTier = new Map<JackpotTier, BonusJackpotAward>();
  for (const award of awards) {
    if (!byTier.has(award.tier)) {
      byTier.set(award.tier, award);
    }
  }

  return Array.from(byTier.values());
};

const pickFromList = <T>(values: readonly T[], rng: SeededRng, fallback: T): T => {
  const index = Math.floor(rng.next() * values.length);
  return values[index] ?? fallback;
};

class SeededRng {
  private state: number;

  public constructor(seed: string) {
    const digest = createHash("sha256").update(seed).digest();
    this.state =
      ((digest[0] ?? 0) << 24) |
      ((digest[1] ?? 0) << 16) |
      ((digest[2] ?? 0) << 8) |
      (digest[3] ?? 0);

    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  public next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x1_0000_0000;
  }
}

const weightedSymbols: Record<VolatilityPreset, Array<{ symbol: SymbolCode; weight: number }>> = {
  low: [
    { symbol: "A", weight: 14 },
    { symbol: "K", weight: 14 },
    { symbol: "Q", weight: 14 },
    { symbol: "J", weight: 14 },
    { symbol: "10", weight: 12 },
    { symbol: "WILD", weight: 8 },
    { symbol: "SCATTER", weight: 5 },
    { symbol: "ORB", weight: 4 },
    { symbol: "DRAGON", weight: 5 },
  ],
  medium: [
    { symbol: "A", weight: 13 },
    { symbol: "K", weight: 13 },
    { symbol: "Q", weight: 12 },
    { symbol: "J", weight: 12 },
    { symbol: "10", weight: 11 },
    { symbol: "WILD", weight: 8 },
    { symbol: "SCATTER", weight: 6 },
    { symbol: "ORB", weight: 8 },
    { symbol: "DRAGON", weight: 7 },
  ],
  high: [
    { symbol: "A", weight: 11 },
    { symbol: "K", weight: 11 },
    { symbol: "Q", weight: 10 },
    { symbol: "J", weight: 10 },
    { symbol: "10", weight: 10 },
    { symbol: "WILD", weight: 9 },
    { symbol: "SCATTER", weight: 7 },
    { symbol: "ORB", weight: 11 },
    { symbol: "DRAGON", weight: 9 },
  ],
};

const pickWeightedSymbol = (rng: SeededRng, volatility: VolatilityPreset): SymbolCode => {
  const pool = weightedSymbols[volatility];
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  const needle = rng.next() * totalWeight;

  let cursor = 0;
  for (const item of pool) {
    cursor += item.weight;
    if (needle <= cursor) {
      return item.symbol;
    }
  }

  return pool[pool.length - 1]?.symbol ?? "A";
};

const pickJackpotTier = (rng: SeededRng): JackpotTier => {
  const roll = rng.next();
  if (roll < 0.7) {
    return "ember";
  }
  if (roll < 0.9) {
    return "relic";
  }
  if (roll < 0.98) {
    return "mythic";
  }
  return "throne";
};

const evaluateLineWins = (reels: SymbolCode[][], bet: number): SpinWin[] => {
  const payouts: Record<3 | 4 | 5, number> = {
    3: 1,
    4: 2,
    5: 4,
  };

  const wins: SpinWin[] = [];

  for (let row = 0; row < SPIN_ROWS; row += 1) {
    const rowSymbols: SymbolCode[] = [];
    for (let col = 0; col < SPIN_COLUMNS; col += 1) {
      rowSymbols.push(reels[col]?.[row] ?? "A");
    }

    const target = rowSymbols.find((symbol) => symbol !== "WILD");
    if (!target || target === "ORB" || target === "SCATTER") {
      continue;
    }

    let streak = 0;
    for (const symbol of rowSymbols) {
      if (symbol === target || symbol === "WILD") {
        streak += 1;
      } else {
        break;
      }
    }

    if (streak >= 3) {
      const payout = Math.floor(bet * payouts[streak as 3 | 4 | 5]);
      wins.push({
        kind: "line",
        amount: payout,
        detail: `Row ${row + 1} ${target} x${streak}`,
      });
    }
  }

  return wins;
};

interface EmberRespinBuild {
  payload: SpinBonusPayload;
  legacyState: NonNullable<SpinBonusState["emberLock"]>;
}

const buildEmberRespinPayload = (
  input: SharedSpinInput,
  analysis: ReelAnalysis,
  revealSeed: string,
): EmberRespinBuild => {
  const outcome = resolveEmberRespinCollectorLock({
    seed: revealSeed,
    bet: input.bet,
    initialLockedCells: analysis.orbPositions,
  });
  const jackpotTiersHit: JackpotTier[] = collectBonusSessionJackpotTiers(outcome);
  const jackpotAwards: BonusJackpotAward[] = dedupeJackpotAwards(
    jackpotTiersHit.map((tier: JackpotTier) => ({
      tier,
      amount: 0,
      source: "ember_respin",
    }))
  );

  const jackpotFlags: Partial<Record<JackpotTier, boolean>> = {};
  for (const award of jackpotAwards) {
    const tier = award.tier as JackpotTier;
    jackpotFlags[tier] = true;
  }

  return {
    payload: {
      type: outcome.type,
      sessionId: input.sessionId,
      revealSeed,
      expectedTotalAward: outcome.finalAward,
      jackpotTiersHit,
      jackpotAwards,
      precomputedOutcome: outcome,
    },
    legacyState: {
      active: true,
      lockedCells: outcome.startingOrbs.map((orb: OrbLanding) => orb.position),
      respinsRemaining: 3,
      orbValues: outcome.startingOrbs.map((orb: OrbLanding) => orb.coinValue),
      jackpotFlags,
    },
  };
};

interface WheelAscensionBuild {
  payload: SpinBonusPayload;
  state: NonNullable<SpinBonusState["wheelAscension"]>;
}

const buildWheelAscensionPayload = (
  input: SharedSpinInput,
  revealSeed: string,
): WheelAscensionBuild => {
  const outcome = resolveCelestialWheelAscension({
    seed: revealSeed,
    bet: input.bet,
  });
  const jackpotTiersHit: JackpotTier[] = collectBonusSessionJackpotTiers(outcome);
  const jackpotAwards: BonusJackpotAward[] = dedupeJackpotAwards(
    jackpotTiersHit.map((tier: JackpotTier) => ({
      tier,
      amount: 0,
      source: "wheel_ascension",
    }))
  );

  return {
    payload: {
      type: outcome.type,
      sessionId: input.sessionId,
      revealSeed,
      expectedTotalAward: outcome.finalAward,
      jackpotTiersHit,
      jackpotAwards,
      precomputedOutcome: outcome,
    },
    state: {
      active: true,
      currentSpin: 0,
      awardedSpins: outcome.awardedSpins,
      maxSpins: outcome.maxSpins,
    },
  };
};

interface RelicVaultBuild {
  payload: SpinBonusPayload;
  state: NonNullable<SpinBonusState["relicVault"]>;
}

const buildRelicVaultPayload = (
  input: SharedSpinInput,
  analysis: ReelAnalysis,
  revealSeed: string,
): RelicVaultBuild => {
  const keyCount = 3 + Math.min(2, Math.floor((analysis.dragonCount + analysis.wildCount) / 2));
  const outcome = resolveRelicVaultPick({
    seed: revealSeed,
    bet: input.bet,
    keyCount,
  });
  const jackpotTiersHit: JackpotTier[] = collectBonusSessionJackpotTiers(outcome);
  const jackpotAwards: BonusJackpotAward[] = dedupeJackpotAwards(
    jackpotTiersHit.map((tier: JackpotTier) => ({
      tier,
      amount: 0,
      source: "relic_vault",
    }))
  );

  return {
    payload: {
      type: outcome.type,
      sessionId: input.sessionId,
      revealSeed,
      expectedTotalAward: outcome.finalAward,
      jackpotTiersHit,
      jackpotAwards,
      precomputedOutcome: outcome,
    },
    state: {
      active: true,
      keys: outcome.keyCount,
      picksRemaining: outcome.picksAllowed,
      revealed: [],
    },
  };
};

const computeOutcomeFromResolvedReels = (
  input: SharedSpinInput,
  reels: SymbolCode[][],
): SpinComputation => {
  const wins = evaluateLineWins(reels, input.bet);
  const analysis = analyzeReels(reels);
  const triggerFlags = deriveTriggerFlags(analysis);

  const bonusState: SpinBonusState = {};
  const bonusSeedRng = new SeededRng(`${buildSeedBase(input)}|bonus|${analysis.flattened.join(",")}`);

  if (triggerFlags.emberRespin) {
    bonusState.emberLock = {
      active: true,
      lockedCells: analysis.orbPositions.slice(),
      respinsRemaining: 3,
      orbValues: analysis.orbPositions.map(() => Math.max(1, Math.floor((1 + bonusSeedRng.next() * 4) * input.bet))),
      jackpotFlags: {},
    };
  }

  if (triggerFlags.freeQuest) {
    const spinsRemaining = 8 + Math.floor(bonusSeedRng.next() * 5);
    const entryAward = Math.floor(input.bet * (1.2 + bonusSeedRng.next() * 0.6));

    wins.push({
      kind: "feature",
      amount: entryAward,
      detail: "Free Quest entry reward",
    });

    bonusState.freeQuest = {
      active: true,
      spinsRemaining,
      retriggerChance: 0.2,
    };
  }

  let bonusPayload: SpinBonusPayload | null = null;
  const selectedBonusType = selectPrimaryBonusType(triggerFlags);

  if (selectedBonusType) {
    const revealSeed = buildRevealSeed(input, selectedBonusType, analysis.flattened);

    if (selectedBonusType === "EMBER_RESPIN") {
      const emberResult = buildEmberRespinPayload(input, analysis, revealSeed);
      bonusPayload = emberResult.payload;
      bonusState.emberLock = emberResult.legacyState;
    }

    if (selectedBonusType === "WHEEL_ASCENSION") {
      const wheelResult = buildWheelAscensionPayload(input, revealSeed);
      bonusPayload = wheelResult.payload;
      bonusState.wheelAscension = wheelResult.state;
    }

    if (selectedBonusType === "RELIC_VAULT_PICK") {
      const relicResult = buildRelicVaultPayload(input, analysis, revealSeed);
      bonusPayload = relicResult.payload;
      bonusState.relicVault = relicResult.state;
    }
  }

  if (wins.length === 0 && bonusSeedRng.next() < 0.14) {
    wins.push({
      kind: "line",
      amount: Math.max(1, Math.floor(input.bet * 0.2)),
      detail: "Consolation cascade",
    });
  }

  const totalWin = wins.reduce((sum, win) => sum + win.amount, 0);
  const legacyJackpotTier = bonusPayload?.jackpotAwards[0]?.tier;

  return {
    reels: reels.map((column) => column.slice()),
    wins,
    triggers: {
      emberLock: triggerFlags.emberRespin,
      freeQuest: triggerFlags.freeQuest,
      ...(legacyJackpotTier ? { jackpotTier: legacyJackpotTier } : {}),
    },
    triggerFlags,
    bonusState,
    bonusPayload,
    totalWin,
  };
};

const computeLocalOutcome = (input: SharedSpinInput): SpinComputation => {
  const rng = new SeededRng(buildSeedBase(input));

  const reels: SymbolCode[][] = Array.from({ length: SPIN_COLUMNS }, () =>
    Array.from({ length: SPIN_ROWS }, () => pickWeightedSymbol(rng, input.volatility)),
  );

  return computeOutcomeFromResolvedReels(input, reels);
};

const mapSharedOutcome = (candidate: unknown, input: SharedSpinInput): SpinComputation | null => {
  if (!isRecord(candidate)) {
    return null;
  }

  const reelsRaw = candidate.reels;
  if (!Array.isArray(reelsRaw)) {
    return null;
  }

  const reels: SymbolCode[][] = [];
  for (const column of reelsRaw) {
    if (!Array.isArray(column)) {
      return null;
    }

    if (column.length === 0) {
      return null;
    }

    reels.push(column.map((entry) => asSymbolCode(entry)));
  }

  return computeOutcomeFromResolvedReels(input, reels);
};

let sharedModuleCache: Record<string, unknown> | null | undefined;

const loadSharedSpinResolver = (): ((input: SharedSpinInput) => unknown) | null => {
  if (sharedModuleCache === undefined) {
    try {
      sharedModuleCache = require("@ember-thrones/shared") as Record<string, unknown>;
    } catch {
      sharedModuleCache = null;
    }
  }

  if (!sharedModuleCache) {
    return null;
  }

  const resolverCandidates = [
    "computeSpinOutcome",
    "resolveSpinOutcome",
    "resolveSpin",
    "runSpin",
    "spin",
  ];

  for (const key of resolverCandidates) {
    const fn = sharedModuleCache[key];
    if (typeof fn === "function") {
      return fn as (input: SharedSpinInput) => unknown;
    }
  }

  return null;
};

const computeSpinOutcome = (input: SharedSpinInput): SpinComputation => {
  const resolver = loadSharedSpinResolver();
  if (!resolver) {
    return computeLocalOutcome(input);
  }

  try {
    const sharedOutcome = resolver(input);
    const normalized = mapSharedOutcome(sharedOutcome, input);
    if (normalized) {
      return normalized;
    }
  } catch {
    return computeLocalOutcome(input);
  }

  return computeLocalOutcome(input);
};

const toJackpotSnapshot = (
  rows: Array<{ tier: JackpotTier; amount: number }>,
): Record<JackpotTier, number> => {
  return rows.reduce<Record<JackpotTier, number>>(
    (acc, row) => {
      acc[row.tier] = row.amount;
      return acc;
    },
    {
      ember: 0,
      relic: 0,
      mythic: 0,
      throne: 0,
    },
  );
};

const projectJackpotSnapshotAfter = (
  before: Record<JackpotTier, number>,
  bet: number,
  payoutTiers: Set<JackpotTier>,
): Record<JackpotTier, number> => {
  const contribution = Math.max(1, Math.floor(bet * 0.05));
  const ember = Math.floor(contribution * 0.4);
  const relic = Math.floor(contribution * 0.3);
  const mythic = Math.floor(contribution * 0.2);
  const throne = contribution - ember - relic - mythic;

  const projected: Record<JackpotTier, number> = {
    ember: before.ember + ember,
    relic: before.relic + relic,
    mythic: before.mythic + mythic,
    throne: before.throne + throne,
  };

  for (const tier of payoutTiers) {
    projected[tier] = JACKPOT_BASE_RESETS[tier];
  }

  return projected;
};

const hasAnyTrigger = (triggerFlags: TriggerFlags): boolean => {
  return (
    triggerFlags.emberRespin ||
    triggerFlags.wheelAscension ||
    triggerFlags.relicVaultPick ||
    triggerFlags.freeQuest
  );
};

const spinRoutes: FastifyPluginAsync = async (app) => {
  app.post("/spin", async (request, reply) => {
    const body = spinBodySchema.parse(request.body ?? {});

    const replayKey = `${body.sessionId}:${body.clientNonce}`;
    const accepted = app.replayGuard.consume(replayKey);
    if (!accepted) {
      return reply.code(409).send({
        message: "Replay detected for nonce",
      });
    }

    const profile = app.db.ensureProfile(
      createDefaultProfile({
        id: body.profileId,
        ...(body.nickname ? { nickname: body.nickname } : {}),
      }),
    );

    const walletBefore = app.db.getWallet(profile.id);
    if (!walletBefore) {
      return reply.code(500).send({
        message: "Unable to load wallet",
      });
    }

    if (walletBefore.coins < body.bet) {
      return reply.code(400).send({
        message: "Insufficient coins",
        wallet: walletBefore,
      });
    }

    const existingSession = app.db.getSession(body.sessionId);
    if (existingSession && existingSession.profileId !== profile.id) {
      return reply.code(409).send({
        message: "Session belongs to another profile",
      });
    }

    const session = app.db.upsertSession({
      id: body.sessionId,
      profileId: profile.id,
      volatility: body.volatility ?? existingSession?.volatility ?? "medium",
      state: existingSession?.state ?? {},
    });

    const linesMode = body.linesMode ?? DEFAULT_LINES_MODE;
    const outcome = computeSpinOutcome({
      sessionId: session.id,
      profileId: profile.id,
      bet: body.bet,
      linesMode,
      volatility: session.volatility,
      clientNonce: body.clientNonce,
      featureFlags: body.featureFlags ?? {},
    });

    const spinId = randomUUID();
    const jackpotSnapshotBefore = toJackpotSnapshot(app.db.getJackpots());
    const wins: SpinWin[] = outcome.wins.filter((win) => win.kind !== "jackpot");
    let totalWin = wins.reduce((sum, win) => sum + win.amount, 0);

    const jackpotPayoutTierSet = new Set<JackpotTier>();
    let bonusPayload: SpinBonusPayload | null = null;
    let bonusSessionRef: BonusSessionReference | null = null;
    let reservedBonusSession: ReturnType<typeof buildBonusSessionSeed> | null = null;

    if (outcome.bonusPayload) {
      const resolvedJackpotAwards = dedupeJackpotAwards(
        outcome.bonusPayload.jackpotAwards.map((award: BonusJackpotAward) => ({
          tier: award.tier,
          amount: jackpotSnapshotBefore[award.tier as JackpotTier],
          source: award.source,
        })),
      );

      for (const award of resolvedJackpotAwards) {
        jackpotPayoutTierSet.add(award.tier);
      }

      bonusPayload = {
        ...outcome.bonusPayload,
        jackpotAwards: resolvedJackpotAwards,
        expectedTotalAward: Math.max(
          0,
          Math.floor(
            outcome.bonusPayload.expectedTotalAward +
              resolvedJackpotAwards.reduce((sum, award) => sum + award.amount, 0),
          ),
        ),
      };

      bonusSessionRef = {
        id: randomUUID(),
        type: bonusPayload.type,
        status: "PENDING",
      };

      reservedBonusSession = buildBonusSessionSeed({
        id: bonusSessionRef.id,
        spinId,
        sessionId: session.id,
        profileId: profile.id,
        revealSeed: bonusPayload.revealSeed,
        expectedTotalAward: bonusPayload.expectedTotalAward,
        jackpotTiersHit: bonusPayload.jackpotTiersHit,
        jackpotAwards: bonusPayload.jackpotAwards,
        outcome: bonusPayload.precomputedOutcome,
      });
    }

    const legacyJackpotTier = bonusPayload?.jackpotAwards[0]?.tier ?? outcome.triggers.jackpotTier;

    const jackpotSnapshotAfter = projectJackpotSnapshotAfter(
      jackpotSnapshotBefore,
      body.bet,
      jackpotPayoutTierSet,
    );

    const updatedWallet: WalletState = {
      coins: Math.max(0, walletBefore.coins - body.bet + totalWin),
      gems: walletBefore.gems,
      lifetimeSpins: walletBefore.lifetimeSpins + 1,
      lifetimeWins: walletBefore.lifetimeWins + totalWin,
    };
    const legacyTriggers: SpinTriggers = {
      emberLock: outcome.triggers.emberLock,
      freeQuest: outcome.triggers.freeQuest,
      ...(legacyJackpotTier ? { jackpotTier: legacyJackpotTier } : {}),
    };

    const unsignedResult: Omit<SpinResult, "signature"> = {
      spinId,
      profileId: profile.id,
      sessionId: session.id,
      bet: body.bet,
      linesMode,
      reels: outcome.reels.map((column) => column.slice()),
      wins,
      triggers: legacyTriggers,
      triggerFlags: outcome.triggerFlags,
      bonusState: outcome.bonusState,
      bonusSessionRef,
      bonusPayload: null,
      totalWin,
      updatedWallet,
      jackpotSnapshotBefore,
      jackpotSnapshotAfter,
      jackpotLadder: jackpotSnapshotAfter,
    };

    const signature = signPayload(unsignedResult, app.signatureSecret);
    const response: SpinResult = {
      ...unsignedResult,
      signature,
    };

    app.db.commitSpinAtomic({
      spin: {
        id: spinId,
        sessionId: session.id,
        profileId: profile.id,
        bet: body.bet,
        totalWin,
        payload: response as unknown as Record<string, unknown>,
      },
      walletDelta: {
        coinsDelta: -body.bet + totalWin,
        spinsDelta: 1,
        winsDelta: totalWin,
      },
      sessionState: {
        ...session.state,
        lastSpinId: response.spinId,
        lastSpinAt: new Date().toISOString(),
        lastNonce: body.clientNonce,
        lastTriggers: response.triggers,
        lastTriggerFlags: response.triggerFlags,
        lastBonusState: response.bonusState,
        lastBonusSessionRef: response.bonusSessionRef,
        activeBonusSessionRef: response.bonusSessionRef,
        lastJackpotSnapshotBefore: response.jackpotSnapshotBefore,
        lastJackpotSnapshotAfter: response.jackpotSnapshotAfter,
      },
      jackpotContributionBet: body.bet,
      ...(jackpotPayoutTierSet.size > 0
        ? { jackpotPayoutTiers: Array.from(jackpotPayoutTierSet) }
        : {}),
      ...(reservedBonusSession ? { bonusSession: reservedBonusSession } : {}),
    });

    if (!bonusSessionRef) {
      for (const tier of jackpotPayoutTierSet) {
        app.eventBus.publish("jackpot", {
          profileId: profile.id,
          sessionId: session.id,
          tier,
          amount: jackpotSnapshotBefore[tier],
        });
      }
    }

    if (hasAnyTrigger(response.triggerFlags)) {
      app.eventBus.publish("bonus", {
        profileId: profile.id,
        sessionId: session.id,
        triggers: response.triggers,
        triggerFlags: response.triggerFlags,
        bonusType: response.bonusSessionRef?.type ?? null,
        bonusSessionRef: response.bonusSessionRef,
      });
    }

    if (updatedWallet.lifetimeSpins > 0 && updatedWallet.lifetimeSpins % 100 === 0) {
      app.eventBus.publish("achievement", {
        profileId: profile.id,
        sessionId: session.id,
        key: "centurion_spinner",
        milestone: updatedWallet.lifetimeSpins,
      });
    }

    return response;
  });
};

export default spinRoutes;
