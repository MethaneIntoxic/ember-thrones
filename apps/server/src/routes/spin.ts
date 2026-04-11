import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
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
type BonusType = "EMBER_RESPIN" | "WHEEL_ASCENSION" | "RELIC_VAULT";

export interface TriggerFlags {
  emberRespin: boolean;
  wheelAscension: boolean;
  relicVaultPick: boolean;
  freeQuest: boolean;
}

export interface BonusJackpotAward {
  tier: JackpotTier;
  amount: number;
  source: string;
}

export interface SpinBonusPayload {
  type: BonusType;
  sessionId: string;
  revealSeed: string;
  precomputedOutcome: Record<string, unknown>;
  expectedTotalAward: number;
  jackpotAwards: BonusJackpotAward[];
}

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
    wheelAscension: analysis.scatterCount >= 3 && analysis.dragonCount >= 1,
    relicVaultPick: analysis.dragonCount >= 3 || (analysis.dragonCount >= 2 && analysis.wildCount >= 1),
    freeQuest: analysis.scatterCount >= 3,
  };
};

const selectPrimaryBonusType = (triggerFlags: TriggerFlags): BonusType | null => {
  if (triggerFlags.emberRespin) {
    return "EMBER_RESPIN";
  }

  if (triggerFlags.wheelAscension) {
    return "WHEEL_ASCENSION";
  }

  if (triggerFlags.relicVaultPick) {
    return "RELIC_VAULT";
  }

  return null;
};

const buildRevealSeed = (
  input: SharedSpinInput,
  bonusType: BonusType,
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
  featureWin: SpinWin | null;
  legacyState: NonNullable<SpinBonusState["emberLock"]>;
}

const buildEmberRespinPayload = (
  input: SharedSpinInput,
  analysis: ReelAnalysis,
  revealSeed: string,
): EmberRespinBuild => {
  const rng = new SeededRng(`${revealSeed}|resolve`);
  const lockedCells = analysis.orbPositions.slice();
  const orbValues = lockedCells.map(() => Math.max(1, Math.floor((1 + rng.next() * 4.5) * input.bet)));
  const collectorMultiplier = rng.next() < 0.32 ? 2 + Math.floor(rng.next() * 2) : 1;
  const guaranteedMysteryOrbAt = rng.next() < 0.45 ? 1 + Math.floor(rng.next() * 3) : null;

  const jackpotOrbHits: Array<{ cell: number; tier: JackpotTier }> = [];
  for (const cell of lockedCells) {
    if (rng.next() < 0.065) {
      jackpotOrbHits.push({
        cell,
        tier: pickJackpotTier(rng),
      });
    }
  }

  if (jackpotOrbHits.length === 0 && lockedCells.length >= 8 && rng.next() < 0.12) {
    const forcedCell = pickFromList(lockedCells, rng, 0);
    jackpotOrbHits.push({
      cell: forcedCell,
      tier: pickJackpotTier(rng),
    });
  }

  const valueSum = orbValues.reduce((sum, value) => sum + value, 0);
  const finalAward = Math.max(0, Math.floor(valueSum * (0.35 + rng.next() * 0.35) * collectorMultiplier));

  const jackpotAwards = dedupeJackpotAwards(
    jackpotOrbHits.map((hit) => ({
      tier: hit.tier,
      amount: 0,
      source: "ember_orb",
    })),
  );

  const jackpotFlags: Partial<Record<JackpotTier, boolean>> = {};
  for (const award of jackpotAwards) {
    jackpotFlags[award.tier] = true;
  }

  return {
    payload: {
      type: "EMBER_RESPIN",
      sessionId: input.sessionId,
      revealSeed,
      precomputedOutcome: {
        lockedCells,
        orbValues,
        respinsRemaining: 3,
        collectorMultiplier,
        guaranteedMysteryOrbAt,
        jackpotOrbHits,
        finalAward,
      },
      expectedTotalAward: finalAward,
      jackpotAwards,
    },
    featureWin:
      finalAward > 0
        ? {
            kind: "feature",
            amount: finalAward,
            detail: "Ember Respin trigger award",
          }
        : null,
    legacyState: {
      active: true,
      lockedCells,
      respinsRemaining: 3,
      orbValues,
      jackpotFlags,
    },
  };
};

interface WheelAscensionBuild {
  payload: SpinBonusPayload;
  featureWin: SpinWin | null;
  state: NonNullable<SpinBonusState["wheelAscension"]>;
}

const WHEEL_WEDGE_MAP: Array<{
  wedgeId: string;
  kind: "coin" | "multiplier" | "jackpot" | "respin";
  value: number | string;
}> = [
  { wedgeId: "coin_1", kind: "coin", value: 1 },
  { wedgeId: "coin_2", kind: "coin", value: 2 },
  { wedgeId: "coin_3", kind: "coin", value: 3 },
  { wedgeId: "coin_4", kind: "coin", value: 5 },
  { wedgeId: "mult_2", kind: "multiplier", value: 2 },
  { wedgeId: "mult_3", kind: "multiplier", value: 3 },
  { wedgeId: "mult_5", kind: "multiplier", value: 5 },
  { wedgeId: "respin_1", kind: "respin", value: 1 },
  { wedgeId: "respin_2", kind: "respin", value: 1 },
  { wedgeId: "jackpot_ember", kind: "jackpot", value: "ember" },
  { wedgeId: "jackpot_relic", kind: "jackpot", value: "relic" },
  { wedgeId: "jackpot_mythic", kind: "jackpot", value: "mythic" },
];

const buildWheelAscensionPayload = (
  input: SharedSpinInput,
  revealSeed: string,
): WheelAscensionBuild => {
  const rng = new SeededRng(`${revealSeed}|resolve`);
  const maxSpins = 6;
  let awardedSpins = 1 + Math.floor(rng.next() * 3);
  let spinCounter = 0;
  let finalAward = 0;

  const outcomesBySpin: Array<{ wedgeId: string; resolvedAward: number; jackpotTier?: JackpotTier }> = [];
  const jackpotAwards: BonusJackpotAward[] = [];

  while (spinCounter < awardedSpins && spinCounter < maxSpins) {
    spinCounter += 1;
    const roll = rng.next();

    if (roll < 0.54) {
      const value = Math.max(1, Math.floor((1 + rng.next() * 6) * input.bet));
      finalAward += value;
      outcomesBySpin.push({
        wedgeId: `coin_${spinCounter}`,
        resolvedAward: value,
      });
      continue;
    }

    if (roll < 0.78) {
      const multiplier = 2 + Math.floor(rng.next() * 4);
      const value = Math.max(1, Math.floor(input.bet * multiplier * (0.8 + rng.next() * 0.6)));
      finalAward += value;
      outcomesBySpin.push({
        wedgeId: `mult_${multiplier}_${spinCounter}`,
        resolvedAward: value,
      });
      continue;
    }

    if (roll < 0.9 && awardedSpins < maxSpins) {
      awardedSpins = Math.min(maxSpins, awardedSpins + 1);
      outcomesBySpin.push({
        wedgeId: `respin_${spinCounter}`,
        resolvedAward: 0,
      });
      continue;
    }

    const jackpotTier = pickJackpotTier(rng);
    jackpotAwards.push({
      tier: jackpotTier,
      amount: 0,
      source: "wheel_wedge",
    });
    outcomesBySpin.push({
      wedgeId: `jackpot_${jackpotTier}_${spinCounter}`,
      resolvedAward: 0,
      jackpotTier,
    });
  }

  return {
    payload: {
      type: "WHEEL_ASCENSION",
      sessionId: input.sessionId,
      revealSeed,
      precomputedOutcome: {
        wedgeMap: WHEEL_WEDGE_MAP,
        awardedSpins,
        maxSpins,
        outcomesBySpin,
        finalAward,
      },
      expectedTotalAward: finalAward,
      jackpotAwards: dedupeJackpotAwards(jackpotAwards),
    },
    featureWin:
      finalAward > 0
        ? {
            kind: "feature",
            amount: finalAward,
            detail: "Wheel Ascension trigger award",
          }
        : null,
    state: {
      active: true,
      currentSpin: 0,
      awardedSpins,
      maxSpins,
    },
  };
};

interface RelicBoardCell {
  slotId: string;
  hidden: "coin" | "multiplier" | "jackpotTier" | "bustShield";
  jackpotTier?: JackpotTier;
}

interface RelicVaultBuild {
  payload: SpinBonusPayload;
  featureWin: SpinWin | null;
  state: NonNullable<SpinBonusState["relicVault"]>;
}

const buildRelicVaultPayload = (
  input: SharedSpinInput,
  analysis: ReelAnalysis,
  revealSeed: string,
): RelicVaultBuild => {
  const rng = new SeededRng(`${revealSeed}|resolve`);
  const keyCount = 3 + Math.min(2, Math.floor((analysis.dragonCount + analysis.wildCount) / 2));
  const picksAllowed = keyCount;
  const boardSize = 9;

  const board: RelicBoardCell[] = Array.from({ length: boardSize }, (_, index) => {
    const roll = rng.next();

    if (roll < 0.5) {
      return {
        slotId: `slot_${index + 1}`,
        hidden: "coin",
      };
    }

    if (roll < 0.72) {
      return {
        slotId: `slot_${index + 1}`,
        hidden: "multiplier",
      };
    }

    if (roll < 0.9) {
      return {
        slotId: `slot_${index + 1}`,
        hidden: "jackpotTier",
        jackpotTier: pickFromList(JACKPOT_TIERS, rng, "ember"),
      };
    }

    return {
      slotId: `slot_${index + 1}`,
      hidden: "bustShield",
    };
  });

  const remaining = board.map((_, index) => index);
  const revealed: string[] = [];
  const jackpotCounts: Record<JackpotTier, number> = {
    ember: 0,
    relic: 0,
    mythic: 0,
    throne: 0,
  };

  let finalAward = 0;

  for (let pick = 0; pick < picksAllowed && remaining.length > 0; pick += 1) {
    let choiceIndex = Math.floor(rng.next() * remaining.length);

    if (pick === 0) {
      const nonShieldIndices = remaining.filter((index) => {
        return (board[index]?.hidden ?? "coin") !== "bustShield";
      });

      if (nonShieldIndices.length > 0) {
        const target = pickFromList(nonShieldIndices, rng, nonShieldIndices[0] ?? 0);
        const found = remaining.indexOf(target);
        choiceIndex = found >= 0 ? found : 0;
      }
    }

    const boardIndex = remaining.splice(choiceIndex, 1)[0] ?? 0;
    const cell = board[boardIndex] ?? {
      slotId: `slot_${boardIndex + 1}`,
      hidden: "coin" as const,
    };

    revealed.push(cell.slotId);

    if (cell.hidden === "coin") {
      finalAward += Math.max(1, Math.floor((0.8 + rng.next() * 4.2) * input.bet));
      continue;
    }

    if (cell.hidden === "multiplier") {
      const multiplier = 2 + Math.floor(rng.next() * 3);
      finalAward = Math.floor(Math.max(finalAward, input.bet) * multiplier);
      continue;
    }

    if (cell.hidden === "bustShield") {
      finalAward += Math.max(1, Math.floor(input.bet * 0.5));
      continue;
    }

    const tier = cell.jackpotTier ?? "ember";
    jackpotCounts[tier] += 1;
  }

  const jackpotAwards: BonusJackpotAward[] = [];
  for (const tier of JACKPOT_TIERS) {
    if (jackpotCounts[tier] >= 3) {
      jackpotAwards.push({
        tier,
        amount: 0,
        source: "relic_match",
      });
    }
  }

  if (jackpotAwards.length === 0 && analysis.dragonCount >= 4 && rng.next() < 0.08) {
    jackpotAwards.push({
      tier: pickJackpotTier(rng),
      amount: 0,
      source: "relic_rare",
    });
  }

  return {
    payload: {
      type: "RELIC_VAULT",
      sessionId: input.sessionId,
      revealSeed,
      precomputedOutcome: {
        keyCount,
        board,
        picksAllowed,
        picksMade: revealed.length,
        revealed,
        guaranteedNonBustFirstPick: true,
        jackpotEmblemCounts: jackpotCounts,
        finalAward,
      },
      expectedTotalAward: finalAward,
      jackpotAwards: dedupeJackpotAwards(jackpotAwards),
    },
    featureWin:
      finalAward > 0
        ? {
            kind: "feature",
            amount: finalAward,
            detail: "Relic Vault trigger award",
          }
        : null,
    state: {
      active: true,
      keys: keyCount,
      picksRemaining: Math.max(0, keyCount - revealed.length),
      revealed,
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
      if (emberResult.featureWin) {
        wins.push(emberResult.featureWin);
      }
    }

    if (selectedBonusType === "WHEEL_ASCENSION") {
      const wheelResult = buildWheelAscensionPayload(input, revealSeed);
      bonusPayload = wheelResult.payload;
      bonusState.wheelAscension = wheelResult.state;
      if (wheelResult.featureWin) {
        wins.push(wheelResult.featureWin);
      }
    }

    if (selectedBonusType === "RELIC_VAULT") {
      const relicResult = buildRelicVaultPayload(input, analysis, revealSeed);
      bonusPayload = relicResult.payload;
      bonusState.relicVault = relicResult.state;
      if (relicResult.featureWin) {
        wins.push(relicResult.featureWin);
      }
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

    const jackpotSnapshotBefore = toJackpotSnapshot(app.db.getJackpots());
    const wins: SpinWin[] = outcome.wins.filter((win) => win.kind !== "jackpot");
    let totalWin = wins.reduce((sum, win) => sum + win.amount, 0);

    const jackpotPayoutTierSet = new Set<JackpotTier>();
    let bonusPayload: SpinBonusPayload | null = null;

    if (outcome.bonusPayload) {
      const resolvedJackpotAwards = dedupeJackpotAwards(
        outcome.bonusPayload.jackpotAwards.map((award) => ({
          tier: award.tier,
          amount: jackpotSnapshotBefore[award.tier],
          source: award.source,
        })),
      );

      for (const award of resolvedJackpotAwards) {
        jackpotPayoutTierSet.add(award.tier);
        totalWin += award.amount;
        wins.push({
          kind: "jackpot",
          amount: award.amount,
          detail: `${award.tier.toUpperCase()} jackpot payout (${award.source})`,
        });
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
    }

    let legacyJackpotTier = outcome.triggers.jackpotTier;
    if (!legacyJackpotTier && bonusPayload && bonusPayload.jackpotAwards.length > 0) {
      legacyJackpotTier = bonusPayload.jackpotAwards[0]?.tier;
    }

    if (legacyJackpotTier && !jackpotPayoutTierSet.has(legacyJackpotTier)) {
      const legacyJackpotAmount = jackpotSnapshotBefore[legacyJackpotTier];
      jackpotPayoutTierSet.add(legacyJackpotTier);
      totalWin += legacyJackpotAmount;
      wins.push({
        kind: "jackpot",
        amount: legacyJackpotAmount,
        detail: `${legacyJackpotTier.toUpperCase()} jackpot payout`,
      });
    }

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

    const spinId = randomUUID();
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
      bonusPayload,
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
        lastBonusPayload: response.bonusPayload,
        lastJackpotSnapshotBefore: response.jackpotSnapshotBefore,
        lastJackpotSnapshotAfter: response.jackpotSnapshotAfter,
      },
      jackpotContributionBet: body.bet,
      ...(legacyJackpotTier ? { jackpotPayoutTier: legacyJackpotTier } : {}),
      ...(jackpotPayoutTierSet.size > 0
        ? { jackpotPayoutTiers: Array.from(jackpotPayoutTierSet) }
        : {}),
    });

    for (const tier of jackpotPayoutTierSet) {
      app.eventBus.publish("jackpot", {
        profileId: profile.id,
        sessionId: session.id,
        tier,
        amount: jackpotSnapshotBefore[tier],
      });
    }

    if (hasAnyTrigger(response.triggerFlags)) {
      app.eventBus.publish("bonus", {
        profileId: profile.id,
        sessionId: session.id,
        triggers: response.triggers,
        triggerFlags: response.triggerFlags,
        bonusType: response.bonusPayload?.type ?? null,
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
