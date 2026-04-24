import type { FreeGamesModifierId } from "../../contracts/api";
import type { DeterministicRng } from "../rng";

export const FREE_QUEST_TRIGGER_SCATTERS = 3;
export const FREE_QUEST_BASE_SPINS = 10;
export const FREE_QUEST_MAX_SPINS = 40;

export const FREE_QUEST_STANCES = [
  "ROYALS_REMOVED",
  "MYSTERY_SPECIAL_REVEAL",
  "EXPANDING_WILD_REELS"
] as const;
export type FreeQuestStance = (typeof FREE_QUEST_STANCES)[number];

export interface FreeQuestState {
  active: boolean;
  stance: FreeQuestStance;
  spinsRemaining: number;
  retriggerCount: number;
  totalAwardedSpins: number;
}

interface ModifierModel {
  payoutMultiplierMin: number;
  payoutMultiplierMax: number;
  retriggerBonusChance: number;
  spikeChance: number;
  spikeMultiplier: number;
}

export const MEDIUM_STANCE_MODIFIERS: Record<FreeQuestStance, ModifierModel> = {
  ROYALS_REMOVED: {
    payoutMultiplierMin: 1.08,
    payoutMultiplierMax: 1.32,
    retriggerBonusChance: 0.02,
    spikeChance: 0.02,
    spikeMultiplier: 1.12
  },
  MYSTERY_SPECIAL_REVEAL: {
    payoutMultiplierMin: 1,
    payoutMultiplierMax: 1.58,
    retriggerBonusChance: 0.01,
    spikeChance: 0.06,
    spikeMultiplier: 1.32
  },
  EXPANDING_WILD_REELS: {
    payoutMultiplierMin: 1.12,
    payoutMultiplierMax: 1.48,
    retriggerBonusChance: 0,
    spikeChance: 0.04,
    spikeMultiplier: 1.24
  }
};

export const MEDIUM_VOLATILITY_PROFILE = {
  baseRetriggerChance: 0.16,
  minRetriggerChance: 0.12,
  maxRetriggerChance: 0.28
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
  stance: FreeQuestStance = "ROYALS_REMOVED",
  triggerScatters = FREE_QUEST_TRIGGER_SCATTERS
): FreeQuestState {
  const initialSpins = clamp(calculateInitialFreeQuestSpins(triggerScatters), 1, FREE_QUEST_MAX_SPINS);

  return {
    active: true,
    stance,
    spinsRemaining: initialSpins,
    retriggerCount: 0,
    totalAwardedSpins: initialSpins
  };
}

export function getFreeQuestRetriggerChance(state: FreeQuestState, scatterCount: number): number {
  const modifier = MEDIUM_STANCE_MODIFIERS[state.stance];
  const scatterBonus = Math.max(0, scatterCount - FREE_QUEST_TRIGGER_SCATTERS) * 0.02;

  return clamp(
    MEDIUM_VOLATILITY_PROFILE.baseRetriggerChance + modifier.retriggerBonusChance + scatterBonus,
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

  return {
    triggered,
    awardedSpins: triggered ? 3 + Math.min(2, Math.max(0, scatterCount - FREE_QUEST_TRIGGER_SCATTERS)) : 0,
    chance
  };
}

export function applyFreeQuestRetrigger(state: FreeQuestState, awardedSpins: number): FreeQuestState {
  if (awardedSpins <= 0 || !state.active) {
    return state;
  }

  const nextSpinsRemaining = clamp(state.spinsRemaining + awardedSpins, 0, FREE_QUEST_MAX_SPINS);

  return {
    ...state,
    spinsRemaining: nextSpinsRemaining,
    retriggerCount: state.retriggerCount + 1,
    totalAwardedSpins: state.totalAwardedSpins + (nextSpinsRemaining - state.spinsRemaining)
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
  let multiplier =
    modifier.payoutMultiplierMin +
    (modifier.payoutMultiplierMax - modifier.payoutMultiplierMin) * rng.nextFloat();

  if (rng.chance(modifier.spikeChance)) {
    multiplier *= modifier.spikeMultiplier;
  }

  return roundCoins(baseWin * multiplier);
}

export type FreeGamesModifier = FreeGamesModifierId;
