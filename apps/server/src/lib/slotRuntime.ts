import { createHash } from "node:crypto";
import {
  applyFreeQuestRetrigger,
  applyStanceWinModifier,
  collectBonusSessionJackpotTiers,
  consumeFreeQuestSpin,
  createFreeQuestState,
  rollFreeQuestRetrigger,
  type BonusAdvanceActionType,
  type BonusActionType,
  type BonusJackpotAward,
  type BonusOutcome,
  type BonusProgress,
  type BonusType,
  type FreeGameSpinReveal,
  type FreeGamesModifierId,
  type GameVariant,
  type JackpotConfig,
  type JackpotTier,
  type OrbTriggerConfig,
  type ScatterTriggerConfig
} from "@ember-thrones/shared";

export type VolatilityPreset = "low" | "medium" | "high";
export type SpeedMode = "normal" | "turbo" | "auto";
export type ServerBonusType = BonusType;
export type ServerBonusAdvanceActionType = BonusAdvanceActionType;
export type ServerBonusActionType = BonusActionType;
export type ServerBonusOutcome = BonusOutcome;
export type ServerBonusProgress = BonusProgress;

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

export const SLOT_GEOMETRY = {
  reels: 5,
  rows: 3,
  paylines: 50
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
  mini: 5_000,
  minor: 25_000,
  major: 100_000,
  grand: 1_000_000
};

export const DEFAULT_JACKPOT_CONFIG: JackpotConfig = {
  resetAmounts: { ...JACKPOT_RESET_AMOUNTS },
  contributionShares: {
    mini: 0.4,
    minor: 0.3,
    major: 0.2,
    grand: 0.1
  },
  maxBetRequiredForGrand: true
};

export const DEFAULT_ORB_TRIGGER_CONFIG: OrbTriggerConfig = {
  minOrbs: 6,
  resetSpins: 3,
  boardCells: 15,
  grandRequiresFullBoard: true
};

export const DEFAULT_SCATTER_TRIGGER_CONFIG: ScatterTriggerConfig = {
  minScatters: 3,
  baseAwardedGames: 10,
  extraGamesPerExtraScatter: 2,
  retriggerAward: 3
};

export const DEFAULT_GAME_VARIANT: GameVariant = {
  id: "dragon-link-flagship",
  label: "Dragon Link Flagship",
  cabinetLabel: "Prosperity Cabinet",
  theme: "Red lacquer link cabinet with a visible jackpot ladder and streamed bonus reveals.",
  freeGamesModifierId: "ROYALS_REMOVED",
  jackpotConfig: DEFAULT_JACKPOT_CONFIG,
  orbTriggerConfig: DEFAULT_ORB_TRIGGER_CONFIG,
  scatterTriggerConfig: DEFAULT_SCATTER_TRIGGER_CONFIG
};

export const DEFAULT_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  mode: "connected",
  supportsRealtimeEvents: true,
  supportsQueueDrain: false,
  supportsResumableBonuses: true,
  label: "Connected authoritative runtime",
  disclosureCopy:
    "This endpoint is connected to the authoritative server. Demo fallback and fake-live transport are disabled for this runtime."
};

export const MAX_BET_QUALIFICATION_RULES: MaxBetQualificationRule[] = [
  {
    id: "grand_jackpot",
    requiresCreditsPerSpin: MAX_BET_CREDITS_PER_SPIN,
    appliesTo: ["progressive:grand"],
    description: "The grand jackpot only participates when credits-per-spin is set to max bet."
  },
  {
    id: "feature_boost",
    requiresCreditsPerSpin: FEATURE_BOOST_CREDITS_PER_SPIN,
    appliesTo: ["feature:hold-and-spin", "feature:free-games"],
    description: "Feature boost flags unlock once credits-per-spin reaches the high-tier wager band."
  }
];

export const DEFAULT_MATH_PROFILE_VERSION_ID = "dragon-link-vegas-v2";
export const DEFAULT_MATH_PROFILE_VERSION: Omit<MathProfileVersionRecord, "createdAt"> = {
  id: DEFAULT_MATH_PROFILE_VERSION_ID,
  profileKey: "dragon_link_social",
  versionTag: "2026.04.24",
  reelSetId: "dragon_link_5x3_50l_v2",
  checksum: createHash("sha256").update("dragon-link|social|5x3|50|hold-and-spin|free-games|v2").digest("hex"),
  description: "Dragon Link-inspired social casino runtime with streamed hold-and-spin and free-games bonuses."
};

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
}

const supportedDenominations = new Set<number>(DENOMINATION_LADDER);
const supportedCredits = new Set<number>(CREDITS_PER_SPIN_OPTIONS);
const supportedSpeedModes = new Set<SpeedMode>(SUPPORTED_SPEED_MODES);

export const isSupportedDenomination = (value: number): boolean => supportedDenominations.has(value);
export const isSupportedCreditsPerSpin = (value: number): boolean => supportedCredits.has(value);
export const isSupportedSpeedMode = (value: string): value is SpeedMode => supportedSpeedModes.has(value as SpeedMode);

export const buildRuntimeCapabilities = (): RuntimeCapabilities => ({
  ...DEFAULT_RUNTIME_CAPABILITIES
});

export const findWagerSelectionByTotalBet = (
  totalBet: number
): Pick<WagerProfile, "denomination" | "creditsPerSpin"> | null => {
  if (!Number.isInteger(totalBet) || totalBet <= 0) {
    return null;
  }

  for (const denomination of DENOMINATION_LADDER) {
    for (const creditsPerSpin of CREDITS_PER_SPIN_OPTIONS) {
      if (denomination * creditsPerSpin === totalBet) {
        return { denomination, creditsPerSpin };
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
      `Wager mismatch: legacy total bet ${input.bet} does not match denomination ${denomination} x credits ${creditsPerSpin}`
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
    speedMode
  };
};

const normalizeJackpotTierForWager = (tier: JackpotTier, wager: WagerProfile): JackpotTier =>
  tier === "grand" && !wager.qualifiesForGrandJackpot ? "major" : tier;

export const sanitizeBonusOutcomeForWager = (
  outcome: ServerBonusOutcome,
  wager: WagerProfile
): ServerBonusOutcome => {
  if (wager.qualifiesForGrandJackpot) {
    return outcome;
  }

  if (outcome.type === "HOLD_AND_SPIN") {
    return {
      ...outcome,
      startingOrbs: outcome.startingOrbs.map((orb: (typeof outcome.startingOrbs)[number]) => ({
        ...orb,
        ...(orb.jackpotTier ? { jackpotTier: normalizeJackpotTierForWager(orb.jackpotTier, wager) } : {})
      })),
      steps: outcome.steps.map((step: (typeof outcome.steps)[number]) => ({
        ...step,
        landedOrbs: step.landedOrbs.map((orb: (typeof step.landedOrbs)[number]) => ({
          ...orb,
          ...(orb.jackpotTier ? { jackpotTier: normalizeJackpotTierForWager(orb.jackpotTier, wager) } : {})
        }))
      })),
      jackpotTierHits: outcome.jackpotTierHits.map((tier: (typeof outcome.jackpotTierHits)[number]) =>
        normalizeJackpotTierForWager(tier, wager)
      )
    };
  }

  return outcome;
};

export const collectJackpotTiersForOutcome = (outcome: ServerBonusOutcome): JackpotTier[] => {
  return collectBonusSessionJackpotTiers(outcome) as JackpotTier[];
};

export const buildFreeGamesOutcome = (input: {
  seed: string;
  wager: WagerProfile;
  triggerScatters: number;
  gameVariantId?: string;
  modifierId?: FreeGamesModifierId;
}): Extract<ServerBonusOutcome, { type: "FREE_GAMES" }> => {
  const modifierId = input.modifierId ?? DEFAULT_GAME_VARIANT.freeGamesModifierId;
  const gameVariantId = input.gameVariantId ?? DEFAULT_GAME_VARIANT.id;
  const rng = new SeededRng(`${input.seed}|free-games|${input.wager.totalBet}|${modifierId}`);
  let state = createFreeQuestState(modifierId, Math.max(3, input.triggerScatters));
  const initialGames = state.spinsRemaining;
  const steps: FreeGameSpinReveal[] = [];
  let runningAward = 0;
  let guard = 0;

  while (state.spinsRemaining > 0 && guard < 64) {
    guard += 1;

    const spinIndex = steps.length + 1;
    const scatterCount = rng.chance(0.16) ? 3 + rng.nextInt(2) : rng.chance(0.18) ? 2 : rng.chance(0.22) ? 1 : 0;
    const lineWin = Math.max(1, Math.floor(input.wager.totalBet * (0.35 + rng.nextFloat() * 1.45)));
    const awardedWin = Math.max(1, applyStanceWinModifier(lineWin, state, rng));
    runningAward += awardedWin;

    let nextState = consumeFreeQuestSpin(state);
    const retrigger = rollFreeQuestRetrigger(rng, nextState, scatterCount);
    if (retrigger.triggered && retrigger.awardedSpins > 0) {
      nextState = applyFreeQuestRetrigger(nextState, retrigger.awardedSpins);
    }

    const step: FreeGameSpinReveal = {
      spinIndex,
      lineWin,
      awardedWin,
      runningAward,
      scatterCount,
      retriggered: retrigger.triggered,
      awardedExtraGames: retrigger.awardedSpins,
      gamesRemainingAfter: nextState.spinsRemaining,
      ...(modifierId === "MYSTERY_SPECIAL_REVEAL"
        ? { multiplier: 1 + Math.min(4, Math.floor(spinIndex / 2)), revealedSpecialSymbol: rng.pick(["coin", "lantern", "ingot", "dragon", "wild"] as const) }
        : modifierId === "EXPANDING_WILD_REELS"
          ? { expandedWildReels: [rng.nextInt(SLOT_GEOMETRY.reels)] }
          : { multiplier: 1 + Math.min(3, Math.floor(spinIndex / 3)) })
    };

    steps.push(step);
    state = nextState;
  }

  return {
    type: "FREE_GAMES",
    gameVariantId,
    modifierId,
    initialGames,
    totalAwardedGames: state.totalAwardedSpins,
    retriggerCount: state.retriggerCount,
    steps,
    finalAward: runningAward
  };
};

export const createFeatureShell = (
  outcome: ServerBonusOutcome,
  progress: ServerBonusProgress,
  wager: WagerProfile
): BonusFeatureShell => {
  if (outcome.type === "HOLD_AND_SPIN" && progress.type === "HOLD_AND_SPIN") {
    return {
      type: outcome.type,
      mode: "server-owned",
      nextAction: progress.nextAction ?? "CLAIM",
      totalRounds: progress.totalSteps,
      roundsRemaining: Math.max(0, progress.totalSteps - progress.stepCursor),
      intro: "Server-owned hold-and-spin progression with locked orb positions and reset respins.",
      progressiveQualified: {
        grand: wager.qualifiesForGrandJackpot,
        featureBoost: wager.qualifiesForFeatureBoost
      },
      entryState: {
        variantId: outcome.gameVariantId,
        startingOrbCount: outcome.startingOrbs.length,
        respinsRemaining: progress.respinsRemaining
      }
    };
  }

  return {
    type: outcome.type,
    mode: "server-owned",
    nextAction: progress.nextAction ?? "CLAIM",
    totalRounds: progress.totalSpins,
    roundsRemaining: Math.max(0, progress.totalSpins - progress.spinCursor),
    intro: "Server-owned free-games progression with streamed bonus spins and retrigger state.",
    progressiveQualified: {
      grand: false,
      featureBoost: wager.qualifiesForFeatureBoost
    },
    entryState: {
      variantId: outcome.gameVariantId,
      modifierId: outcome.modifierId,
      initialGames: outcome.initialGames
    }
  };
};

export const buildMaxBetQualificationSummary = () => ({
  requiresMaxBetForGrand: true,
  maxBetCreditsPerSpin: MAX_BET_CREDITS_PER_SPIN,
  rules: MAX_BET_QUALIFICATION_RULES.map((rule) => ({ ...rule }))
});

export const cloneJackpotAwards = (awards: readonly BonusJackpotAward[]): BonusJackpotAward[] =>
  awards.map((award) => ({ ...award }));
