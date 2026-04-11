import { createSeededRng } from "../rng";
import type { JackpotTier } from "../features/emberLock";

const LANTERN_REWARD_DECK = [0.45, 0.6, 0.8, 1, 1.2, 1.45, 1.8, 2.2, 2.8, 3.6, 5.2, 8] as const;

export interface LanternPickInput {
  seed: number | string;
  bet: number;
  picks: number[];
  maxPicks?: number;
}

export interface LanternPickReveal {
  pickOrder: number;
  lanternIndex: number;
  multiplier: number;
  tier: JackpotTier;
  reward: number;
}

export interface LanternPickResult {
  reveals: LanternPickReveal[];
  totalReward: number;
  averageMultiplier: number;
}

function roundCoins(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function multiplierToTier(multiplier: number): JackpotTier {
  if (multiplier < 1.5) {
    return "ember";
  }

  if (multiplier < 3) {
    return "relic";
  }

  if (multiplier < 6) {
    return "mythic";
  }

  return "throne";
}

function sanitizePicks(picks: number[], maxPicks: number): number[] {
  const unique: number[] = [];
  const seen = new Set<number>();

  for (const rawPick of picks) {
    const normalized = Math.abs(Math.trunc(rawPick)) % LANTERN_REWARD_DECK.length;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(normalized);
    }

    if (unique.length >= maxPicks) {
      break;
    }
  }

  if (unique.length === 0) {
    return [0, 4, 8].slice(0, maxPicks);
  }

  return unique;
}

function shuffleDeck(seed: number | string): number[] {
  const rng = createSeededRng(seed);
  const deck: number[] = [...LANTERN_REWARD_DECK];

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(index + 1);
    const current = deck[index] as number;
    deck[index] = deck[swapIndex] as number;
    deck[swapIndex] = current;
  }

  return deck;
}

export function resolveLanternPick(input: LanternPickInput): LanternPickResult {
  const maxPicks = Math.min(5, Math.max(1, input.maxPicks ?? 3));
  const picks = sanitizePicks(input.picks, maxPicks);
  const rewardDeck = shuffleDeck(input.seed);

  const reveals: LanternPickReveal[] = picks.map((lanternIndex, pickOrder) => {
    const multiplier = rewardDeck[lanternIndex] as number;
    const reward = roundCoins(input.bet * multiplier);

    return {
      pickOrder,
      lanternIndex,
      multiplier,
      tier: multiplierToTier(multiplier),
      reward
    };
  });

  const totalReward = roundCoins(reveals.reduce((sum, reveal) => sum + reveal.reward, 0));
  const averageMultiplier =
    reveals.length > 0
      ? roundCoins(reveals.reduce((sum, reveal) => sum + reveal.multiplier, 0) / reveals.length)
      : 0;

  return {
    reveals,
    totalReward,
    averageMultiplier
  };
}
