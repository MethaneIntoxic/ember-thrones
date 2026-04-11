import type { DeterministicRng } from "../rng";

export const FREE_QUEST_TRIGGER_SCATTERS = 3;
export const FREE_QUEST_BASE_SPINS = 8;
export const FREE_QUEST_MAX_SPINS = 35;

export const FREE_QUEST_STANCES = ["ember", "relic", "mythic"] as const;
export type FreeQuestStance = (typeof FREE_QUEST_STANCES)[number];

export interface FreeQuestState {
  active: boolean;
  stance: FreeQuestStance;
  spinsRemaining: number;
  retriggerCount: number;
  totalAwardedSpins: number;
}

interface StanceModifier {
  payoutMultiplierMin: number;
  payoutMultiplierMax: number;
  retriggerBonusChance: number;
  spikeChance: number;
  spikeMultiplier: number;
}

export const MEDIUM_STANCE_MODIFIERS: Record<FreeQuestStance, StanceModifier> = {
  ember: {
    payoutMultiplierMin: 1.05,
    payoutMultiplierMax: 1.3,
    retriggerBonusChance: 0.03,
    spikeChance: 0.02,
    spikeMultiplier: 1.15
  },
  relic: {
    payoutMultiplierMin: 1.12,
    payoutMultiplierMax: 1.42,
    retriggerBonusChance: 0.01,
    spikeChance: 0.04,
    spikeMultiplier: 1.2
  },
  mythic: {
    payoutMultiplierMin: 0.95,
    payoutMultiplierMax: 1.65,
    retriggerBonusChance: -0.01,
    spikeChance: 0.08,
    spikeMultiplier: 1.45
  }
};

export const MEDIUM_VOLATILITY_PROFILE = {
  baseRetriggerChance: 0.17,
  minRetriggerChance: 0.15,
  maxRetriggerChance: 0.25
} as const;

function roundCoins(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isFreeQuestTriggered(scatterCount: number): boolean {
  return scatterCount >= FREE_QUEST_TRIGGER_SCATTERS;
}

export function calculateInitialFreeQuestSpins(scatterCount: number): number {
  const extraSpins = Math.max(0, scatterCount - FREE_QUEST_TRIGGER_SCATTERS) * 2;
  return FREE_QUEST_BASE_SPINS + extraSpins;
}

export function createFreeQuestState(
  stance: FreeQuestStance = "relic",
  triggerScatters = FREE_QUEST_TRIGGER_SCATTERS
): FreeQuestState {
  const initialSpins = clamp(
    calculateInitialFreeQuestSpins(triggerScatters),
    1,
    FREE_QUEST_MAX_SPINS
  );

  return {
    active: true,
    stance,
    spinsRemaining: initialSpins,
    retriggerCount: 0,
    totalAwardedSpins: initialSpins
  };
}

export function getFreeQuestRetriggerChance(
  state: FreeQuestState,
  scatterCount: number
): number {
  const stanceModifier = MEDIUM_STANCE_MODIFIERS[state.stance];
  const scatterBonus = Math.max(0, scatterCount - 1) * 0.015;

  const rawChance =
    MEDIUM_VOLATILITY_PROFILE.baseRetriggerChance +
    stanceModifier.retriggerBonusChance +
    scatterBonus;

  return clamp(
    rawChance,
    MEDIUM_VOLATILITY_PROFILE.minRetriggerChance,
    MEDIUM_VOLATILITY_PROFILE.maxRetriggerChance
  );
}

export function rollFreeQuestRetrigger(
  rng: DeterministicRng,
  state: FreeQuestState,
  scatterCount: number
): { triggered: boolean; awardedSpins: number; chance: number } {
  const chance = getFreeQuestRetriggerChance(state, scatterCount);
  const triggered = rng.chance(chance);

  if (!triggered) {
    return {
      triggered,
      awardedSpins: 0,
      chance
    };
  }

  const awardedSpins =
    scatterCount >= FREE_QUEST_TRIGGER_SCATTERS
      ? 3 + Math.min(2, Math.max(0, scatterCount - FREE_QUEST_TRIGGER_SCATTERS))
      : 1;

  return {
    triggered,
    awardedSpins,
    chance
  };
}

export function applyFreeQuestRetrigger(
  state: FreeQuestState,
  awardedSpins: number
): FreeQuestState {
  if (awardedSpins <= 0 || !state.active) {
    return state;
  }

  const nextSpinsRemaining = clamp(
    state.spinsRemaining + awardedSpins,
    0,
    FREE_QUEST_MAX_SPINS
  );

  const adjustedAwarded = nextSpinsRemaining - state.spinsRemaining;

  return {
    ...state,
    spinsRemaining: nextSpinsRemaining,
    retriggerCount: state.retriggerCount + 1,
    totalAwardedSpins: state.totalAwardedSpins + adjustedAwarded
  };
}

export function consumeFreeQuestSpin(state: FreeQuestState): FreeQuestState {
  if (!state.active) {
    return state;
  }

  const spinsRemaining = Math.max(0, state.spinsRemaining - 1);

  return {
    ...state,
    spinsRemaining,
    active: spinsRemaining > 0
  };
}

export function applyStanceWinModifier(
  baseWin: number,
  state: FreeQuestState,
  rng: DeterministicRng
): number {
  if (baseWin <= 0) {
    return 0;
  }

  const modifier = MEDIUM_STANCE_MODIFIERS[state.stance];
  const spread = modifier.payoutMultiplierMax - modifier.payoutMultiplierMin;
  let multiplier = modifier.payoutMultiplierMin + spread * rng.nextFloat();

  if (rng.chance(modifier.spikeChance)) {
    multiplier *= modifier.spikeMultiplier;
  }

  return roundCoins(baseWin * multiplier);
}
