import {
  collectBonusSessionJackpotTiers,
  type BonusAdvanceActionType,
  type BonusJackpotAward,
  type BonusOutcome,
  type BonusProgress,
  type BonusSessionRecord,
  type BonusSessionStatus,
  type BonusType,
  type FreeGamesProgress,
  type HoldAndSpinProgress,
  type OrbLanding
} from "../../contracts/api";

export interface BonusSessionSeed {
  id: string;
  spinId: string;
  sessionId: string;
  profileId: string;
  type: BonusType;
  status: BonusSessionStatus;
  revealSeed: string;
  expectedTotalAward: number;
  actualAward: number;
  jackpotTiersHit: ReturnType<typeof collectBonusSessionJackpotTiers>;
  jackpotAwards: BonusJackpotAward[];
  outcome: BonusOutcome;
  progress: BonusProgress;
}

export interface BonusSessionStateMutation {
  progress: BonusProgress;
  status: BonusSessionStatus;
  actualAward: number;
  resultPayload: Record<string, unknown>;
}

function dedupeOrbLandings(landings: readonly OrbLanding[]): OrbLanding[] {
  const byPosition = new Map<number, OrbLanding>();

  for (const landing of landings) {
    byPosition.set(landing.position, landing);
  }

  return [...byPosition.values()].sort((left, right) => left.position - right.position);
}

function assertBonusSessionAlignment(session: Pick<BonusSessionRecord, "type" | "outcome" | "progress">): void {
  if (session.type !== session.outcome.type) {
    throw new Error(`Bonus session type ${session.type} does not match outcome type ${session.outcome.type}`);
  }

  if (session.type !== session.progress.type) {
    throw new Error(`Bonus session type ${session.type} does not match progress type ${session.progress.type}`);
  }
}

export function createInitialBonusProgress(outcome: BonusOutcome): BonusProgress {
  if (outcome.type === "HOLD_AND_SPIN") {
    const completed = outcome.steps.length === 0;

    return {
      type: outcome.type,
      stepCursor: 0,
      totalSteps: outcome.steps.length,
      revealedOrbs: dedupeOrbLandings(outcome.startingOrbs),
      revealedSteps: [],
      respinsRemaining: Math.min(3, Math.max(0, outcome.respinsRemaining || 3)),
      completed,
      claimed: false,
      nextAction: completed ? "CLAIM" : "RESPIN"
    };
  }

  const completed = outcome.steps.length === 0;
  return {
    type: outcome.type,
    spinCursor: 0,
    totalSpins: outcome.steps.length,
    revealedSpins: [],
    runningAward: 0,
    retriggerCount: 0,
    gamesRemaining: outcome.initialGames,
    completed,
    claimed: false,
    nextAction: completed ? "CLAIM" : "FREE_GAME_SPIN"
  };
}

export function buildBonusSessionSeed(input: {
  id: string;
  spinId: string;
  sessionId: string;
  profileId: string;
  revealSeed: string;
  expectedTotalAward: number;
  jackpotAwards: BonusJackpotAward[];
  outcome: BonusOutcome;
}): BonusSessionSeed {
  return {
    id: input.id,
    spinId: input.spinId,
    sessionId: input.sessionId,
    profileId: input.profileId,
    type: input.outcome.type,
    status: "PENDING",
    revealSeed: input.revealSeed,
    expectedTotalAward: input.expectedTotalAward,
    actualAward: 0,
    jackpotTiersHit: collectBonusSessionJackpotTiers(input.outcome),
    jackpotAwards: input.jackpotAwards,
    outcome: input.outcome,
    progress: createInitialBonusProgress(input.outcome)
  };
}

export function resumeBonusSession(session: BonusSessionRecord): BonusSessionStateMutation {
  assertBonusSessionAlignment(session);

  if (session.status === "CLAIMED" || session.status === "EXPIRED") {
    throw new Error(`Bonus session cannot be resumed from status ${session.status}`);
  }

  const status = session.status === "PENDING" ? "ACTIVE" : session.status;
  return {
    progress: session.progress,
    status,
    actualAward: session.actualAward,
    resultPayload: {
      status,
      nextAction: session.progress.nextAction,
      completed: session.progress.completed,
      claimed: session.progress.claimed
    }
  };
}

function advanceHoldAndSpin(session: BonusSessionRecord): BonusSessionStateMutation {
  const outcome = session.outcome;
  const progress = session.progress;

  if (outcome.type !== "HOLD_AND_SPIN" || progress.type !== "HOLD_AND_SPIN") {
    throw new Error("Bonus session is not a hold-and-spin session");
  }

  const nextStep = outcome.steps[progress.stepCursor];
  if (!nextStep) {
    throw new Error("No respin step remains for this bonus session");
  }

  const nextCursor = progress.stepCursor + 1;
  const completed = nextCursor >= progress.totalSteps;
  const nextProgress: HoldAndSpinProgress = {
    ...progress,
    stepCursor: nextCursor,
    revealedOrbs: dedupeOrbLandings([...progress.revealedOrbs, ...nextStep.landedOrbs]),
    revealedSteps: [...progress.revealedSteps, nextStep],
    respinsRemaining: nextStep.respinsRemainingAfter,
    completed,
    nextAction: completed ? "CLAIM" : "RESPIN"
  };

  return {
    progress: nextProgress,
    status: completed ? "COMPLETED" : "ACTIVE",
    actualAward: completed ? session.expectedTotalAward : session.actualAward,
    resultPayload: {
      revealedStep: nextStep,
      stepCursor: nextCursor,
      totalSteps: progress.totalSteps,
      nextAction: nextProgress.nextAction,
      completed,
      respinsRemaining: nextProgress.respinsRemaining
    }
  };
}

function advanceFreeGames(session: BonusSessionRecord): BonusSessionStateMutation {
  const outcome = session.outcome;
  const progress = session.progress;

  if (outcome.type !== "FREE_GAMES" || progress.type !== "FREE_GAMES") {
    throw new Error("Bonus session is not a free-games session");
  }

  const nextSpin = outcome.steps[progress.spinCursor];
  if (!nextSpin) {
    throw new Error("No free game remains for this bonus session");
  }

  const nextCursor = progress.spinCursor + 1;
  const completed = nextCursor >= progress.totalSpins;
  const nextProgress: FreeGamesProgress = {
    ...progress,
    spinCursor: nextCursor,
    revealedSpins: [...progress.revealedSpins, nextSpin],
    runningAward: nextSpin.runningAward,
    retriggerCount: progress.retriggerCount + (nextSpin.retriggered ? 1 : 0),
    gamesRemaining: nextSpin.gamesRemainingAfter,
    completed,
    nextAction: completed ? "CLAIM" : "FREE_GAME_SPIN"
  };

  return {
    progress: nextProgress,
    status: completed ? "COMPLETED" : "ACTIVE",
    actualAward: completed ? session.expectedTotalAward : session.actualAward,
    resultPayload: {
      revealedSpin: nextSpin,
      spinCursor: nextCursor,
      totalSpins: progress.totalSpins,
      nextAction: nextProgress.nextAction,
      completed,
      runningAward: nextProgress.runningAward,
      gamesRemaining: nextProgress.gamesRemaining
    }
  };
}

export function advanceBonusSession(
  session: BonusSessionRecord,
  actionType: BonusAdvanceActionType
): BonusSessionStateMutation {
  assertBonusSessionAlignment(session);

  if (session.status === "CLAIMED" || session.status === "EXPIRED") {
    throw new Error(`Bonus session cannot advance from status ${session.status}`);
  }

  if (session.progress.nextAction === null || session.progress.nextAction === "CLAIM") {
    throw new Error("Bonus session is already complete and ready to claim");
  }

  if (session.progress.nextAction !== actionType) {
    throw new Error(`Expected ${session.progress.nextAction} but received ${actionType}`);
  }

  return actionType === "RESPIN" ? advanceHoldAndSpin(session) : advanceFreeGames(session);
}

export function claimBonusSession(session: BonusSessionRecord): BonusSessionStateMutation {
  assertBonusSessionAlignment(session);

  if (session.status === "CLAIMED") {
    throw new Error("Bonus session has already been claimed");
  }

  if (session.status === "EXPIRED") {
    throw new Error("Expired bonus sessions cannot be claimed");
  }

  if (!session.progress.completed) {
    throw new Error("Bonus session must be completed before it can be claimed");
  }

  const progress: BonusProgress = {
    ...session.progress,
    claimed: true,
    completed: true,
    nextAction: null
  };

  return {
    progress,
    status: "CLAIMED",
    actualAward: session.expectedTotalAward,
    resultPayload: {
      creditedAmount: session.expectedTotalAward,
      jackpotAwards: session.jackpotAwards,
      claimed: true
    }
  };
}
