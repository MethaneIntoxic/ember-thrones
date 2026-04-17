import type { BonusJackpotAward, BonusSessionStatus, JackpotTier, OrbLanding } from "@ember-thrones/shared";
import type {
  BonusActionRecord,
  BonusSessionRecord,
  WalletState,
} from "./db.js";
import type {
  BonusFeatureShell,
  FreeSpinsProgress,
  FreeSpinsStickyWildState,
  ServerBonusActionType,
  ServerBonusAdvanceActionType,
  ServerBonusOutcome,
  ServerBonusProgress,
} from "./slotRuntime.js";

export interface BonusSessionSeed {
  id: string;
  spinId: string;
  sessionId: string;
  profileId: string;
  type: BonusSessionRecord["type"];
  status: BonusSessionStatus;
  revealSeed: string;
  expectedTotalAward: number;
  actualAward: number;
  jackpotTiersHit: JackpotTier[];
  jackpotAwards: BonusJackpotAward[];
  outcome: ServerBonusOutcome;
  progress: ServerBonusProgress;
  mathProfileVersionId: string;
  entrySnapshot: BonusFeatureShell;
}

export interface BonusSessionStateMutation {
  progress: ServerBonusProgress;
  status: BonusSessionStatus;
  actualAward: number;
  resultPayload: Record<string, unknown>;
}

export interface BonusSessionApiSnapshot {
  session: {
    id: string;
    sessionId: string;
    profileId: string;
    type: BonusSessionRecord["type"];
    status: BonusSessionStatus;
    expectedTotalAward: number;
    actualAward: number;
    progress: ServerBonusProgress;
    entrySnapshot: BonusFeatureShell;
    revealedJackpotAwards: BonusJackpotAward[];
    mathProfileVersionId: string;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    claimedAt: string | null;
  };
  actions: Array<{
    actionType: ServerBonusActionType;
    ordinal: number;
    requestPayload: Record<string, unknown>;
    resultPayload: Record<string, unknown>;
  }>;
  action?: {
    actionType: ServerBonusActionType;
    ordinal: number;
  };
  wallet?: WalletState;
}

function dedupeOrbLandings(landings: readonly OrbLanding[]): OrbLanding[] {
  const byPosition = new Map<number, OrbLanding>();

  for (const landing of landings) {
    byPosition.set(landing.position, landing);
  }

  return [...byPosition.values()].sort((left, right) => left.position - right.position);
}

function cloneStickyWildState(state: readonly FreeSpinsStickyWildState[]): FreeSpinsStickyWildState[] {
  return state.map((entry) => ({ ...entry, rows: [...entry.rows] }));
}

function buildVaultBoardState(
  outcome: Extract<ServerBonusOutcome, { type: "RELIC_VAULT_PICK" }>,
  revealedPicks: readonly Extract<Extract<ServerBonusProgress, { type: "RELIC_VAULT_PICK" }>["revealedPicks"], readonly unknown[]>[number][],
) {
  const revealBySlotId = new Map(revealedPicks.map((pick) => [pick.slotId, pick]));

  return outcome.board.map((slot: (typeof outcome.board)[number]) => {
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

export function createInitialBonusProgress(outcome: ServerBonusOutcome): ServerBonusProgress {
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

  if (outcome.type === "FREE_SPINS") {
    const completed = outcome.steps.length === 0;

    return {
      type: outcome.type,
      spinCursor: 0,
      totalSpins: outcome.steps.length,
      revealedSpins: [],
      runningAward: 0,
      retriggerCount: 0,
      spinsRemaining: outcome.initialSpins,
      multiplierLadder: [...outcome.multiplierLadder],
      completed,
      claimed: false,
      nextAction: completed ? "CLAIM" : "FREE_SPIN",
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
  outcome: ServerBonusOutcome;
  mathProfileVersionId: string;
  entrySnapshot: BonusFeatureShell;
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
    mathProfileVersionId: input.mathProfileVersionId,
    entrySnapshot: input.entrySnapshot,
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
      featureShell: session.entrySnapshot,
    },
  };
}

function advanceEmberRespin(session: BonusSessionRecord): BonusSessionStateMutation {
  const outcome = session.outcome;
  const progress = session.progress;

  if (outcome.type !== "EMBER_RESPIN" || progress.type !== "EMBER_RESPIN") {
    throw new Error("Bonus session is not a hold-and-spin session");
  }

  const nextStep = outcome.steps[progress.stepCursor];
  if (!nextStep) {
    throw new Error("No hold-and-spin respin remains for this session");
  }

  const nextCursor = progress.stepCursor + 1;
  const completed = nextCursor >= progress.totalSteps;
  const nextProgress = {
    ...progress,
    stepCursor: nextCursor,
    revealedOrbs: dedupeOrbLandings([...progress.revealedOrbs, ...nextStep.landedOrbs]),
    revealedSteps: [...progress.revealedSteps, nextStep],
    currentCollectorMultiplier: nextStep.collectorMultiplier,
    respinsRemaining: nextStep.respinsRemainingAfter,
    completed,
    nextAction: completed ? "CLAIM" : "RESPIN",
  } satisfies Extract<ServerBonusProgress, { type: "EMBER_RESPIN" }>;

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
    throw new Error("Bonus session is not a wheel session");
  }

  const nextOutcome = outcome.outcomesBySpin[progress.spinCursor];
  if (!nextOutcome) {
    throw new Error("No wheel stop remains for this bonus session");
  }

  const nextCursor = progress.spinCursor + 1;
  const completed = nextCursor >= progress.totalSpins;
  const nextRunningAward = progress.runningAward + nextOutcome.resolvedAward;
  const nextProgress = {
    ...progress,
    spinCursor: nextCursor,
    revealedOutcomes: [...progress.revealedOutcomes, nextOutcome],
    runningAward: nextRunningAward,
    completed,
    nextAction: completed ? "CLAIM" : "WHEEL_STOP",
  } satisfies Extract<ServerBonusProgress, { type: "WHEEL_ASCENSION" }>;

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

function advanceFreeSpins(session: BonusSessionRecord): BonusSessionStateMutation {
  const outcome = session.outcome;
  const progress = session.progress;

  if (outcome.type !== "FREE_SPINS" || progress.type !== "FREE_SPINS") {
    throw new Error("Bonus session is not a free-spins session");
  }

  const nextSpin = outcome.steps[progress.spinCursor];
  if (!nextSpin) {
    throw new Error("No free spin remains for this bonus session");
  }

  const nextCursor = progress.spinCursor + 1;
  const completed = nextCursor >= progress.totalSpins;
  const nextProgress: FreeSpinsProgress = {
    ...progress,
    spinCursor: nextCursor,
    revealedSpins: [...progress.revealedSpins, nextSpin],
    runningAward: nextSpin.runningAward,
    retriggerCount: progress.retriggerCount + (nextSpin.retriggered ? 1 : 0),
    spinsRemaining: nextSpin.spinsRemainingAfter,
    multiplierLadder: [...progress.multiplierLadder],
    completed,
    nextAction: completed ? "CLAIM" : "FREE_SPIN",
  };

  return {
    progress: nextProgress,
    status: completed ? "COMPLETED" : "ACTIVE",
    actualAward: completed ? session.expectedTotalAward : nextSpin.runningAward,
    resultPayload: {
      revealedSpin: {
        ...nextSpin,
        stickyWildState: cloneStickyWildState(nextSpin.stickyWildState),
      },
      spinCursor: nextCursor,
      totalSpins: progress.totalSpins,
      nextAction: nextProgress.nextAction,
      completed,
      runningAward: nextProgress.runningAward,
      spinsRemaining: nextProgress.spinsRemaining,
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
  const nextProgress = {
    ...progress,
    pickCursor: nextCursor,
    boardState: buildVaultBoardState(outcome, nextRevealedPicks),
    revealedPicks: nextRevealedPicks,
    runningAward: nextPick.runningAward,
    jackpotTierHits: nextJackpotTierHits,
    completed,
    nextAction: completed ? "CLAIM" : "PICK",
  } satisfies Extract<ServerBonusProgress, { type: "RELIC_VAULT_PICK" }>;

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
  actionType: ServerBonusAdvanceActionType,
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

  if (actionType === "FREE_SPIN") {
    return advanceFreeSpins(session);
  }

  return advanceRelicVault(session);
}

function markClaimedProgress(progress: ServerBonusProgress): ServerBonusProgress {
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
      revealedJackpotAwards: session.jackpotAwards,
      claimed: true,
    },
  };
}

function dedupeAwardsByTier(awards: readonly BonusJackpotAward[]): BonusJackpotAward[] {
  const byTier = new Map<JackpotTier, BonusJackpotAward>();

  for (const award of awards) {
    byTier.set(award.tier, { ...award });
  }

  return [...byTier.values()];
}

function collectRevealedJackpotTiers(session: BonusSessionRecord): JackpotTier[] {
  if (session.progress.completed || session.status === "CLAIMED") {
    return session.jackpotAwards.map((award) => award.tier);
  }

  if (session.progress.type === "EMBER_RESPIN") {
    return session.progress.revealedOrbs.flatMap((orb: (typeof session.progress.revealedOrbs)[number]) =>
      orb.jackpotTier ? [orb.jackpotTier] : [],
    );
  }

  if (session.progress.type === "WHEEL_ASCENSION") {
    return session.progress.revealedOutcomes.flatMap((outcome: (typeof session.progress.revealedOutcomes)[number]) =>
      outcome.jackpotTier ? [outcome.jackpotTier] : [],
    );
  }

  if (session.progress.type === "RELIC_VAULT_PICK") {
    return [...session.progress.jackpotTierHits];
  }

  return [];
}

export function getRevealedJackpotAwards(session: BonusSessionRecord): BonusJackpotAward[] {
  const revealedTiers = new Set<JackpotTier>(collectRevealedJackpotTiers(session));
  return dedupeAwardsByTier(session.jackpotAwards.filter((award) => revealedTiers.has(award.tier)));
}

export function serializeBonusSessionSnapshot(input: {
  session: BonusSessionRecord;
  actions: BonusActionRecord[];
  action?: BonusActionRecord;
  wallet?: WalletState | null;
}): BonusSessionApiSnapshot {
  const { session, actions, action, wallet } = input;

  return {
    session: {
      id: session.id,
      sessionId: session.sessionId,
      profileId: session.profileId,
      type: session.type,
      status: session.status,
      expectedTotalAward: session.expectedTotalAward,
      actualAward: session.actualAward,
      progress: session.progress,
      entrySnapshot: session.entrySnapshot,
      revealedJackpotAwards: getRevealedJackpotAwards(session),
      mathProfileVersionId: session.mathProfileVersionId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt,
      claimedAt: session.claimedAt,
    },
    actions: actions.map((entry) => ({
      actionType: entry.actionType,
      ordinal: entry.ordinal,
      requestPayload: entry.requestPayload,
      resultPayload: entry.resultPayload,
    })),
    ...(action
      ? {
          action: {
            actionType: action.actionType,
            ordinal: action.ordinal,
          },
        }
      : {}),
    ...(wallet ? { wallet } : {}),
  };
}

