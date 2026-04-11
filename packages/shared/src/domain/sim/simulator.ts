import {
  applyFreeQuestRetrigger,
  applyStanceWinModifier,
  consumeFreeQuestSpin,
  createFreeQuestState,
  isFreeQuestTriggered,
  rollFreeQuestRetrigger,
  type FreeQuestStance
} from "../features/freeQuest";
import {
  generateRespinLandings,
  initializeEmberLock,
  isEmberLockTriggered,
  resolveEmberLockWin,
  rollOrbLanding,
  stepEmberLock,
  type JackpotTier
} from "../features/emberLock";
import { evaluatePaylines } from "../payout";
import { countSymbol, generateSpin, listSymbolPositions } from "../reels";
import { createSeededRng } from "../rng";
import { simulationReportSchema, type SimulationReport } from "./reportSchema";

export interface SpinSimulationConfig {
  spins: number;
  betPerSpin: number;
  seed: number | string;
  freeQuestStance?: FreeQuestStance;
  volatility?: "medium";
}

export const CADENCE_TARGETS = {
  emberLockEverySpins: { min: 50, max: 60 },
  freeQuestEverySpins: { min: 80, max: 140 },
  retriggerChanceInFeature: { min: 0.15, max: 0.25 }
} as const;

function roundValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function safeFrequency(count: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return roundValue(count / total);
}

function observedEverySpins(totalSpins: number, triggerCount: number): number | null {
  if (triggerCount <= 0) {
    return null;
  }

  return roundValue(totalSpins / triggerCount);
}

function runEmberLockFeature(
  initialOrbPositions: number[],
  betPerSpin: number,
  rngSeed: ReturnType<typeof createSeededRng>
): {
  totalWin: number;
  jackpotHits: Record<JackpotTier, number>;
} {
  const initialOrbs = initialOrbPositions.map((position) => rollOrbLanding(rngSeed, position, betPerSpin));
  let state = initializeEmberLock(initialOrbs);

  while (state.active) {
    const newOrbs = generateRespinLandings(rngSeed, state, betPerSpin, 0.16);
    state = stepEmberLock(state, newOrbs);
  }

  const resolution = resolveEmberLockWin(state);
  return {
    totalWin: resolution.totalWin,
    jackpotHits: resolution.jackpotHits
  };
}

function runFreeQuestFeature(
  betPerSpin: number,
  stance: FreeQuestStance,
  rngSeed: ReturnType<typeof createSeededRng>
): {
  totalWin: number;
  retriggerCount: number;
  featureSpins: number;
  retriggerRolls: number;
} {
  let state = createFreeQuestState(stance);
  let totalWin = 0;
  let featureSpins = 0;
  let retriggerRolls = 0;

  while (state.active) {
    featureSpins += 1;

    const freeSpin = generateSpin(rngSeed);
    const payout = evaluatePaylines(freeSpin, betPerSpin);
    totalWin += applyStanceWinModifier(payout.totalWin, state, rngSeed);

    const scatterCount = countSymbol(freeSpin, "scatter");
    const retrigger = rollFreeQuestRetrigger(rngSeed, state, scatterCount);
    retriggerRolls += 1;

    if (retrigger.triggered) {
      state = applyFreeQuestRetrigger(state, retrigger.awardedSpins);
    }

    state = consumeFreeQuestSpin(state);
  }

  return {
    totalWin: roundValue(totalWin),
    retriggerCount: state.retriggerCount,
    featureSpins,
    retriggerRolls
  };
}

export function runSpinSimulation(config: SpinSimulationConfig): SimulationReport {
  const spins = Math.max(1, Math.trunc(config.spins));
  const betPerSpin = config.betPerSpin;

  if (betPerSpin <= 0) {
    throw new Error("betPerSpin must be positive");
  }

  const freeQuestStance: FreeQuestStance = config.freeQuestStance ?? "relic";
  const rng = createSeededRng(config.seed);

  let totalBet = 0;
  let baseWin = 0;
  let featureWin = 0;
  let spinsWithWin = 0;
  let emberLockTriggers = 0;
  let freeQuestTriggers = 0;
  let freeQuestRetriggers = 0;
  let totalFreeQuestSpins = 0;
  let retriggerRolls = 0;

  const jackpots: Record<JackpotTier, number> = {
    ember: 0,
    relic: 0,
    mythic: 0,
    throne: 0
  };

  for (let spinIndex = 0; spinIndex < spins; spinIndex += 1) {
    totalBet += betPerSpin;

    const spin = generateSpin(rng);
    const basePayout = evaluatePaylines(spin, betPerSpin);

    let spinFeatureWin = 0;

    const orbCount = countSymbol(spin, "orb");
    if (isEmberLockTriggered(orbCount)) {
      emberLockTriggers += 1;

      const orbPositions = listSymbolPositions(spin, "orb");
      const emberFeature = runEmberLockFeature(orbPositions, betPerSpin, rng);
      spinFeatureWin += emberFeature.totalWin;

      jackpots.ember += emberFeature.jackpotHits.ember;
      jackpots.relic += emberFeature.jackpotHits.relic;
      jackpots.mythic += emberFeature.jackpotHits.mythic;
      jackpots.throne += emberFeature.jackpotHits.throne;
    }

    const scatterCount = basePayout.scatterCount;
    if (isFreeQuestTriggered(scatterCount)) {
      freeQuestTriggers += 1;

      const freeQuestFeature = runFreeQuestFeature(betPerSpin, freeQuestStance, rng);
      spinFeatureWin += freeQuestFeature.totalWin;
      freeQuestRetriggers += freeQuestFeature.retriggerCount;
      totalFreeQuestSpins += freeQuestFeature.featureSpins;
      retriggerRolls += freeQuestFeature.retriggerRolls;
    }

    baseWin += basePayout.totalWin;
    featureWin += spinFeatureWin;

    if (basePayout.totalWin + spinFeatureWin > 0) {
      spinsWithWin += 1;
    }
  }

  const totalWin = roundValue(baseWin + featureWin);
  const rtp = roundValue(totalWin / totalBet);

  const emberEverySpins = observedEverySpins(spins, emberLockTriggers);
  const freeEverySpins = observedEverySpins(spins, freeQuestTriggers);
  const retriggerChanceInFeature =
    retriggerRolls > 0 ? roundValue(freeQuestRetriggers / retriggerRolls) : null;

  const report: SimulationReport = {
    config: {
      spins,
      betPerSpin: roundValue(betPerSpin),
      seed: config.seed,
      volatility: "medium",
      freeQuestStance
    },
    totals: {
      totalBet: roundValue(totalBet),
      baseWin: roundValue(baseWin),
      featureWin: roundValue(featureWin),
      totalWin,
      rtp
    },
    counters: {
      spinsWithWin,
      emberLockTriggers,
      freeQuestTriggers,
      freeQuestRetriggers,
      jackpots
    },
    frequencies: {
      anyWin: safeFrequency(spinsWithWin, spins),
      emberLockTrigger: safeFrequency(emberLockTriggers, spins),
      freeQuestTrigger: safeFrequency(freeQuestTriggers, spins),
      freeQuestRetrigger: safeFrequency(freeQuestRetriggers, spins),
      freeQuestRetriggerInFeature:
        retriggerChanceInFeature === null ? 0 : retriggerChanceInFeature
    },
    cadence: {
      emberLockEverySpins: {
        observed: emberEverySpins,
        targetMin: CADENCE_TARGETS.emberLockEverySpins.min,
        targetMax: CADENCE_TARGETS.emberLockEverySpins.max,
        inRange:
          emberEverySpins !== null &&
          emberEverySpins >= CADENCE_TARGETS.emberLockEverySpins.min &&
          emberEverySpins <= CADENCE_TARGETS.emberLockEverySpins.max
      },
      freeQuestEverySpins: {
        observed: freeEverySpins,
        targetMin: CADENCE_TARGETS.freeQuestEverySpins.min,
        targetMax: CADENCE_TARGETS.freeQuestEverySpins.max,
        inRange:
          freeEverySpins !== null &&
          freeEverySpins >= CADENCE_TARGETS.freeQuestEverySpins.min &&
          freeEverySpins <= CADENCE_TARGETS.freeQuestEverySpins.max
      },
      retriggerChanceInFeature: {
        observed: retriggerChanceInFeature,
        targetMin: CADENCE_TARGETS.retriggerChanceInFeature.min,
        targetMax: CADENCE_TARGETS.retriggerChanceInFeature.max,
        inRange:
          retriggerChanceInFeature !== null &&
          retriggerChanceInFeature >= CADENCE_TARGETS.retriggerChanceInFeature.min &&
          retriggerChanceInFeature <= CADENCE_TARGETS.retriggerChanceInFeature.max
      }
    },
    averages: {
      winPerSpin: roundValue(totalWin / spins),
      winPerHit: spinsWithWin > 0 ? roundValue(totalWin / spinsWithWin) : 0
    }
  };

  return simulationReportSchema.parse(report);
}
