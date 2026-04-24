import type { BonusJackpotAward, BonusSessionStatus, JackpotTier, OrbLanding } from "@ember-thrones/shared";
import type { BonusActionRecord, BonusSessionRecord, WalletState } from "./db.js";
import type {
  BonusFeatureShell,
  ServerBonusActionType,
  ServerBonusAdvanceActionType,
  ServerBonusOutcome,
  ServerBonusProgress
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

export function createInitialBonusProgress(outcome: ServerBonusOutcome): ServerBonusProgress {
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
    entrySnapshot: input.entrySnapshot
  };
}

export function resumeBonusSession(session: BonusSessionRecord): BonusSessionStateMutation {
  if (session.status === "CLAIMED" || session.status === "EXPIRED") {
    throw new Error(`Bonus session cannot be resumed from status ${session.status}`);
  }

  const status = session.progress.completed ? "COMPLETED" : session.status === "PENDING" ? "ACTIVE" : session.status;

  return {
    progress: session.progress,
    status,
    actualAward: session.actualAward,
    resultPayload: {
      status,
      nextAction: session.progress.nextAction,
      completed: session.progress.completed,
      claimed: session.progress.claimed,
      featureShell: session.entrySnapshot
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
    throw new Error("No hold-and-spin respin remains for this session");
  }

  const nextCursor = progress.stepCursor + 1;
  const completed = nextCursor >= progress.totalSteps;
  const nextProgress: Extract<ServerBonusProgress, { type: "HOLD_AND_SPIN" }> = {
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
  const nextProgress: Extract<ServerBonusProgress, { type: "FREE_GAMES" }> = {
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
    actualAward: completed ? session.expectedTotalAward : nextSpin.runningAward,
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
  actionType: ServerBonusAdvanceActionType
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

  return actionType === "RESPIN" ? advanceHoldAndSpin(session) : advanceFreeGames(session);
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

  const progress: ServerBonusProgress = {
    ...session.progress,
    claimed: true,
    completed: true,
    nextAction: null
  };

  const creditedAmount = session.actualAward > 0 ? session.actualAward : session.expectedTotalAward;

  return {
    progress,
    status: "CLAIMED",
    actualAward: creditedAmount,
    resultPayload: {
      creditedAmount,
      revealedJackpotAwards: session.jackpotAwards,
      claimed: true
    }
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

  if (session.progress.type === "HOLD_AND_SPIN") {
    return session.progress.revealedOrbs.flatMap(
      (orb: (typeof session.progress.revealedOrbs)[number]) => (orb.jackpotTier ? [orb.jackpotTier] : [])
    );
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
      claimedAt: session.claimedAt
    },
    actions: actions.map((entry) => ({
      actionType: entry.actionType,
      ordinal: entry.ordinal,
      requestPayload: entry.requestPayload,
      resultPayload: entry.resultPayload
    })),
    ...(action ? { action: { actionType: action.actionType, ordinal: action.ordinal } } : {}),
    ...(wallet ? { wallet } : {})
  };
}
