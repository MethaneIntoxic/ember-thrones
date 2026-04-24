import { createSeededRng } from "../rng";
import type { JackpotTier } from "./emberLock";
import type {
  CelestialWheelAscensionSession as CelestialWheelAscensionSessionContract,
  WheelOutcomeBySpin as WheelOutcomeBySpinContract,
  WheelWedge as WheelWedgeContract,
  WheelWedgeKind as WheelWedgeKindContract
} from "../../contracts/api";

export type CelestialWheelWedgeKind = WheelWedgeKindContract;
export type WheelAscensionWedgeKind = CelestialWheelWedgeKind;

export type CelestialWheelWedge = WheelWedgeContract;
export type WheelAscensionWedge = CelestialWheelWedge;

export type CelestialWheelSpinOutcome = WheelOutcomeBySpinContract;
export type WheelAscensionSpinOutcome = CelestialWheelSpinOutcome;

export type CelestialWheelAscensionSession = CelestialWheelAscensionSessionContract;
export type WheelAscensionSession = CelestialWheelAscensionSession;

export interface ResolveCelestialWheelAscensionInput {
  seed: number | string;
  bet: number;
  initialSpins?: number;
  maxSpins?: number;
}

export type ResolveWheelAscensionInput = ResolveCelestialWheelAscensionInput;

type WheelWedgeTemplate = Omit<CelestialWheelWedge, "wedgeId">;

const BASE_WEDGES: readonly WheelWedgeTemplate[] = [
  { kind: "coin", value: 0.6 },
  { kind: "coin", value: 0.9 },
  { kind: "coin", value: 1.2 },
  { kind: "coin", value: 1.8 },
  { kind: "multiplier", value: 1.5 },
  { kind: "multiplier", value: 2 },
  { kind: "respin", value: 1 },
  { kind: "respin", value: 2 },
  { kind: "jackpot", value: "mini" },
  { kind: "jackpot", value: "minor" },
  { kind: "jackpot", value: "major" },
  { kind: "jackpot", value: "grand" }
];

function roundCoins(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clampInt(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, normalized));
}

function buildWedgeMap(seed: number | string): CelestialWheelWedge[] {
  const rng = createSeededRng(`${seed}:wheel-map`);
  const deck = [...BASE_WEDGES];

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(index + 1);
    const current = deck[index] as WheelWedgeTemplate;
    deck[index] = deck[swapIndex] as WheelWedgeTemplate;
    deck[swapIndex] = current;
  }

  return deck.map((entry, index) => ({
    wedgeId: `wedge-${index + 1}`,
    kind: entry.kind,
    value: entry.value
  }));
}

export function resolveCelestialWheelAscension(
  input: ResolveCelestialWheelAscensionInput
): CelestialWheelAscensionSession {
  if (!Number.isFinite(input.bet) || input.bet <= 0) {
    throw new Error("bet must be positive");
  }

  const rng = createSeededRng(`${input.seed}:wheel-run`);
  const wedgeMap = buildWedgeMap(input.seed);

  const initialSpins =
    input.initialSpins === undefined
      ? 1 + rng.nextInt(3)
      : clampInt(input.initialSpins, 1, 3);

  const maxSpins =
    input.maxSpins === undefined
      ? clampInt(initialSpins + 3, initialSpins, 8)
      : clampInt(input.maxSpins, initialSpins, 8);

  let spinsRemaining = initialSpins;
  let totalAward = 0;
  let runningMultiplier = 1;

  const jackpotTierHits: JackpotTier[] = [];
  const outcomesBySpin: CelestialWheelSpinOutcome[] = [];

  while (spinsRemaining > 0 && outcomesBySpin.length < maxSpins) {
    spinsRemaining -= 1;

    const wedge = wedgeMap[rng.nextInt(wedgeMap.length)] as CelestialWheelWedge;
    let resolvedAward = 0;

    if (wedge.kind === "coin") {
      const value = typeof wedge.value === "number" ? wedge.value : 0;
      resolvedAward = roundCoins(input.bet * value * runningMultiplier);
    } else if (wedge.kind === "multiplier") {
      const value = typeof wedge.value === "number" ? wedge.value : 1;
      runningMultiplier = roundCoins(Math.min(6, runningMultiplier * Math.max(1, value)));
      resolvedAward = roundCoins(input.bet * 0.2 * runningMultiplier);
    } else if (wedge.kind === "respin") {
      const value = typeof wedge.value === "number" ? wedge.value : 1;
      const extraSpins = Math.max(1, Math.trunc(value));
      const remainingCap = maxSpins - outcomesBySpin.length - 1;
      spinsRemaining += Math.max(0, Math.min(extraSpins, remainingCap));
      resolvedAward = roundCoins(input.bet * 0.25);
    } else {
      const jackpotTier = typeof wedge.value === "string" ? (wedge.value as JackpotTier) : "mini";
      jackpotTierHits.push(jackpotTier);
      resolvedAward = 0;
    }

    totalAward = roundCoins(totalAward + resolvedAward);

    if (wedge.kind === "jackpot") {
      outcomesBySpin.push({
        wedgeId: wedge.wedgeId,
        resolvedAward,
        jackpotTier: wedge.value as JackpotTier
      });
    } else {
      outcomesBySpin.push({
        wedgeId: wedge.wedgeId,
        resolvedAward
      });
    }
  }

  return {
    type: "WHEEL_ASCENSION",
    wedgeMap,
    awardedSpins: outcomesBySpin.length,
    maxSpins,
    outcomesBySpin,
    jackpotTierHits,
    finalAward: roundCoins(totalAward)
  };
}

export const resolveWheelAscension = resolveCelestialWheelAscension;
