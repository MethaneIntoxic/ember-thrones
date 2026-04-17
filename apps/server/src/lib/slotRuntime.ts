import { createHash } from "node:crypto";
import {
  applyFreeQuestRetrigger,
  applyStanceWinModifier,
  collectBonusSessionJackpotTiers,
  consumeFreeQuestSpin,
  createFreeQuestState,
  rollFreeQuestRetrigger,
  type BonusJackpotAward,
  type BonusOutcome as SharedBonusOutcome,
  type BonusProgress as SharedBonusProgress,
  type BonusType as SharedBonusType,
  type FreeQuestStance,
  type JackpotTier,
} from "@ember-thrones/shared";

export type VolatilityPreset = "low" | "medium" | "high";
export type SpeedMode = "normal" | "turbo" | "auto";
export type ServerBonusType = SharedBonusType | "FREE_SPINS";
export type ServerBonusAdvanceActionType = "RESPIN" | "WHEEL_STOP" | "PICK" | "FREE_SPIN";
export type ServerBonusActionType = "START" | "RESUME" | ServerBonusAdvanceActionType | "CLAIM";

export interface MathProfileVersionRecord {
  id: string;
  profileKey: string;
  versionTag: string;
  reelSetId: string;
  checksum: string;
  description: string;
  createdAt: string;
}

export interface RuntimeCapabilities {
  mode: "connected" | "demo";
  supportsRealtimeEvents: boolean;
  supportsQueueDrain: boolean;
  supportsResumableBonuses: boolean;
  label: string;
  disclosureCopy: string;
}

export interface MaxBetQualificationRule {
  id: string;
  requiresCreditsPerSpin: number;
  appliesTo: string[];
  description: string;
}

export interface WagerProfile {
  denomination: number;
  creditsPerSpin: number;
  totalBet: number;
  isMaxBet: boolean;
  qualifiesForGrandJackpot: boolean;
  qualifiesForFeatureBoost: boolean;
  speedMode: SpeedMode;
}

export interface BonusFeatureShell {
  type: ServerBonusType;
  mode: "server-owned";
  nextAction: ServerBonusAdvanceActionType | "CLAIM";
  totalRounds: number;
  roundsRemaining: number;
  intro: string;
  progressiveQualified: {
    grand: boolean;
    featureBoost: boolean;
  };
  entryState: Record<string, unknown>;
}

export interface FreeSpinsStickyWildState {
  reelIndex: number;
  rows: number[];
}

export interface FreeSpinReveal {
  spinIndex: number;
  lineWin: number;
  awardedWin: number;
  multiplier: number;
  runningAward: number;
  scatterCount: number;
  retriggered: boolean;
  awardedExtraSpins: number;
  retriggerChance: number;
  spinsRemainingAfter: number;
  stickyWildState: FreeSpinsStickyWildState[];
}

export interface FreeSpinsOutcome {
  type: "FREE_SPINS";
  stance: FreeQuestStance;
  initialSpins: number;
  totalAwardedSpins: number;
  retriggerCount: number;
  multiplierLadder: number[];
  stickyWildState: FreeSpinsStickyWildState[];
  steps: FreeSpinReveal[];
  finalAward: number;
}

export interface FreeSpinsProgress {
  type: "FREE_SPINS";
  spinCursor: number;
  totalSpins: number;
  revealedSpins: FreeSpinReveal[];
  runningAward: number;
  retriggerCount: number;
  spinsRemaining: number;
  multiplierLadder: number[];
  completed: boolean;
  claimed: boolean;
  nextAction: "FREE_SPIN" | "CLAIM" | null;
}

export type ServerBonusOutcome = SharedBonusOutcome | FreeSpinsOutcome;
export type ServerBonusProgress = SharedBonusProgress | FreeSpinsProgress;

export const SLOT_GEOMETRY = {
  reels: 5,
  rows: 3,
  paylines: 50,
} as const;

export const DENOMINATION_LADDER = [1, 2, 5, 10, 20, 50, 100] as const;
export const CREDITS_PER_SPIN_OPTIONS = [25, 50, 75, 100] as const;
export const SUPPORTED_SPEED_MODES = ["normal", "turbo", "auto"] as const;
export const DEFAULT_DENOMINATION = DENOMINATION_LADDER[0];
export const DEFAULT_CREDITS_PER_SPIN = 50;
export const DEFAULT_SPEED_MODE: SpeedMode = "normal";
export const MAX_BET_CREDITS_PER_SPIN = CREDITS_PER_SPIN_OPTIONS[CREDITS_PER_SPIN_OPTIONS.length - 1]!;
export const FEATURE_BOOST_CREDITS_PER_SPIN = 75;
export const JACKPOT_RESET_AMOUNTS: Record<JackpotTier, number> = {
  ember: 5_000,
  relic: 25_000,
  mythic: 100_000,
  throne: 1_000_000,
};
export const DEFAULT_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  mode: "connected",
  supportsRealtimeEvents: true,
  supportsQueueDrain: false,
  supportsResumableBonuses: true,
  label: "Connected authoritative runtime",
  disclosureCopy:
    "This endpoint is connected to the authoritative server. Demo fallback and fake-live transport are disabled for this runtime.",
};
export const MAX_BET_QUALIFICATION_RULES: MaxBetQualificationRule[] = [
  {
    id: "grand_jackpot",
    requiresCreditsPerSpin: MAX_BET_CREDITS_PER_SPIN,
    appliesTo: ["progressive:throne"],
    description: "The throne jackpot only participates when credits-per-spin is set to max bet.",
  },
  {
    id: "feature_boost",
    requiresCreditsPerSpin: FEATURE_BOOST_CREDITS_PER_SPIN,
    appliesTo: ["feature:hold-and-spin", "feature:wheel"],
    description: "Feature boost flags unlock once credits-per-spin reaches the high-tier wager band.",
  },
];
export const DEFAULT_MATH_PROFILE_VERSION_ID = "dragon-link-vegas-v1";
export const DEFAULT_MATH_PROFILE_VERSION: Omit<MathProfileVersionRecord, "createdAt"> = {
  id: DEFAULT_MATH_PROFILE_VERSION_ID,
  profileKey: "dragon_link_vegas",
  versionTag: "2026.04.17",
  reelSetId: "dragon_link_5x3_50l_v1",
  checksum: createHash("sha256")
    .update("dragon-link|vegas|5x3|50|server-streamed-features-v1")
    .digest("hex"),
  description: "Server-owned Vegas-style launch harness with streamed hold-and-spin, free-spins, and wheel bonuses.",
};

const FREE_SPIN_STICKY_ROWS = SLOT_GEOMETRY.rows;

export class SeededRng {
  private state: number;

  public constructor(seed: string | number) {
    const digest = createHash("sha256").update(String(seed)).digest();
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
    return this.nextFloat();
  }

  public nextFloat(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }

  public nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error("maxExclusive must be a positive integer");
    }

    return Math.floor(this.nextFloat() * maxExclusive);
  }

  public chance(probability: number): boolean {
    if (probability <= 0) {
      return false;
    }
    if (probability >= 1) {
      return true;
    }

    return this.nextFloat() < probability;
  }

  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty array");
    }

    return items[this.nextInt(items.length)] as T;
  }

  public fork(salt: number | string): SeededRng {
    return new SeededRng(`${this.state}:${salt}`);
  }

  public getState(): number {
    return this.state;
  }
}

const supportedDenominations = new Set<number>(DENOMINATION_LADDER);
const supportedCredits = new Set<number>(CREDITS_PER_SPIN_OPTIONS);
const supportedSpeedModes = new Set<SpeedMode>(SUPPORTED_SPEED_MODES);

export const isSupportedDenomination = (value: number): boolean => supportedDenominations.has(value);
export const isSupportedCreditsPerSpin = (value: number): boolean => supportedCredits.has(value);
export const isSupportedSpeedMode = (value: string): value is SpeedMode => supportedSpeedModes.has(value as SpeedMode);

export const buildRuntimeCapabilities = (): RuntimeCapabilities => ({
  ...DEFAULT_RUNTIME_CAPABILITIES,
});

export const findWagerSelectionByTotalBet = (
  totalBet: number,
): Pick<WagerProfile, "denomination" | "creditsPerSpin"> | null => {
  if (!Number.isInteger(totalBet) || totalBet <= 0) {
    return null;
  }

  for (const denomination of DENOMINATION_LADDER) {
    for (const creditsPerSpin of CREDITS_PER_SPIN_OPTIONS) {
      if (denomination * creditsPerSpin === totalBet) {
        return {
          denomination,
          creditsPerSpin,
        };
      }
    }
  }

  return null;
};

export const resolveWagerSelection = (input: {
  bet?: number;
  denomination?: number;
  creditsPerSpin?: number;
  speedMode?: SpeedMode;
}): WagerProfile => {
  const inferred = input.bet !== undefined ? findWagerSelectionByTotalBet(input.bet) : null;
  const denomination = input.denomination ?? inferred?.denomination ?? DEFAULT_DENOMINATION;
  const creditsPerSpin = input.creditsPerSpin ?? inferred?.creditsPerSpin ?? DEFAULT_CREDITS_PER_SPIN;

  if (!isSupportedDenomination(denomination)) {
    throw new Error(`Unsupported denomination: ${denomination}`);
  }

  if (!isSupportedCreditsPerSpin(creditsPerSpin)) {
    throw new Error(`Unsupported credits-per-spin option: ${creditsPerSpin}`);
  }

  const totalBet = denomination * creditsPerSpin;
  if (input.bet !== undefined && input.bet !== totalBet) {
    throw new Error(
      `Wager mismatch: legacy total bet ${input.bet} does not match denomination ${denomination} x credits ${creditsPerSpin}`,
    );
  }

  const speedMode = input.speedMode ?? DEFAULT_SPEED_MODE;
  if (!isSupportedSpeedMode(speedMode)) {
    throw new Error(`Unsupported speed mode: ${speedMode}`);
  }

  return {
    denomination,
    creditsPerSpin,
    totalBet,
    isMaxBet: creditsPerSpin === MAX_BET_CREDITS_PER_SPIN,
    qualifiesForGrandJackpot: creditsPerSpin === MAX_BET_CREDITS_PER_SPIN,
    qualifiesForFeatureBoost: creditsPerSpin >= FEATURE_BOOST_CREDITS_PER_SPIN,
    speedMode,
  };
};

const normalizeJackpotTierForWager = (tier: JackpotTier, wager: WagerProfile): JackpotTier => {
  if (tier === "throne" && !wager.qualifiesForGrandJackpot) {
    return "mythic";
  }

  return tier;
};

export const sanitizeBonusOutcomeForWager = (
  outcome: ServerBonusOutcome,
  wager: WagerProfile,
): ServerBonusOutcome => {
  if (wager.qualifiesForGrandJackpot || outcome.type === "FREE_SPINS") {
    return outcome;
  }

  if (outcome.type === "EMBER_RESPIN") {
    return {
      ...outcome,
      startingOrbs: outcome.startingOrbs.map((orb: (typeof outcome.startingOrbs)[number]) => ({
        ...orb,
        ...(orb.jackpotTier
          ? { jackpotTier: normalizeJackpotTierForWager(orb.jackpotTier, wager) }
          : {}),
      })),
      steps: outcome.steps.map((step: (typeof outcome.steps)[number]) => ({
        ...step,
        landedOrbs: step.landedOrbs.map((orb: (typeof step.landedOrbs)[number]) => ({
          ...orb,
          ...(orb.jackpotTier
            ? { jackpotTier: normalizeJackpotTierForWager(orb.jackpotTier, wager) }
            : {}),
        })),
      })),
      jackpotOrbHits: outcome.jackpotOrbHits.map((hit: (typeof outcome.jackpotOrbHits)[number]) => ({
        ...hit,
        tier: normalizeJackpotTierForWager(hit.tier, wager),
      })),
    };
  }

  if (outcome.type === "WHEEL_ASCENSION") {
    return {
      ...outcome,
      wedgeMap: outcome.wedgeMap.map((wedge: (typeof outcome.wedgeMap)[number]) => {
        if (wedge.kind !== "jackpot" || typeof wedge.value !== "string") {
          return wedge;
        }

        return {
          ...wedge,
          value: normalizeJackpotTierForWager(wedge.value, wager),
        };
      }),
      outcomesBySpin: outcome.outcomesBySpin.map((wheelStop: (typeof outcome.outcomesBySpin)[number]) => ({
        ...wheelStop,
        ...(wheelStop.jackpotTier
          ? { jackpotTier: normalizeJackpotTierForWager(wheelStop.jackpotTier, wager) }
          : {}),
      })),
      jackpotTierHits: outcome.jackpotTierHits.map((tier: (typeof outcome.jackpotTierHits)[number]) =>
        normalizeJackpotTierForWager(tier, wager),
      ),
    };
  }

  return {
    ...outcome,
    board: outcome.board.map((slot: (typeof outcome.board)[number]) => {
      if (slot.hidden !== "jackpotTier" || typeof slot.value !== "string") {
        return slot;
      }

      return {
        ...slot,
        value: normalizeJackpotTierForWager(slot.value, wager),
      };
    }),
    pickResults: outcome.pickResults.map((pick: (typeof outcome.pickResults)[number]) => ({
      ...pick,
      ...(typeof pick.value === "string" ? { value: normalizeJackpotTierForWager(pick.value, wager) } : {}),
      ...(pick.jackpotTierGranted
        ? { jackpotTierGranted: normalizeJackpotTierForWager(pick.jackpotTierGranted, wager) }
        : {}),
    })),
    jackpotTierHits: outcome.jackpotTierHits.map((tier: (typeof outcome.jackpotTierHits)[number]) =>
      normalizeJackpotTierForWager(tier, wager),
    ),
  };
};

export const collectJackpotTiersForOutcome = (outcome: ServerBonusOutcome): JackpotTier[] => {
  if (outcome.type === "FREE_SPINS") {
    return [];
  }

  return collectBonusSessionJackpotTiers(outcome) as JackpotTier[];
};

const pushStickyWild = (
  state: FreeSpinsStickyWildState[],
  reelIndex: number,
  rowIndex: number,
): FreeSpinsStickyWildState[] => {
  const existing = state.find((entry) => entry.reelIndex === reelIndex);
  if (!existing) {
    return [...state, { reelIndex, rows: [rowIndex] }];
  }

  if (existing.rows.includes(rowIndex)) {
    return state.map((entry) => ({ ...entry, rows: [...entry.rows] }));
  }

  return state.map((entry) =>
    entry.reelIndex === reelIndex
      ? {
          ...entry,
          rows: [...entry.rows, rowIndex].sort((left, right) => left - right),
        }
      : { ...entry, rows: [...entry.rows] },
  );
};

export const buildFreeSpinsOutcome = (input: {
  seed: string;
  wager: WagerProfile;
  triggerScatters: number;
  stance?: FreeQuestStance;
}): FreeSpinsOutcome => {
  const rng = new SeededRng(`${input.seed}|free-spins|${input.wager.totalBet}`);
  let state = createFreeQuestState(input.stance ?? "relic", Math.max(3, input.triggerScatters));
  const initialSpins = state.spinsRemaining;
  const steps: FreeSpinReveal[] = [];
  const multiplierLadder: number[] = [];
  let stickyWildState: FreeSpinsStickyWildState[] = [];
  let runningAward = 0;
  let guard = 0;

  while (state.spinsRemaining > 0 && guard < 64) {
    guard += 1;

    const spinIndex = steps.length + 1;
    const multiplier = 1 + Math.min(7, Math.floor((spinIndex - 1) / 2));
    const scatterCount = rng.chance(0.18) ? 3 : rng.chance(0.22) ? 2 : rng.chance(0.2) ? 1 : 0;
    const lineWin = Math.max(
      1,
      Math.floor(input.wager.totalBet * (0.35 + rng.nextFloat() * 1.65) * multiplier),
    );
    const awardedWin = Math.max(1, applyStanceWinModifier(lineWin, state, rng));
    runningAward += awardedWin;

    let nextState = consumeFreeQuestSpin(state);
    let retriggered = false;
    let awardedExtraSpins = 0;
    let retriggerChance = 0;
    if (scatterCount >= 3) {
      const retrigger = rollFreeQuestRetrigger(rng, nextState, scatterCount);
      retriggered = retrigger.triggered;
      awardedExtraSpins = retrigger.awardedSpins;
      retriggerChance = retrigger.chance;

      if (retriggered && awardedExtraSpins > 0) {
        nextState = applyFreeQuestRetrigger(nextState, awardedExtraSpins);
      }
    }

    if (rng.chance(0.38)) {
      stickyWildState = pushStickyWild(
        stickyWildState,
        rng.nextInt(SLOT_GEOMETRY.reels),
        rng.nextInt(FREE_SPIN_STICKY_ROWS),
      );
    }

    multiplierLadder.push(multiplier);
    steps.push({
      spinIndex,
      lineWin,
      awardedWin,
      multiplier,
      runningAward,
      scatterCount,
      retriggered,
      awardedExtraSpins,
      retriggerChance,
      spinsRemainingAfter: nextState.spinsRemaining,
      stickyWildState: stickyWildState.map((entry) => ({ ...entry, rows: [...entry.rows] })),
    });

    state = nextState;
  }

  return {
    type: "FREE_SPINS",
    stance: state.stance,
    initialSpins,
    totalAwardedSpins: state.totalAwardedSpins,
    retriggerCount: state.retriggerCount,
    multiplierLadder,
    stickyWildState,
    steps,
    finalAward: runningAward,
  };
};

export const createFeatureShell = (
  outcome: ServerBonusOutcome,
  progress: ServerBonusProgress,
  wager: WagerProfile,
): BonusFeatureShell => {
  if (outcome.type === "EMBER_RESPIN" && progress.type === "EMBER_RESPIN") {
    return {
      type: outcome.type,
      mode: "server-owned",
      nextAction: progress.nextAction ?? "CLAIM",
      totalRounds: progress.totalSteps,
      roundsRemaining: Math.max(0, progress.totalSteps - progress.stepCursor),
      intro: "Server-owned hold-and-spin progression with locked orb positions and streamed respins.",
      progressiveQualified: {
        grand: wager.qualifiesForGrandJackpot,
        featureBoost: wager.qualifiesForFeatureBoost,
      },
      entryState: {
        lockedPositions: outcome.startingOrbs.map((orb: (typeof outcome.startingOrbs)[number]) => orb.position),
        visibleOrbCount: outcome.startingOrbs.length,
        respinsRemaining: progress.respinsRemaining,
        collectorMultiplier: progress.currentCollectorMultiplier,
      },
    };
  }

  if (outcome.type === "WHEEL_ASCENSION" && progress.type === "WHEEL_ASCENSION") {
    return {
      type: outcome.type,
      mode: "server-owned",
      nextAction: progress.nextAction ?? "CLAIM",
      totalRounds: progress.totalSpins,
      roundsRemaining: Math.max(0, progress.totalSpins - progress.spinCursor),
      intro: "Server-owned wheel progression with one resolved stop streamed at a time.",
      progressiveQualified: {
        grand: wager.qualifiesForGrandJackpot,
        featureBoost: wager.qualifiesForFeatureBoost,
      },
      entryState: {
        awardedSpins: outcome.awardedSpins,
        maxSpins: outcome.maxSpins,
        wedgeCount: outcome.wedgeMap.length,
      },
    };
  }

  if (outcome.type === "FREE_SPINS" && progress.type === "FREE_SPINS") {
    return {
      type: outcome.type,
      mode: "server-owned",
      nextAction: progress.nextAction ?? "CLAIM",
      totalRounds: progress.totalSpins,
      roundsRemaining: Math.max(0, progress.totalSpins - progress.spinCursor),
      intro: "Server-owned free-spins progression with streamed individual bonus spins and retrigger state.",
      progressiveQualified: {
        grand: false,
        featureBoost: wager.qualifiesForFeatureBoost,
      },
      entryState: {
        stance: outcome.stance,
        initialSpins: outcome.initialSpins,
        multiplierStart: outcome.multiplierLadder[0] ?? 1,
      },
    };
  }

  return {
    type: outcome.type,
    mode: "server-owned",
    nextAction: progress.nextAction ?? "CLAIM",
    totalRounds: progress.totalPicks,
    roundsRemaining: Math.max(0, progress.totalPicks - progress.pickCursor),
    intro: "Server-owned relic pick progression retained for backward compatibility.",
    progressiveQualified: {
      grand: wager.qualifiesForGrandJackpot,
      featureBoost: wager.qualifiesForFeatureBoost,
    },
    entryState: {
      picksAllowed: outcome.picksAllowed,
      boardSize: outcome.board.length,
    },
  };
};

export const buildMaxBetQualificationSummary = () => ({
  requiresMaxBetForGrand: true,
  maxBetCreditsPerSpin: MAX_BET_CREDITS_PER_SPIN,
  rules: MAX_BET_QUALIFICATION_RULES.map((rule) => ({ ...rule })),
});

export const cloneJackpotAwards = (awards: readonly BonusJackpotAward[]): BonusJackpotAward[] => {
  return awards.map((award) => ({ ...award }));
};