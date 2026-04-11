import { createSeededRng } from "../rng";
import type { JackpotTier } from "../features/emberLock";

export type SkyPathChoice = "left" | "right";

export interface SkyPathInput {
  seed: number | string;
  bet: number;
  choices: SkyPathChoice[];
}

export interface SkyPathStep {
  step: number;
  choice: SkyPathChoice;
  blockedSide: SkyPathChoice;
  survived: boolean;
  multiplierAfterStep: number;
}

export interface SkyPathResult {
  completed: boolean;
  survivedSteps: number;
  finalMultiplier: number;
  tier: JackpotTier;
  totalReward: number;
  steps: SkyPathStep[];
}

const STEP_MULTIPLIERS = [1, 1.35, 1.8, 2.45, 3.2, 4.4, 6] as const;

function roundCoins(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function classifyTier(multiplier: number): JackpotTier {
  if (multiplier < 1.5) {
    return "ember";
  }

  if (multiplier < 3) {
    return "relic";
  }

  if (multiplier < 5) {
    return "mythic";
  }

  return "throne";
}

function normalizeChoices(choices: SkyPathChoice[]): SkyPathChoice[] {
  if (choices.length === 0) {
    return ["left", "right", "left", "left"];
  }

  return choices.slice(0, STEP_MULTIPLIERS.length).map((choice) =>
    choice === "right" ? "right" : "left"
  );
}

export function resolveSkyPath(input: SkyPathInput): SkyPathResult {
  const rng = createSeededRng(input.seed);
  const choices = normalizeChoices(input.choices);

  let survivedSteps = 0;
  let currentMultiplier = 0.25;
  const steps: SkyPathStep[] = [];

  for (let step = 0; step < choices.length; step += 1) {
    const blockedSide: SkyPathChoice = rng.chance(0.5) ? "left" : "right";
    const choice = choices[step] as SkyPathChoice;
    const survived = choice !== blockedSide;

    if (survived) {
      survivedSteps += 1;
      currentMultiplier = STEP_MULTIPLIERS[step] as number;

      if (rng.chance(0.07)) {
        currentMultiplier = roundCoins(currentMultiplier + 0.35);
      }
    }

    steps.push({
      step,
      choice,
      blockedSide,
      survived,
      multiplierAfterStep: currentMultiplier
    });

    if (!survived) {
      break;
    }
  }

  const completed = survivedSteps === choices.length;
  const finalMultiplier = roundCoins(currentMultiplier);

  return {
    completed,
    survivedSteps,
    finalMultiplier,
    tier: classifyTier(finalMultiplier),
    totalReward: roundCoins(input.bet * finalMultiplier),
    steps
  };
}
