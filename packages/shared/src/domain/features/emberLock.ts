import type { DeterministicRng } from "../rng";

export const EMBER_LOCK_MIN_ORBS = 6;
export const EMBER_LOCK_RESPINS = 3;
export const EMBER_LOCK_GRID_SIZE = 15;

export const JACKPOT_TIERS = ["mini", "minor", "major", "grand"] as const;
export type JackpotTier = (typeof JACKPOT_TIERS)[number];

export interface OrbLanding {
  position: number;
  coinValue: number;
  jackpotTier?: JackpotTier;
}

export interface EmberLockState {
  active: boolean;
  respinsRemaining: number;
  spinsPlayed: number;
  lockedOrbs: OrbLanding[];
  completed: boolean;
}

export interface EmberLockResolution {
  orbValueWin: number;
  jackpotWin: number;
  totalWin: number;
  jackpotHits: Record<JackpotTier, number>;
}

export const DEFAULT_JACKPOT_VALUES: Record<JackpotTier, number> = {
  mini: 40,
  minor: 200,
  major: 1200,
  grand: 6000
};

const ORB_VALUE_MULTIPLIERS = [0.05, 0.08, 0.1, 0.15, 0.22, 0.3, 0.45, 0.65] as const;

const JACKPOT_ROLL_TABLE: Array<{ tier: JackpotTier; chance: number }> = [
  { tier: "grand", chance: 0.00008 },
  { tier: "major", chance: 0.00035 },
  { tier: "minor", chance: 0.0012 },
  { tier: "mini", chance: 0.0045 }
];

function roundCoins(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeOrbs(orbs: readonly OrbLanding[]): OrbLanding[] {
  const byPosition = new Map<number, OrbLanding>();

  for (const orb of orbs) {
    if (!Number.isInteger(orb.position) || orb.position < 0 || orb.position >= EMBER_LOCK_GRID_SIZE) {
      continue;
    }

    byPosition.set(orb.position, {
      position: orb.position,
      coinValue: Math.max(0, roundCoins(orb.coinValue)),
      jackpotTier: orb.jackpotTier
    });
  }

  return [...byPosition.values()].sort((left, right) => left.position - right.position);
}

export function isEmberLockTriggered(orbCount: number): boolean {
  return orbCount >= EMBER_LOCK_MIN_ORBS;
}

export function initializeEmberLock(initialOrbs: readonly OrbLanding[]): EmberLockState {
  const lockedOrbs = normalizeOrbs(initialOrbs);
  const triggered = isEmberLockTriggered(lockedOrbs.length);

  return {
    active: triggered,
    respinsRemaining: triggered ? EMBER_LOCK_RESPINS : 0,
    spinsPlayed: 0,
    lockedOrbs,
    completed: !triggered
  };
}

export function stepEmberLock(state: EmberLockState, landedOrbs: readonly OrbLanding[]): EmberLockState {
  if (!state.active) {
    return state;
  }

  const existingPositions = new Set(state.lockedOrbs.map((orb) => orb.position));
  const filteredNewOrbs = normalizeOrbs(landedOrbs).filter((orb) => !existingPositions.has(orb.position));
  const lockedOrbs = [...state.lockedOrbs, ...filteredNewOrbs].sort((left, right) => left.position - right.position);
  const gridFilled = lockedOrbs.length >= EMBER_LOCK_GRID_SIZE;
  const respinsRemaining = gridFilled
    ? state.respinsRemaining
    : filteredNewOrbs.length > 0
      ? EMBER_LOCK_RESPINS
      : Math.max(0, state.respinsRemaining - 1);
  const active = !gridFilled && respinsRemaining > 0;

  return {
    active,
    respinsRemaining,
    spinsPlayed: state.spinsPlayed + 1,
    lockedOrbs,
    completed: !active
  };
}

export function rollOrbLanding(rng: DeterministicRng, position: number, betPerSpin: number): OrbLanding {
  const jackpotRoll = rng.nextFloat();
  let cumulativeChance = 0;

  for (const entry of JACKPOT_ROLL_TABLE) {
    cumulativeChance += entry.chance;
    if (jackpotRoll < cumulativeChance) {
      return {
        position,
        coinValue: 0,
        jackpotTier: entry.tier
      };
    }
  }

  const multiplier = ORB_VALUE_MULTIPLIERS[rng.nextInt(ORB_VALUE_MULTIPLIERS.length)] as number;
  return {
    position,
    coinValue: Math.max(1, roundCoins(betPerSpin * multiplier))
  };
}

export function generateRespinLandings(
  rng: DeterministicRng,
  state: EmberLockState,
  betPerSpin: number,
  orbChance = 0.16
): OrbLanding[] {
  if (!state.active) {
    return [];
  }

  const occupied = new Set(state.lockedOrbs.map((orb) => orb.position));
  const landings: OrbLanding[] = [];

  for (let position = 0; position < EMBER_LOCK_GRID_SIZE; position += 1) {
    if (occupied.has(position)) {
      continue;
    }

    if (rng.chance(orbChance)) {
      landings.push(rollOrbLanding(rng, position, betPerSpin));
    }
  }

  return landings;
}

export function resolveEmberLockWin(
  state: EmberLockState,
  jackpotValues: Record<JackpotTier, number> = DEFAULT_JACKPOT_VALUES
): EmberLockResolution {
  const jackpotHits: Record<JackpotTier, number> = {
    mini: 0,
    minor: 0,
    major: 0,
    grand: 0
  };

  let orbValueWin = 0;
  let jackpotWin = 0;

  for (const orb of state.lockedOrbs) {
    orbValueWin += orb.coinValue;

    if (orb.jackpotTier) {
      jackpotHits[orb.jackpotTier] += 1;
      jackpotWin += jackpotValues[orb.jackpotTier];
    }
  }

  orbValueWin = roundCoins(orbValueWin);
  jackpotWin = roundCoins(jackpotWin);

  return {
    orbValueWin,
    jackpotWin,
    totalWin: roundCoins(orbValueWin + jackpotWin),
    jackpotHits
  };
}
