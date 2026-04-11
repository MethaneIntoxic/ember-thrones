import { createSeededRng } from "../rng";
import { JACKPOT_TIERS, type JackpotTier } from "./emberLock";
import type {
  EmberRespinCollectorLockSession as EmberRespinCollectorLockSessionContract,
  EmberRespinJackpotOrbHit as EmberRespinJackpotOrbHitContract
} from "../../contracts/api";

export type EmberRespinJackpotOrbHit = EmberRespinJackpotOrbHitContract;

export type EmberRespinCollectorLockSession = EmberRespinCollectorLockSessionContract;
export type EmberRespinSession = EmberRespinCollectorLockSession;

export interface ResolveEmberRespinCollectorLockInput {
  seed: number | string;
  bet: number;
  initialLockedCells: number[];
}

export type ResolveEmberRespinInput = ResolveEmberRespinCollectorLockInput;

const GRID_SIZE = 15;
const STARTING_RESPINS = 3;

function roundCoins(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function uniqueSortedCells(cells: number[]): number[] {
  const unique = new Set<number>();

  for (const rawCell of cells) {
    const cell = Math.trunc(rawCell);
    if (cell >= 0 && cell < GRID_SIZE) {
      unique.add(cell);
    }
  }

  return [...unique].sort((left, right) => left - right);
}

function rollJackpotTier(roll: number): JackpotTier | null {
  if (roll < 0.0025) {
    return "throne";
  }

  if (roll < 0.01) {
    return "mythic";
  }

  if (roll < 0.04) {
    return "relic";
  }

  if (roll < 0.12) {
    return "ember";
  }

  return null;
}

export function resolveEmberRespinCollectorLock(
  input: ResolveEmberRespinCollectorLockInput
): EmberRespinCollectorLockSession {
  if (!Number.isFinite(input.bet) || input.bet <= 0) {
    throw new Error("bet must be positive");
  }

  const rng = createSeededRng(`${input.seed}:ember-respin`);
  const lockedCellSet = new Set(uniqueSortedCells(input.initialLockedCells));

  while (lockedCellSet.size < 6) {
    lockedCellSet.add(rng.nextInt(GRID_SIZE));
  }

  const orbValueByCell = new Map<number, number>();
  const jackpotOrbHits: EmberRespinJackpotOrbHit[] = [];

  const addOrbAtCell = (cell: number): void => {
    if (orbValueByCell.has(cell)) {
      return;
    }

    const orbValue = roundCoins(Math.max(1, input.bet * (0.45 + rng.nextFloat() * 2.25)));
    orbValueByCell.set(cell, orbValue);

    const jackpotTier = rollJackpotTier(rng.nextFloat());
    if (jackpotTier) {
      jackpotOrbHits.push({ cell, tier: jackpotTier });
    }
  };

  for (const cell of lockedCellSet) {
    addOrbAtCell(cell);
  }

  let collectorMultiplier = 1;
  let respinsRemaining = STARTING_RESPINS;
  let respinsPlayed = 0;
  const guaranteedMysteryOrbAt = 2 + rng.nextInt(2);

  while (respinsRemaining > 0 && lockedCellSet.size < GRID_SIZE) {
    respinsPlayed += 1;
    let landedNewOrb = false;

    for (let cell = 0; cell < GRID_SIZE; cell += 1) {
      if (lockedCellSet.has(cell)) {
        continue;
      }

      if (rng.chance(0.16)) {
        lockedCellSet.add(cell);
        addOrbAtCell(cell);
        landedNewOrb = true;
      }
    }

    if (!landedNewOrb && respinsPlayed === guaranteedMysteryOrbAt && lockedCellSet.size < GRID_SIZE) {
      const openCells: number[] = [];
      for (let cell = 0; cell < GRID_SIZE; cell += 1) {
        if (!lockedCellSet.has(cell)) {
          openCells.push(cell);
        }
      }

      if (openCells.length > 0) {
        const forcedCell = openCells[rng.nextInt(openCells.length)] as number;
        lockedCellSet.add(forcedCell);
        addOrbAtCell(forcedCell);
        landedNewOrb = true;
      }
    }

    if (rng.chance(0.2)) {
      collectorMultiplier += 1;
    }

    respinsRemaining = landedNewOrb ? STARTING_RESPINS : Math.max(0, respinsRemaining - 1);
  }

  const lockedCells = [...lockedCellSet].sort((left, right) => left - right);
  const orbValues = lockedCells.map((cell) => orbValueByCell.get(cell) ?? 0);
  const orbValueTotal = orbValues.reduce((sum, value) => sum + value, 0);

  return {
    type: "EMBER_RESPIN_COLLECTOR_LOCK",
    lockedCells,
    orbValues,
    respinsRemaining,
    collectorMultiplier,
    guaranteedMysteryOrbAt,
    jackpotOrbHits,
    finalAward: roundCoins(orbValueTotal * Math.max(1, collectorMultiplier))
  };
}

export const resolveEmberRespin = resolveEmberRespinCollectorLock;

export function summarizeEmberJackpotHits(
  jackpotOrbHits: readonly EmberRespinJackpotOrbHit[]
): Record<JackpotTier, number> {
  const summary: Record<JackpotTier, number> = {
    ember: 0,
    relic: 0,
    mythic: 0,
    throne: 0
  };

  for (const hit of jackpotOrbHits) {
    if (JACKPOT_TIERS.includes(hit.tier)) {
      summary[hit.tier] += 1;
    }
  }

  return summary;
}
