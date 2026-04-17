import { createHash, randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  resolveCelestialWheelAscension,
  resolveEmberRespinCollectorLock,
  evaluatePaylines,
  type JackpotTier,
  type PayoutResult,
  type LineWin,
  type SpinGrid,
  type SlotSymbol,
  type ReelColumn,
  type SpinColumns,
} from "@ember-thrones/shared";
import { buildBonusSessionSeed, createInitialBonusProgress } from "../lib/bonusSessions.js";
import { type WalletState } from "../lib/db.js";
import { signPayload } from "../lib/signature.js";
import {
  CREDITS_PER_SPIN_OPTIONS,
  DEFAULT_SPEED_MODE,
  DENOMINATION_LADDER,
  SLOT_GEOMETRY,
  SeededRng,
  buildFreeSpinsOutcome,
  buildRuntimeCapabilities,
  collectJackpotTiersForOutcome,
  createFeatureShell,
  resolveWagerSelection,
  sanitizeBonusOutcomeForWager,
  type BonusFeatureShell,
  type ServerBonusOutcome,
  type ServerBonusType,
  type VolatilityPreset,
  type WagerProfile,
} from "../lib/slotRuntime.js";
import { createDefaultProfile } from "../seeds/defaultProfile.js";

const SPIN_COLUMNS = SLOT_GEOMETRY.reels;
const SPIN_ROWS = SLOT_GEOMETRY.rows;
const JACKPOT_RESET_AMOUNTS: Record<JackpotTier, number> = {
  ember: 5_000,
  relic: 25_000,
  mythic: 100_000,
  throne: 1_000_000,
};

type SymbolCode =
  | "A"
  | "K"
  | "Q"
  | "J"
  | "10"
  | "WILD"
  | "SCATTER"
  | "ORB"
  | "DRAGON";

type WinKind = "line" | "feature" | "jackpot";

export interface TriggerFlags {
  emberRespin: boolean;
  wheelAscension: boolean;
  relicVaultPick: boolean;
  freeQuest: boolean;
}

export interface SpinWin {
  kind: WinKind;
  amount: number;
  detail: string;
  lineIndex?: number;
}

export interface SpinTriggers {
  holdAndSpin: boolean;
  freeSpins: boolean;
  wheel: boolean;
  progressiveEligible: boolean;
}

export interface SpinBonusState {
  holdAndSpin?: {
    active: boolean;
    lockedCells: number[];
    respinsRemaining: number;
    collectorMultiplier: number;
  };
  freeSpins?: {
    active: boolean;
    spinsRemaining: number;
    retriggerCount: number;
    stance: string;
  };
  wheel?: {
    active: boolean;
    currentSpin: number;
    awardedSpins: number;
    maxSpins: number;
  };
}

export interface SpinBonusSessionReference {
  id: string;
  type: ServerBonusType;
  status: string;
}

export interface SpinResult {
  spinId: string;
  profileId: string;
  sessionId: string;
  bet: number;
  linesMode: number;
  wager: WagerProfile;
  reels: string[][];
  wins: SpinWin[];
  triggers: SpinTriggers;
  triggerFlags: TriggerFlags;
  bonusState: SpinBonusState;
  bonusSessionRef: SpinBonusSessionReference | null;
  featureShell: BonusFeatureShell | null;
  bonusPayload: null;
  totalWin: number;
  updatedWallet: WalletState;
  jackpotSnapshotBefore: Record<JackpotTier, number>;
  jackpotSnapshotAfter: Record<JackpotTier, number>;
  jackpotLadder: Record<JackpotTier, number>;
  mathProfileVersion: {
    id: string;
    profileKey: string;
    versionTag: string;
    reelSetId: string;
  };
  runtimeCapabilities: ReturnType<typeof buildRuntimeCapabilities>;
  signature: string;
}

interface SpinComputation {
  reels: SymbolCode[][];
  wins: SpinWin[];
  triggers: SpinTriggers;
  triggerFlags: TriggerFlags;
  bonusState: SpinBonusState;
  bonusOutcome: ServerBonusOutcome | null;
  featureShell: BonusFeatureShell | null;
  totalWin: number;
}

interface SharedSpinInput {
  sessionId: string;
  profileId: string;
  wager: WagerProfile;
  linesMode: number;
  volatility: VolatilityPreset;
  clientNonce: string;
  featureFlags: Record<string, boolean>;
}

interface ReelAnalysis {
  flattened: SymbolCode[];
  orbPositions: number[];
  orbCount: number;
  scatterCount: number;
  dragonCount: number;
}

const spinBodySchema = z.object({
  profileId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  bet: z.number().int().positive().max(1_000_000).optional(),
  denomination: z.number().int().positive().optional(),
  creditsPerSpin: z.number().int().positive().optional(),
  linesMode: z.number().int().min(1).max(SLOT_GEOMETRY.paylines).optional(),
  clientNonce: z.string().trim().min(8).max(128),
  volatility: z.enum(["low", "medium", "high"]).optional(),
  speedMode: z.enum(["normal", "turbo", "auto"]).optional(),
  featureFlags: z.record(z.boolean()).optional(),
  nickname: z.string().trim().min(1).max(24).optional(),
});

const weightedSymbols: Record<VolatilityPreset, Array<{ symbol: SymbolCode; weight: number }>> = {
  low: [
    { symbol: "A", weight: 14 },
    { symbol: "K", weight: 14 },
    { symbol: "Q", weight: 14 },
    { symbol: "J", weight: 14 },
    { symbol: "10", weight: 12 },
    { symbol: "WILD", weight: 8 },
    { symbol: "SCATTER", weight: 5 },
    { symbol: "ORB", weight: 4 },
    { symbol: "DRAGON", weight: 5 },
  ],
  medium: [
    { symbol: "A", weight: 13 },
    { symbol: "K", weight: 13 },
    { symbol: "Q", weight: 12 },
    { symbol: "J", weight: 12 },
    { symbol: "10", weight: 11 },
    { symbol: "WILD", weight: 8 },
    { symbol: "SCATTER", weight: 6 },
    { symbol: "ORB", weight: 8 },
    { symbol: "DRAGON", weight: 7 },
  ],
  high: [
    { symbol: "A", weight: 11 },
    { symbol: "K", weight: 11 },
    { symbol: "Q", weight: 10 },
    { symbol: "J", weight: 10 },
    { symbol: "10", weight: 10 },
    { symbol: "WILD", weight: 9 },
    { symbol: "SCATTER", weight: 7 },
    { symbol: "ORB", weight: 11 },
    { symbol: "DRAGON", weight: 9 },
  ],
};

const analyzeReels = (reels: SymbolCode[][]): ReelAnalysis => {
  const flattened: SymbolCode[] = [];
  const orbPositions: number[] = [];
  let orbCount = 0;
  let scatterCount = 0;
  let dragonCount = 0;

  for (let columnIndex = 0; columnIndex < reels.length; columnIndex += 1) {
    const column = reels[columnIndex] ?? [];
    for (let rowIndex = 0; rowIndex < column.length; rowIndex += 1) {
      const symbol = column[rowIndex] ?? "A";
      const flatIndex = columnIndex * SPIN_ROWS + rowIndex;
      flattened.push(symbol);

      if (symbol === "ORB") {
        orbCount += 1;
        orbPositions.push(flatIndex);
      }
      if (symbol === "SCATTER") {
        scatterCount += 1;
      }
      if (symbol === "DRAGON") {
        dragonCount += 1;
      }
    }
  }

  return {
    flattened,
    orbPositions,
    orbCount,
    scatterCount,
    dragonCount,
  };
};

const deriveTriggerFlags = (analysis: ReelAnalysis): TriggerFlags => ({
  emberRespin: analysis.orbCount >= 6,
  wheelAscension: analysis.scatterCount >= 4 && analysis.dragonCount >= 1,
  relicVaultPick: false,
  freeQuest: analysis.scatterCount >= 3,
});

const selectPrimaryBonusType = (triggerFlags: TriggerFlags): ServerBonusType | null => {
  if (triggerFlags.emberRespin) {
    return "EMBER_RESPIN";
  }
  if (triggerFlags.wheelAscension) {
    return "WHEEL_ASCENSION";
  }
  if (triggerFlags.freeQuest) {
    return "FREE_SPINS";
  }
  return null;
};

const pickWeightedSymbol = (rng: SeededRng, volatility: VolatilityPreset): SymbolCode => {
  const pool = weightedSymbols[volatility];
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  const needle = rng.nextFloat() * totalWeight;

  let cursor = 0;
  for (const item of pool) {
    cursor += item.weight;
    if (needle <= cursor) {
      return item.symbol;
    }
  }

  return pool[pool.length - 1]?.symbol ?? "A";
};

const SERVER_TO_SHARED_SYMBOL: Record<SymbolCode, SlotSymbol> = {
  "10": "ember",
  J: "flame",
  Q: "scale",
  K: "relic",
  A: "mythic",
  DRAGON: "throne",
  WILD: "wild",
  ORB: "orb",
  SCATTER: "scatter",
};

const toSharedGrid = (reels: SymbolCode[][]): SpinGrid => {
  const columns = reels.map((column) =>
    column.map((symbol) => SERVER_TO_SHARED_SYMBOL[symbol]) as ReelColumn
  ) as unknown as SpinColumns;
  return { columns, stops: [0, 0, 0, 0, 0] };
};

const evaluateLineWins = (reels: SymbolCode[][], totalBet: number): SpinWin[] => {
  const grid = toSharedGrid(reels);
  const result = evaluatePaylines(grid, totalBet);

  const wins: SpinWin[] = result.lineWins.map((lineWin: LineWin) => ({
    kind: "line" as WinKind,
    amount: Math.floor(lineWin.payout),
    detail: `Line ${lineWin.lineIndex + 1} ${lineWin.symbol} x${lineWin.count}`,
    lineIndex: lineWin.lineIndex,
  }));

  if (result.scatterWin > 0) {
    wins.push({
      kind: "line" as WinKind,
      amount: Math.floor(result.scatterWin),
      detail: `Scatter x${result.scatterCount}`,
    });
  }

  return wins;
};

const buildSeedBase = (input: SharedSpinInput): string => {
  return `${input.sessionId}|${input.profileId}|${input.clientNonce}|${input.wager.totalBet}|${input.linesMode}|${input.wager.speedMode}`;
};

const buildRevealSeed = (
  input: SharedSpinInput,
  bonusType: ServerBonusType,
  flattenedReels: SymbolCode[],
): string => {
  return createHash("sha256")
    .update(`${buildSeedBase(input)}|${bonusType}|${flattenedReels.join(",")}`)
    .digest("hex");
};

const toJackpotSnapshot = (
  rows: Array<{ tier: JackpotTier; amount: number }>,
): Record<JackpotTier, number> => {
  return rows.reduce<Record<JackpotTier, number>>(
    (acc, row) => {
      acc[row.tier] = row.amount;
      return acc;
    },
    {
      ember: 0,
      relic: 0,
      mythic: 0,
      throne: 0,
    },
  );
};

const projectJackpotSnapshotAfter = (
  before: Record<JackpotTier, number>,
  totalBet: number,
  payoutTiers: Set<JackpotTier>,
): Record<JackpotTier, number> => {
  const contribution = Math.max(1, Math.floor(totalBet * 0.05));
  const ember = Math.floor(contribution * 0.4);
  const relic = Math.floor(contribution * 0.3);
  const mythic = Math.floor(contribution * 0.2);
  const throne = contribution - ember - relic - mythic;

  const projected: Record<JackpotTier, number> = {
    ember: (before.ember ?? 0) + ember,
    relic: (before.relic ?? 0) + relic,
    mythic: (before.mythic ?? 0) + mythic,
    throne: (before.throne ?? 0) + throne,
  };

  for (const tier of payoutTiers) {
    const resetAmount = JACKPOT_RESET_AMOUNTS[tier] ?? projected[tier] ?? 0;
    projected[tier] = resetAmount;
  }

  return projected;
};

const buildBonusState = (outcome: ServerBonusOutcome | null): SpinBonusState => {
  if (!outcome) {
    return {};
  }

  if (outcome.type === "EMBER_RESPIN") {
    return {
      holdAndSpin: {
        active: true,
        lockedCells: outcome.startingOrbs.map((orb: (typeof outcome.startingOrbs)[number]) => orb.position),
        respinsRemaining: 3,
        collectorMultiplier: 1,
      },
    };
  }

  if (outcome.type === "WHEEL_ASCENSION") {
    return {
      wheel: {
        active: true,
        currentSpin: 0,
        awardedSpins: outcome.awardedSpins,
        maxSpins: outcome.maxSpins,
      },
    };
  }

  return {
    freeSpins: {
      active: true,
      spinsRemaining: outcome.initialSpins,
      retriggerCount: 0,
      stance: outcome.stance,
    },
  };
};

const computeSpinOutcome = (input: SharedSpinInput): SpinComputation => {
  const rng = new SeededRng(buildSeedBase(input));
  const reels: SymbolCode[][] = Array.from({ length: SPIN_COLUMNS }, () =>
    Array.from({ length: SPIN_ROWS }, () => pickWeightedSymbol(rng, input.volatility)),
  );
  const wins = evaluateLineWins(reels, input.wager.totalBet);
  const analysis = analyzeReels(reels);
  const triggerFlags = deriveTriggerFlags(analysis);
  const selectedBonusType = selectPrimaryBonusType(triggerFlags);

  let bonusOutcome: ServerBonusOutcome | null = null;
  if (selectedBonusType) {
    const revealSeed = buildRevealSeed(input, selectedBonusType, analysis.flattened);
    if (selectedBonusType === "EMBER_RESPIN") {
      bonusOutcome = resolveEmberRespinCollectorLock({
        seed: revealSeed,
        bet: input.wager.totalBet,
        initialLockedCells: analysis.orbPositions,
      });
    } else if (selectedBonusType === "WHEEL_ASCENSION") {
      bonusOutcome = resolveCelestialWheelAscension({
        seed: revealSeed,
        bet: input.wager.totalBet,
      });
    } else {
      bonusOutcome = buildFreeSpinsOutcome({
        seed: revealSeed,
        wager: input.wager,
        triggerScatters: analysis.scatterCount,
      });
    }
    bonusOutcome = sanitizeBonusOutcomeForWager(bonusOutcome, input.wager);
  }

  if (wins.length === 0 && !selectedBonusType && new SeededRng(`${buildSeedBase(input)}|consolation`).chance(0.14)) {
    wins.push({
      kind: "line",
      amount: Math.max(1, Math.floor(input.wager.totalBet * 0.2)),
      detail: "Consolation cascade",
    });
  }

  return {
    reels: reels.map((column) => column.slice()),
    wins,
    triggers: {
      holdAndSpin: triggerFlags.emberRespin,
      freeSpins: triggerFlags.freeQuest,
      wheel: triggerFlags.wheelAscension,
      progressiveEligible: input.wager.qualifiesForGrandJackpot,
    },
    triggerFlags,
    bonusState: buildBonusState(bonusOutcome),
    bonusOutcome,
    featureShell: bonusOutcome
      ? createFeatureShell(bonusOutcome, createInitialBonusProgress(bonusOutcome), input.wager)
      : null,
    totalWin: wins.reduce((sum, win) => sum + win.amount, 0),
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const spinRoutes: FastifyPluginAsync = async (app) => {
  app.post("/spin", async (request, reply) => {
    const body = spinBodySchema.parse(request.body ?? {});

    const wagerInput: {
      bet?: number;
      denomination?: number;
      creditsPerSpin?: number;
      speedMode?: WagerProfile["speedMode"];
    } = {};

    if (body.bet !== undefined) {
      wagerInput.bet = body.bet;
    }
    if (body.denomination !== undefined) {
      wagerInput.denomination = body.denomination;
    }
    if (body.creditsPerSpin !== undefined) {
      wagerInput.creditsPerSpin = body.creditsPerSpin;
    }
    wagerInput.speedMode = body.speedMode ?? DEFAULT_SPEED_MODE;

    let wager: WagerProfile;
    try {
      wager = resolveWagerSelection(wagerInput);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Unsupported wager selection",
        supportedDenominations: [...DENOMINATION_LADDER],
        supportedCreditsPerSpin: [...CREDITS_PER_SPIN_OPTIONS],
      });
    }

    const replayKey = `${body.sessionId}:${body.clientNonce}`;
    if (!app.replayGuard.consume(replayKey)) {
      return reply.code(409).send({
        message: "Replay detected for nonce",
      });
    }

    const profile = app.db.ensureProfile(
      createDefaultProfile({
        id: body.profileId,
        ...(body.nickname ? { nickname: body.nickname } : {}),
      }),
    );

    const walletBefore = app.db.getWallet(profile.id);
    if (!walletBefore) {
      return reply.code(500).send({
        message: "Unable to load wallet",
      });
    }

    if (walletBefore.coins < wager.totalBet) {
      return reply.code(400).send({
        message: "Insufficient coins",
        wallet: walletBefore,
        wager,
      });
    }

    const existingSession = app.db.getSession(body.sessionId);
    if (existingSession && existingSession.profileId !== profile.id) {
      return reply.code(409).send({
        message: "Session belongs to another profile",
      });
    }

    const activeBonusSessionRef = isRecord(existingSession?.state)
      ? existingSession.state.activeBonusSessionRef
      : undefined;
    if (isRecord(activeBonusSessionRef) && typeof activeBonusSessionRef.id === "string") {
      return reply.code(409).send({
        message: "Session has an active streamed bonus. Resume or claim it before spinning again.",
        activeBonusSessionRef,
      });
    }

    const session = app.db.upsertSession({
      id: body.sessionId,
      profileId: profile.id,
      volatility: body.volatility ?? existingSession?.volatility ?? "medium",
      state: existingSession?.state ?? {},
    });

    const linesMode = SLOT_GEOMETRY.paylines;
    const mathProfileVersion = app.db.getActiveMathProfileVersion();
    const runtimeCapabilities = buildRuntimeCapabilities();
    const sharedInput: SharedSpinInput = {
      sessionId: session.id,
      profileId: profile.id,
      wager,
      linesMode,
      volatility: session.volatility,
      clientNonce: body.clientNonce,
      featureFlags: body.featureFlags ?? {},
    };
    const outcome = computeSpinOutcome(sharedInput);

    const spinId = randomUUID();
    const jackpotSnapshotBefore = toJackpotSnapshot(app.db.getJackpots());
    const jackpotPayoutTierSet = new Set<JackpotTier>();
    let bonusSessionRef: SpinBonusSessionReference | null = null;
    let reservedBonusSession: ReturnType<typeof buildBonusSessionSeed> | null = null;
    let jackpotEvents: Array<{
      tier: JackpotTier;
      eventType: "RESERVED";
      amount: number;
      profileId: string;
      sessionId: string;
      spinId: string;
      bonusSessionId: string;
      mathProfileVersionId: string;
    }> = [];

    if (outcome.bonusOutcome && outcome.featureShell) {
      const reelAnalysis = analyzeReels(outcome.reels);
      const jackpotTiers = collectJackpotTiersForOutcome(outcome.bonusOutcome);
      const jackpotAwards = jackpotTiers.map((tier) => ({
        tier,
        amount: jackpotSnapshotBefore[tier] ?? 0,
        source:
          outcome.bonusOutcome.type === "EMBER_RESPIN"
            ? "hold_and_spin"
            : outcome.bonusOutcome.type === "WHEEL_ASCENSION"
              ? "wheel"
              : "free_spins",
      }));

      for (const award of jackpotAwards) {
        jackpotPayoutTierSet.add(award.tier);
      }

      const createdBonusSessionRef: SpinBonusSessionReference = {
        id: randomUUID(),
        type: outcome.bonusOutcome.type,
        status: "PENDING",
      };
      bonusSessionRef = createdBonusSessionRef;

      reservedBonusSession = buildBonusSessionSeed({
        id: createdBonusSessionRef.id,
        spinId,
        sessionId: session.id,
        profileId: profile.id,
        revealSeed: buildRevealSeed(sharedInput, outcome.bonusOutcome.type, reelAnalysis.flattened),
        expectedTotalAward:
          outcome.bonusOutcome.finalAward + jackpotAwards.reduce((sum, award) => sum + award.amount, 0),
        jackpotTiersHit: jackpotTiers,
        jackpotAwards,
        outcome: outcome.bonusOutcome,
        mathProfileVersionId: mathProfileVersion.id,
        entrySnapshot: outcome.featureShell,
      });

      createdBonusSessionRef.status = reservedBonusSession.status;
      jackpotEvents = jackpotAwards
        .filter((award) => award.amount > 0)
        .map((award) => ({
          tier: award.tier,
          eventType: "RESERVED" as const,
          amount: award.amount,
          profileId: profile.id,
          sessionId: session.id,
          spinId,
          bonusSessionId: createdBonusSessionRef.id,
          mathProfileVersionId: mathProfileVersion.id,
        }));
    }

    const totalWin = outcome.totalWin;
    const jackpotSnapshotAfter = projectJackpotSnapshotAfter(
      jackpotSnapshotBefore,
      wager.totalBet,
      jackpotPayoutTierSet,
    );

    const updatedWallet: WalletState = {
      coins: Math.max(0, walletBefore.coins - wager.totalBet + totalWin),
      gems: walletBefore.gems,
      lifetimeSpins: walletBefore.lifetimeSpins + 1,
      lifetimeWins: walletBefore.lifetimeWins + totalWin,
    };

    const unsignedResult: Omit<SpinResult, "signature"> = {
      spinId,
      profileId: profile.id,
      sessionId: session.id,
      bet: wager.totalBet,
      linesMode,
      wager,
      reels: outcome.reels.map((column) => column.slice()),
      wins: outcome.wins,
      triggers: outcome.triggers,
      triggerFlags: outcome.triggerFlags,
      bonusState: outcome.bonusState,
      bonusSessionRef,
      featureShell: outcome.featureShell,
      bonusPayload: null,
      totalWin,
      updatedWallet,
      jackpotSnapshotBefore,
      jackpotSnapshotAfter,
      jackpotLadder: jackpotSnapshotAfter,
      mathProfileVersion: {
        id: mathProfileVersion.id,
        profileKey: mathProfileVersion.profileKey,
        versionTag: mathProfileVersion.versionTag,
        reelSetId: mathProfileVersion.reelSetId,
      },
      runtimeCapabilities,
    };

    const signature = signPayload(unsignedResult, app.signatureSecret);
    const response: SpinResult = {
      ...unsignedResult,
      signature,
    };

    app.db.commitSpinAtomic({
      spin: {
        id: spinId,
        sessionId: session.id,
        profileId: profile.id,
        bet: wager.totalBet,
        totalWin,
        payload: response as unknown as Record<string, unknown>,
        wager,
        mathProfileVersionId: mathProfileVersion.id,
      },
      walletDelta: {
        coinsDelta: totalWin - wager.totalBet,
        spinsDelta: 1,
        winsDelta: totalWin,
      },
      sessionState: {
        ...(session.state ?? {}),
        lastSpinId: spinId,
        lastWager: wager,
        lastSpeedMode: wager.speedMode,
        runtimeMode: runtimeCapabilities.mode,
        mathProfileVersionId: mathProfileVersion.id,
        activeBonusSessionRef: bonusSessionRef,
        lastBonusSessionRef: bonusSessionRef,
      },
      jackpotContributionBet: wager.totalBet,
      jackpotPayoutTiers: [...jackpotPayoutTierSet],
      ...(reservedBonusSession ? { bonusSession: reservedBonusSession } : {}),
      ...(jackpotEvents.length > 0 ? { jackpotEvents } : {}),
    });

    if (bonusSessionRef) {
      app.eventBus.publish("bonus", {
        profileId: profile.id,
        sessionId: session.id,
        bonusSessionId: bonusSessionRef.id,
        bonusType: bonusSessionRef.type,
        status: bonusSessionRef.status,
        streamMode: "server-owned",
      });
    }

    return response;
  });
};

export default spinRoutes;

