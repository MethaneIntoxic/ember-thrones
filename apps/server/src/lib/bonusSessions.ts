import type {
  BonusAdvanceActionType,
  BonusJackpotAward,
  BonusOutcome,
  BonusProgress,
  BonusSessionRecord,
  BonusSessionStatus,
  BonusType,
  EmberRespinProgress,
  JackpotTier,
  OrbLanding,
  RelicVaultBoardStateSlot,
  RelicVaultProgress,
  WheelAscensionProgress,
} from "@ember-thrones/shared";

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
  jackpotTiersHit: JackpotTier[];
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

function buildVaultBoardState(
  outcome: Extract<BonusOutcome, { type: "RELIC_VAULT_PICK" }>,
  revealedPicks: readonly Extract<RelicVaultProgress["revealedPicks"], readonly unknown[]>[number][]
): RelicVaultBoardStateSlot[] {
  const revealBySlotId = new Map(revealedPicks.map((pick) => [pick.slotId, pick]));

  return outcome.board.map((slot: Extract<BonusOutcome, { type: "RELIC_VAULT_PICK" }>["board"][number]) => {
    const revealedPick = revealBySlotId.get(slot.slotId);
    if (!revealedPick) {
      return {
        slotId: slot.slotId,
        revealed: false,
      };
    }

    return {
      slotId: slot.slotId,
      revealed: true,
      hidden: revealedPick.hidden,
      ...(revealedPick.value !== undefined ? { value: revealedPick.value } : {}),
    };
  });
}

export function createInitialBonusProgress(outcome: BonusOutcome): BonusProgress {
  if (outcome.type === "EMBER_RESPIN") {
    const completed = outcome.steps.length === 0;

    return {
      type: outcome.type,
      stepCursor: 0,
      totalSteps: outcome.steps.length,
      revealedOrbs: dedupeOrbLandings(outcome.startingOrbs),
      revealedSteps: [],
      currentCollectorMultiplier: 1,
      respinsRemaining: 3,
      completed,
      claimed: false,
      nextAction: completed ? "CLAIM" : "RESPIN",
    };
  }

  if (outcome.type === "WHEEL_ASCENSION") {
    const completed = outcome.outcomesBySpin.length === 0;

    return {
      type: outcome.type,
      spinCursor: 0,
      totalSpins: outcome.outcomesBySpin.length,
      revealedOutcomes: [],
      runningAward: 0,
      completed,
      claimed: false,
      nextAction: completed ? "CLAIM" : "WHEEL_STOP",
    };
  }

  const completed = outcome.pickResults.length === 0;

  return {
    type: outcome.type,
    pickCursor: 0,
    totalPicks: outcome.pickResults.length,
    boardState: buildVaultBoardState(outcome, []),
    revealedPicks: [],
    runningAward: 0,
    jackpotTierHits: [],
    completed,
    claimed: false,
    nextAction: completed ? "CLAIM" : "PICK",
  };
}

export function buildBonusSessionSeed(input: {
  id: string;
  spinId: string;
  sessionId: string;
  profileId: string;
  revealSeed: string;
  expectedTotalAward: number;
  jackpotTiersHit: JackpotTier[];
  jackpotAwards: BonusJackpotAward[];
  outcome: BonusOutcome;
}): BonusSessionSeed {
  const progress = createInitialBonusProgress(input.outcome);
  const completed = progress.completed;

  return {
    id: input.id,
    spinId: input.spinId,
    sessionId: input.sessionId,
    profileId: input.profileId,
    type: input.outcome.type,
    status: completed ? "COMPLETED" : "PENDING",
    revealSeed: input.revealSeed,
    expectedTotalAward: input.expectedTotalAward,
    actualAward: completed ? input.expectedTotalAward : 0,
    jackpotTiersHit: [...new Set(input.jackpotTiersHit)],
    jackpotAwards: input.jackpotAwards,
    outcome: input.outcome,
    progress,
  };
}

export function resumeBonusSession(session: BonusSessionRecord): BonusSessionStateMutation {
  if (session.status === "CLAIMED" || session.status === "EXPIRED") {
    throw new Error(`Bonus session cannot be resumed from status ${session.status}`);
  }

  const status = session.progress.completed
    ? "COMPLETED"
    : session.status === "PENDING"
      ? "ACTIVE"
      : session.status;

  return {
    progress: session.progress,
    status,
    actualAward: session.actualAward,
    resultPayload: {
      status,
      nextAction: session.progress.nextAction,
      completed: session.progress.completed,
      claimed: session.progress.claimed,
    },
  };
}

function advanceEmberRespin(session: BonusSessionRecord): BonusSessionStateMutation {
  const outcome = session.outcome;
  const progress = session.progress;

  if (outcome.type !== "EMBER_RESPIN" || progress.type !== "EMBER_RESPIN") {
    throw new Error("Bonus session is not an ember respin session");
  }

  const nextStep = outcome.steps[progress.stepCursor];
  if (!nextStep) {
    throw new Error("No respin step remains for this bonus session");
  }

  const nextCursor = progress.stepCursor + 1;
  const completed = nextCursor >= progress.totalSteps;
  const nextProgress: EmberRespinProgress = {
    ...progress,
    stepCursor: nextCursor,
    revealedOrbs: dedupeOrbLandings([...progress.revealedOrbs, ...nextStep.landedOrbs]),
    revealedSteps: [...progress.revealedSteps, nextStep],
    currentCollectorMultiplier: nextStep.collectorMultiplier,
    respinsRemaining: nextStep.respinsRemainingAfter,
    completed,
    nextAction: completed ? "CLAIM" : "RESPIN",
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
      currentCollectorMultiplier: nextProgress.currentCollectorMultiplier,
      respinsRemaining: nextProgress.respinsRemaining,
    },
  };
}

function advanceWheelAscension(session: BonusSessionRecord): BonusSessionStateMutation {
  const outcome = session.outcome;
  const progress = session.progress;

  if (outcome.type !== "WHEEL_ASCENSION" || progress.type !== "WHEEL_ASCENSION") {
    throw new Error("Bonus session is not a wheel ascension session");
  }

  const nextOutcome = outcome.outcomesBySpin[progress.spinCursor];
  if (!nextOutcome) {
    throw new Error("No wheel stop remains for this bonus session");
  }

  const nextCursor = progress.spinCursor + 1;
  const completed = nextCursor >= progress.totalSpins;
  const nextRunningAward = progress.runningAward + nextOutcome.resolvedAward;
  const nextProgress: WheelAscensionProgress = {
    ...progress,
    spinCursor: nextCursor,
    revealedOutcomes: [...progress.revealedOutcomes, nextOutcome],
    runningAward: nextRunningAward,
    completed,
    nextAction: completed ? "CLAIM" : "WHEEL_STOP",
  };

  return {
    progress: nextProgress,
    status: completed ? "COMPLETED" : "ACTIVE",
    actualAward: completed ? session.expectedTotalAward : nextRunningAward,
    resultPayload: {
      revealedOutcome: nextOutcome,
      spinCursor: nextCursor,
      totalSpins: progress.totalSpins,
      nextAction: nextProgress.nextAction,
      completed,
      runningAward: nextRunningAward,
    },
  };
}

function advanceRelicVault(session: BonusSessionRecord): BonusSessionStateMutation {
  const outcome = session.outcome;
  const progress = session.progress;

  if (outcome.type !== "RELIC_VAULT_PICK" || progress.type !== "RELIC_VAULT_PICK") {
    throw new Error("Bonus session is not a relic vault session");
  }

  const nextPick = outcome.pickResults[progress.pickCursor];
  if (!nextPick) {
    throw new Error("No pick remains for this bonus session");
  }

  const nextCursor = progress.pickCursor + 1;
  const nextRevealedPicks = [...progress.revealedPicks, nextPick];
  const nextJackpotTierHits = nextPick.jackpotTierGranted
    ? [...new Set([...progress.jackpotTierHits, nextPick.jackpotTierGranted])]
    : progress.jackpotTierHits;
  const completed = nextCursor >= progress.totalPicks;
  const nextProgress: RelicVaultProgress = {
    ...progress,
    pickCursor: nextCursor,
    boardState: buildVaultBoardState(outcome, nextRevealedPicks),
    revealedPicks: nextRevealedPicks,
    runningAward: nextPick.runningAward,
    jackpotTierHits: nextJackpotTierHits,
    completed,
    nextAction: completed ? "CLAIM" : "PICK",
  };

  return {
    progress: nextProgress,
    status: completed ? "COMPLETED" : "ACTIVE",
    actualAward: completed ? session.expectedTotalAward : nextPick.runningAward,
    resultPayload: {
      revealedPick: nextPick,
      pickCursor: nextCursor,
      totalPicks: progress.totalPicks,
      nextAction: nextProgress.nextAction,
      completed,
      runningAward: nextProgress.runningAward,
      jackpotTierHits: nextProgress.jackpotTierHits,
    },
  };
}

export function advanceBonusSession(
  session: BonusSessionRecord,
  actionType: BonusAdvanceActionType
): BonusSessionStateMutation {
  if (session.status === "CLAIMED" || session.status === "EXPIRED") {
    throw new Error(`Bonus session cannot advance from status ${session.status}`);
  }

  if (session.progress.nextAction === null || session.progress.nextAction === "CLAIM") {
    throw new Error("Bonus session is already complete and ready to claim");
  }

  if (session.progress.nextAction !== actionType) {
    throw new Error(`Expected ${session.progress.nextAction} but received ${actionType}`);
  }

  if (actionType === "RESPIN") {
    return advanceEmberRespin(session);
  }

  if (actionType === "WHEEL_STOP") {
    return advanceWheelAscension(session);
  }

  return advanceRelicVault(session);
}

function markClaimedProgress(progress: BonusProgress): BonusProgress {
  if (progress.type === "EMBER_RESPIN") {
    return {
      ...progress,
      claimed: true,
      completed: true,
      nextAction: null,
    };
  }

  if (progress.type === "WHEEL_ASCENSION") {
    return {
      ...progress,
      claimed: true,
      completed: true,
      nextAction: null,
    };
  }

  return {
    ...progress,
    claimed: true,
    completed: true,
    nextAction: null,
  };
}

export function claimBonusSession(session: BonusSessionRecord): BonusSessionStateMutation {
  if (session.status === "CLAIMED") {
    throw new Error("Bonus session has already been claimed");
  }

  if (session.status === "EXPIRED") {
    throw new Error("Expired bonus sessions cannot be claimed");
  }

  if (!session.progress.completed) {
    throw new Error("Bonus session must be completed before it can be claimed");
  }

  const progress = markClaimedProgress(session.progress);
  const creditedAmount = session.actualAward > 0 ? session.actualAward : session.expectedTotalAward;

  return {
    progress,
    status: "CLAIMED",
    actualAward: creditedAmount,
    resultPayload: {
      creditedAmount,
      jackpotAwards: session.jackpotAwards,
      claimed: true,
    },
  };
}
