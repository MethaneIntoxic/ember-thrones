import { createSeededRng } from "../rng";
import { JACKPOT_TIERS, type JackpotTier } from "./emberLock";
import type {
  EmberRespinCollectorLockSession as EmberRespinCollectorLockSessionContract,
  EmberRespinJackpotOrbHit as EmberRespinJackpotOrbHitContract,
  EmberRespinRevealStep as EmberRespinRevealStepContract,
  OrbLanding as OrbLandingContract
} from "../../contracts/api";

export type EmberRespinJackpotOrbHit = EmberRespinJackpotOrbHitContract;
export type EmberRespinRevealStep = EmberRespinRevealStepContract;
export type OrbLanding = OrbLandingContract;

export type EmberRespinCollectorLockSession = EmberRespinCollectorLockSessionContract;
export type EmberRespinSession = EmberRespinCollectorLockSession;

export interface ResolveEmberRespinCollectorLockInput {
  seed: number | string;
  bet: number;
  initialLockedCells: number[];
  gameVariantId?: string;
}

export type ResolveEmberRespinInput = ResolveEmberRespinCollectorLockInput;

const GRID_SIZE = 15;
const STARTING_RESPINS = 3;
const DEFAULT_GAME_VARIANT_ID = "dragon-link-flagship";

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
    return "grand";
  }
  if (roll < 0.01) {
    return "major";
  }
  if (roll < 0.04) {
    return "minor";
  }
  if (roll < 0.12) {
    return "mini";
  }
  return null;
}

export function resolveEmberRespinCollectorLock(
  input: ResolveEmberRespinCollectorLockInput
): EmberRespinCollectorLockSession {
  if (!Number.isFinite(input.bet) || input.bet <= 0) {
    throw new Error("bet must be positive");
  }

  const rng = createSeededRng(`${input.seed}:hold-and-spin`);
  const lockedCellSet = new Set(uniqueSortedCells(input.initialLockedCells));
  const jackpotTierByCell = new Map<number, JackpotTier>();
  const orbValueByCell = new Map<number, number>();
  const jackpotOrbHits: EmberRespinJackpotOrbHit[] = [];

  while (lockedCellSet.size < 6) {
    lockedCellSet.add(rng.nextInt(GRID_SIZE));
  }

  const addOrbAtCell = (cell: number): OrbLanding | null => {
    if (orbValueByCell.has(cell)) {
      return null;
    }

    const landing: OrbLanding = {
      position: cell,
      coinValue: roundCoins(Math.max(1, input.bet * (0.45 + rng.nextFloat() * 2.25)))
    };

    const jackpotTier = rollJackpotTier(rng.nextFloat());
    if (jackpotTier) {
      jackpotOrbHits.push({ cell, tier: jackpotTier });
      jackpotTierByCell.set(cell, jackpotTier);
      landing.jackpotTier = jackpotTier;
    }

    orbValueByCell.set(cell, landing.coinValue);
    return landing;
  };

  for (const cell of lockedCellSet) {
    addOrbAtCell(cell);
  }

  const startingOrbs = [...lockedCellSet]
    .sort((left, right) => left - right)
    .map((cell) => ({
      position: cell,
      coinValue: orbValueByCell.get(cell) ?? 0,
      ...(jackpotTierByCell.has(cell) ? { jackpotTier: jackpotTierByCell.get(cell) } : {})
    }));

  let respinsRemaining = STARTING_RESPINS;
  let respinsPlayed = 0;
  const guaranteedMysteryOrbAt = 2 + rng.nextInt(2);
  const steps: EmberRespinRevealStep[] = [];

  while (respinsRemaining > 0 && lockedCellSet.size < GRID_SIZE) {
    respinsPlayed += 1;
    let landedNewOrb = false;
    const landedOrbs: OrbLanding[] = [];

    for (let cell = 0; cell < GRID_SIZE; cell += 1) {
      if (lockedCellSet.has(cell)) {
        continue;
      }

      if (rng.chance(0.16)) {
        lockedCellSet.add(cell);
        const landing = addOrbAtCell(cell);
        if (landing) {
          landedOrbs.push(landing);
        }
        landedNewOrb = true;
      }
    }

    if (!landedNewOrb && respinsPlayed === guaranteedMysteryOrbAt && lockedCellSet.size < GRID_SIZE) {
      const openCells = [...Array.from({ length: GRID_SIZE }, (_, cell) => cell)].filter(
        (cell) => !lockedCellSet.has(cell)
      );

      if (openCells.length > 0) {
        const forcedCell = openCells[rng.nextInt(openCells.length)] as number;
        lockedCellSet.add(forcedCell);
        const landing = addOrbAtCell(forcedCell);
        if (landing) {
          landedOrbs.push(landing);
        }
        landedNewOrb = true;
      }
    }

    respinsRemaining = landedNewOrb ? STARTING_RESPINS : Math.max(0, respinsRemaining - 1);
    steps.push({
      respinIndex: respinsPlayed,
      landedOrbs: landedOrbs.sort((left, right) => left.position - right.position),
      respinsRemainingAfter: respinsRemaining,
      boardCompleted: lockedCellSet.size === GRID_SIZE
    });
  }

  const filledPositions = [...lockedCellSet].sort((left, right) => left - right);
  const jackpotTierHits = [...new Set(jackpotOrbHits.map((hit) => hit.tier))];
  if (filledPositions.length === GRID_SIZE && !jackpotTierHits.includes("grand")) {
    jackpotTierHits.push("grand");
  }

  const finalAward = roundCoins(
    filledPositions.reduce((sum, cell) => sum + (orbValueByCell.get(cell) ?? 0), 0)
  );

  return {
    type: "HOLD_AND_SPIN",
    gameVariantId: input.gameVariantId ?? DEFAULT_GAME_VARIANT_ID,
    startingOrbs,
    steps,
    filledPositions,
    respinsRemaining,
    jackpotTierHits,
    finalAward
  };
}

export const resolveEmberRespin = resolveEmberRespinCollectorLock;

export function summarizeEmberJackpotHits(
  jackpotOrbHits: readonly EmberRespinJackpotOrbHit[]
): Record<JackpotTier, number> {
  const summary: Record<JackpotTier, number> = {
    mini: 0,
    minor: 0,
    major: 0,
    grand: 0
  };

  for (const hit of jackpotOrbHits) {
    if (JACKPOT_TIERS.includes(hit.tier)) {
      summary[hit.tier] += 1;
    }
  }

  return summary;
}
