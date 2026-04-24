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
  freeGamesModifierId?: FreeQuestStance;
  volatility?: "medium";
}

export const CADENCE_TARGETS = {
  holdAndSpinEverySpins: { min: 40, max: 90 },
  freeGamesEverySpins: { min: 70, max: 180 },
  retriggerChanceInFeature: { min: 0.1, max: 0.3 }
} as const;

function roundValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function safeFrequency(count: number, total: number): number {
  return total <= 0 ? 0 : roundValue(count / total);
}

function observedEverySpins(totalSpins: number, triggerCount: number): number | null {
  return triggerCount <= 0 ? null : roundValue(totalSpins / triggerCount);
}

function runHoldAndSpinFeature(
  initialOrbPositions: number[],
  betPerSpin: number,
  rngSeed: ReturnType<typeof createSeededRng>
): { totalWin: number; jackpotHits: Record<JackpotTier, number> } {
  const initialOrbs = initialOrbPositions.map((position) => rollOrbLanding(rngSeed, position, betPerSpin));
  let state = initializeEmberLock(initialOrbs);

  while (state.active) {
    state = stepEmberLock(state, generateRespinLandings(rngSeed, state, betPerSpin, 0.16));
  }

  const resolution = resolveEmberLockWin(state);
  return {
    totalWin: resolution.totalWin,
    jackpotHits: resolution.jackpotHits
  };
}

function runFreeGamesFeature(
  betPerSpin: number,
  modifierId: FreeQuestStance,
  rngSeed: ReturnType<typeof createSeededRng>
): {
  totalWin: number;
  retriggerCount: number;
  featureSpins: number;
  retriggerRolls: number;
} {
  let state = createFreeQuestState(modifierId);
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

  const freeGamesModifierId: FreeQuestStance = config.freeGamesModifierId ?? "ROYALS_REMOVED";
  const rng = createSeededRng(config.seed);

  let totalBet = 0;
  let baseWin = 0;
  let featureWin = 0;
  let spinsWithWin = 0;
  let holdAndSpinTriggers = 0;
  let freeGamesTriggers = 0;
  let freeGamesRetriggers = 0;
  let retriggerRolls = 0;

  const jackpots: Record<JackpotTier, number> = {
    mini: 0,
    minor: 0,
    major: 0,
    grand: 0
  };

  for (let spinIndex = 0; spinIndex < spins; spinIndex += 1) {
    totalBet += betPerSpin;

    const spin = generateSpin(rng);
    const basePayout = evaluatePaylines(spin, betPerSpin);
    let spinFeatureWin = 0;

    if (isEmberLockTriggered(countSymbol(spin, "orb"))) {
      holdAndSpinTriggers += 1;

      const holdAndSpinFeature = runHoldAndSpinFeature(listSymbolPositions(spin, "orb"), betPerSpin, rng);
      spinFeatureWin += holdAndSpinFeature.totalWin;
      jackpots.mini += holdAndSpinFeature.jackpotHits.mini;
      jackpots.minor += holdAndSpinFeature.jackpotHits.minor;
      jackpots.major += holdAndSpinFeature.jackpotHits.major;
      jackpots.grand += holdAndSpinFeature.jackpotHits.grand;
    }

    if (isFreeQuestTriggered(basePayout.scatterCount)) {
      freeGamesTriggers += 1;

      const freeGamesFeature = runFreeGamesFeature(betPerSpin, freeGamesModifierId, rng);
      spinFeatureWin += freeGamesFeature.totalWin;
      freeGamesRetriggers += freeGamesFeature.retriggerCount;
      retriggerRolls += freeGamesFeature.retriggerRolls;
    }

    baseWin += basePayout.totalWin;
    featureWin += spinFeatureWin;

    if (basePayout.totalWin + spinFeatureWin > 0) {
      spinsWithWin += 1;
    }
  }

  const totalWin = roundValue(baseWin + featureWin);
  const rtp = roundValue(totalWin / totalBet);
  const holdAndSpinEverySpins = observedEverySpins(spins, holdAndSpinTriggers);
  const freeGamesEverySpins = observedEverySpins(spins, freeGamesTriggers);
  const retriggerChanceInFeature =
    retriggerRolls > 0 ? roundValue(freeGamesRetriggers / retriggerRolls) : null;

  return simulationReportSchema.parse({
    config: {
      spins,
      betPerSpin: roundValue(betPerSpin),
      seed: config.seed,
      volatility: "medium",
      freeGamesModifierId
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
      holdAndSpinTriggers,
      freeGamesTriggers,
      freeGamesRetriggers,
      jackpots
    },
    frequencies: {
      anyWin: safeFrequency(spinsWithWin, spins),
      holdAndSpinTrigger: safeFrequency(holdAndSpinTriggers, spins),
      freeGamesTrigger: safeFrequency(freeGamesTriggers, spins),
      freeGamesRetrigger: safeFrequency(freeGamesRetriggers, spins),
      freeGamesRetriggerInFeature: retriggerChanceInFeature === null ? 0 : retriggerChanceInFeature
    },
    cadence: {
      holdAndSpinEverySpins: {
        observed: holdAndSpinEverySpins,
        targetMin: CADENCE_TARGETS.holdAndSpinEverySpins.min,
        targetMax: CADENCE_TARGETS.holdAndSpinEverySpins.max,
        inRange:
          holdAndSpinEverySpins !== null &&
          holdAndSpinEverySpins >= CADENCE_TARGETS.holdAndSpinEverySpins.min &&
          holdAndSpinEverySpins <= CADENCE_TARGETS.holdAndSpinEverySpins.max
      },
      freeGamesEverySpins: {
        observed: freeGamesEverySpins,
        targetMin: CADENCE_TARGETS.freeGamesEverySpins.min,
        targetMax: CADENCE_TARGETS.freeGamesEverySpins.max,
        inRange:
          freeGamesEverySpins !== null &&
          freeGamesEverySpins >= CADENCE_TARGETS.freeGamesEverySpins.min &&
          freeGamesEverySpins <= CADENCE_TARGETS.freeGamesEverySpins.max
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
  });
}
