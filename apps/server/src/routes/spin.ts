import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { type JackpotTier, type VolatilityPreset, type WalletState } from "../lib/db.js";
import { signPayload } from "../lib/signature.js";
import { createDefaultProfile } from "../seeds/defaultProfile.js";

const require = createRequire(import.meta.url);

const SPIN_COLUMNS = 5;
const SPIN_ROWS = 3;
const DEFAULT_LINES_MODE = 20;

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

export interface SpinWin {
  kind: WinKind;
  amount: number;
  detail: string;
}

export interface SpinTriggers {
  emberLock: boolean;
  freeQuest: boolean;
  jackpotTier?: JackpotTier;
}

export interface SpinBonusState {
  emberLock?: {
    active: boolean;
    lockedCells: number[];
    respinsRemaining: number;
    orbValues: number[];
    jackpotFlags: Partial<Record<JackpotTier, boolean>>;
  };
  freeQuest?: {
    active: boolean;
    spinsRemaining: number;
    retriggerChance: number;
  };
}

export interface SpinResult {
  spinId: string;
  profileId: string;
  sessionId: string;
  bet: number;
  linesMode: number;
  reels: string[][];
  wins: SpinWin[];
  triggers: SpinTriggers;
  bonusState: SpinBonusState;
  totalWin: number;
  updatedWallet: WalletState;
  jackpotLadder: Record<JackpotTier, number>;
  signature: string;
}

interface SpinComputation {
  reels: string[][];
  wins: SpinWin[];
  triggers: SpinTriggers;
  bonusState: SpinBonusState;
  totalWin: number;
}

interface SharedSpinInput {
  sessionId: string;
  profileId: string;
  bet: number;
  linesMode: number;
  volatility: VolatilityPreset;
  clientNonce: string;
  featureFlags: Record<string, boolean>;
}

const spinBodySchema = z.object({
  profileId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  bet: z.number().int().positive().max(1_000_000),
  linesMode: z.number().int().min(1).max(50).optional(),
  clientNonce: z.string().trim().min(8).max(128),
  volatility: z.enum(["low", "medium", "high"]).optional(),
  featureFlags: z.record(z.boolean()).optional(),
  nickname: z.string().trim().min(1).max(24).optional(),
});

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const asFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
};

const asNonEmptyString = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return fallback;
};

const isJackpotTier = (value: unknown): value is JackpotTier => {
  return value === "ember" || value === "relic" || value === "mythic" || value === "throne";
};

class SeededRng {
  private state: number;

  public constructor(seed: string) {
    const digest = createHash("sha256").update(seed).digest();
    this.state =
      ((digest[0] ?? 0) << 24) |
      ((digest[1] ?? 0) << 16) |
      ((digest[2] ?? 0) << 8) |
      (digest[3] ?? 0);

    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  public next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x1_0000_0000;
  }
}

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

const pickWeightedSymbol = (rng: SeededRng, volatility: VolatilityPreset): SymbolCode => {
  const pool = weightedSymbols[volatility];
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  const needle = rng.next() * totalWeight;

  let cursor = 0;
  for (const item of pool) {
    cursor += item.weight;
    if (needle <= cursor) {
      return item.symbol;
    }
  }

  return pool[pool.length - 1]?.symbol ?? "A";
};

const flattenReels = (reels: SymbolCode[][]): SymbolCode[] => {
  const flat: SymbolCode[] = [];
  for (const column of reels) {
    for (const symbol of column) {
      flat.push(symbol);
    }
  }
  return flat;
};

const pickJackpotTier = (rng: SeededRng): JackpotTier => {
  const roll = rng.next();
  if (roll < 0.7) {
    return "ember";
  }
  if (roll < 0.9) {
    return "relic";
  }
  if (roll < 0.98) {
    return "mythic";
  }
  return "throne";
};

const evaluateLineWins = (reels: SymbolCode[][], bet: number): SpinWin[] => {
  const payouts: Record<3 | 4 | 5, number> = {
    3: 1,
    4: 2,
    5: 4,
  };

  const wins: SpinWin[] = [];

  for (let row = 0; row < SPIN_ROWS; row += 1) {
    const rowSymbols: SymbolCode[] = [];
    for (let col = 0; col < SPIN_COLUMNS; col += 1) {
      rowSymbols.push(reels[col]?.[row] ?? "A");
    }

    const target = rowSymbols.find((symbol) => symbol !== "WILD");
    if (!target || target === "ORB" || target === "SCATTER") {
      continue;
    }

    let streak = 0;
    for (const symbol of rowSymbols) {
      if (symbol === target || symbol === "WILD") {
        streak += 1;
      } else {
        break;
      }
    }

    if (streak >= 3) {
      const payout = Math.floor(bet * payouts[streak as 3 | 4 | 5]);
      wins.push({
        kind: "line",
        amount: payout,
        detail: `Row ${row + 1} ${target} x${streak}`,
      });
    }
  }

  return wins;
};

const computeLocalOutcome = (input: SharedSpinInput): SpinComputation => {
  const rng = new SeededRng(
    `${input.sessionId}|${input.profileId}|${input.clientNonce}|${input.bet}|${input.linesMode}`,
  );

  const reels: SymbolCode[][] = Array.from({ length: SPIN_COLUMNS }, () =>
    Array.from({ length: SPIN_ROWS }, () => pickWeightedSymbol(rng, input.volatility)),
  );

  const wins: SpinWin[] = evaluateLineWins(reels, input.bet);

  const flattened = flattenReels(reels);
  const orbPositions: number[] = [];
  let orbCount = 0;
  let scatterCount = 0;

  flattened.forEach((symbol, index) => {
    if (symbol === "ORB") {
      orbCount += 1;
      orbPositions.push(index);
    }
    if (symbol === "SCATTER") {
      scatterCount += 1;
    }
  });

  const emberLock = orbCount >= 6;
  const freeQuest = scatterCount >= 3;

  let jackpotTier: JackpotTier | undefined;
  if (emberLock && rng.next() < 0.035) {
    jackpotTier = pickJackpotTier(rng);
  }

  const bonusState: SpinBonusState = {};

  if (emberLock) {
    const orbValues = orbPositions.map(() => Math.max(1, Math.floor((1 + rng.next() * 4) * input.bet)));
    const orbAward = Math.floor(orbValues.reduce((sum, value) => sum + value, 0) * 0.35);

    if (orbAward > 0) {
      wins.push({
        kind: "feature",
        amount: orbAward,
        detail: "Ember Lock entry reward",
      });
    }

    bonusState.emberLock = {
      active: true,
      lockedCells: orbPositions,
      respinsRemaining: 3,
      orbValues,
      jackpotFlags: {
        ...(jackpotTier ? { [jackpotTier]: true } : {}),
      },
    };
  }

  if (freeQuest) {
    const spinsRemaining = 8 + Math.floor(rng.next() * 5);
    const entryAward = Math.floor(input.bet * (1.2 + rng.next() * 0.6));

    wins.push({
      kind: "feature",
      amount: entryAward,
      detail: "Free Quest entry reward",
    });

    bonusState.freeQuest = {
      active: true,
      spinsRemaining,
      retriggerChance: 0.2,
    };
  }

  if (wins.length === 0 && rng.next() < 0.14) {
    wins.push({
      kind: "line",
      amount: Math.max(1, Math.floor(input.bet * 0.2)),
      detail: "Consolation cascade",
    });
  }

  const totalWin = wins.reduce((sum, win) => sum + win.amount, 0);

  return {
    reels: reels.map((column) => column.slice()),
    wins,
    triggers: {
      emberLock,
      freeQuest,
      ...(jackpotTier ? { jackpotTier } : {}),
    },
    bonusState,
    totalWin,
  };
};

const mapSharedWins = (value: unknown): SpinWin[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const wins: SpinWin[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const amount = Math.max(0, Math.floor(asFiniteNumber(item.amount, 0)));
    if (amount === 0) {
      continue;
    }

    const kindRaw = item.kind;
    const kind: WinKind =
      kindRaw === "jackpot" || kindRaw === "feature" || kindRaw === "line" ? kindRaw : "line";

    wins.push({
      kind,
      amount,
      detail: asNonEmptyString(item.detail, "Shared domain win"),
    });
  }

  return wins;
};

const mapSharedOutcome = (candidate: unknown): SpinComputation | null => {
  if (!isRecord(candidate)) {
    return null;
  }

  const reelsRaw = candidate.reels;
  if (!Array.isArray(reelsRaw)) {
    return null;
  }

  const reels: string[][] = [];
  for (const column of reelsRaw) {
    if (!Array.isArray(column)) {
      return null;
    }

    const mappedColumn = column.map((entry) => String(entry));
    if (mappedColumn.length === 0) {
      return null;
    }
    reels.push(mappedColumn);
  }

  const wins = mapSharedWins(candidate.wins);

  const triggersRaw = isRecord(candidate.triggers) ? candidate.triggers : {};
  const jackpotTier = isJackpotTier(triggersRaw.jackpotTier) ? triggersRaw.jackpotTier : undefined;

  const bonusStateRaw = isRecord(candidate.bonusState) ? candidate.bonusState : {};
  const bonusState: SpinBonusState = {
    ...(isRecord(bonusStateRaw.emberLock)
      ? {
          emberLock: {
            active: Boolean(bonusStateRaw.emberLock.active),
            lockedCells: Array.isArray(bonusStateRaw.emberLock.lockedCells)
              ? bonusStateRaw.emberLock.lockedCells.map((value) => Math.floor(asFiniteNumber(value, 0)))
              : [],
            respinsRemaining: Math.floor(asFiniteNumber(bonusStateRaw.emberLock.respinsRemaining, 3)),
            orbValues: Array.isArray(bonusStateRaw.emberLock.orbValues)
              ? bonusStateRaw.emberLock.orbValues.map((value) => Math.floor(asFiniteNumber(value, 0)))
              : [],
            jackpotFlags: {},
          },
        }
      : {}),
    ...(isRecord(bonusStateRaw.freeQuest)
      ? {
          freeQuest: {
            active: Boolean(bonusStateRaw.freeQuest.active),
            spinsRemaining: Math.floor(asFiniteNumber(bonusStateRaw.freeQuest.spinsRemaining, 0)),
            retriggerChance: asFiniteNumber(bonusStateRaw.freeQuest.retriggerChance, 0.2),
          },
        }
      : {}),
  };

  const totalWinFromWins = wins.reduce((sum, win) => sum + win.amount, 0);
  const totalWin = Math.max(0, Math.floor(asFiniteNumber(candidate.totalWin, totalWinFromWins)));

  return {
    reels,
    wins,
    triggers: {
      emberLock: Boolean(triggersRaw.emberLock),
      freeQuest: Boolean(triggersRaw.freeQuest),
      ...(jackpotTier ? { jackpotTier } : {}),
    },
    bonusState,
    totalWin,
  };
};

let sharedModuleCache: Record<string, unknown> | null | undefined;

const loadSharedSpinResolver = (): ((input: SharedSpinInput) => unknown) | null => {
  if (sharedModuleCache === undefined) {
    try {
      sharedModuleCache = require("@ember-thrones/shared") as Record<string, unknown>;
    } catch {
      sharedModuleCache = null;
    }
  }

  if (!sharedModuleCache) {
    return null;
  }

  const resolverCandidates = [
    "computeSpinOutcome",
    "resolveSpinOutcome",
    "resolveSpin",
    "runSpin",
    "spin",
  ];

  for (const key of resolverCandidates) {
    const fn = sharedModuleCache[key];
    if (typeof fn === "function") {
      return fn as (input: SharedSpinInput) => unknown;
    }
  }

  return null;
};

const computeSpinOutcome = (input: SharedSpinInput): SpinComputation => {
  const resolver = loadSharedSpinResolver();
  if (!resolver) {
    return computeLocalOutcome(input);
  }

  try {
    const sharedOutcome = resolver(input);
    const normalized = mapSharedOutcome(sharedOutcome);
    if (normalized) {
      return normalized;
    }
  } catch {
    return computeLocalOutcome(input);
  }

  return computeLocalOutcome(input);
};

const spinRoutes: FastifyPluginAsync = async (app) => {
  app.post("/spin", async (request, reply) => {
    const body = spinBodySchema.parse(request.body ?? {});

    const replayKey = `${body.sessionId}:${body.clientNonce}`;
    const accepted = app.replayGuard.consume(replayKey);
    if (!accepted) {
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

    if (walletBefore.coins < body.bet) {
      return reply.code(400).send({
        message: "Insufficient coins",
        wallet: walletBefore,
      });
    }

    const existingSession = app.db.getSession(body.sessionId);
    if (existingSession && existingSession.profileId !== profile.id) {
      return reply.code(409).send({
        message: "Session belongs to another profile",
      });
    }

    const session = app.db.upsertSession({
      id: body.sessionId,
      profileId: profile.id,
      volatility: body.volatility ?? existingSession?.volatility ?? "medium",
      state: existingSession?.state ?? {},
    });

    const linesMode = body.linesMode ?? DEFAULT_LINES_MODE;
    const outcome = computeSpinOutcome({
      sessionId: session.id,
      profileId: profile.id,
      bet: body.bet,
      linesMode,
      volatility: session.volatility,
      clientNonce: body.clientNonce,
      featureFlags: body.featureFlags ?? {},
    });

    let totalWin = outcome.totalWin;
    const wins: SpinWin[] = [...outcome.wins];
    let jackpotPayoutAmount = 0;

    if (outcome.triggers.jackpotTier) {
      jackpotPayoutAmount = app.db.getJackpotAmount(outcome.triggers.jackpotTier);
      totalWin += jackpotPayoutAmount;
      wins.push({
        kind: "jackpot",
        amount: jackpotPayoutAmount,
        detail: `${outcome.triggers.jackpotTier.toUpperCase()} jackpot payout`,
      });
    }

    const updatedWallet: WalletState = {
      coins: Math.max(0, walletBefore.coins - body.bet + totalWin),
      gems: walletBefore.gems,
      lifetimeSpins: walletBefore.lifetimeSpins + 1,
      lifetimeWins: walletBefore.lifetimeWins + totalWin,
    };

    const spinId = randomUUID();

    const unsignedResult: Omit<SpinResult, "signature"> = {
      spinId,
      profileId: profile.id,
      sessionId: session.id,
      bet: body.bet,
      linesMode,
      reels: outcome.reels,
      wins,
      triggers: {
        emberLock: outcome.triggers.emberLock,
        freeQuest: outcome.triggers.freeQuest,
        ...(outcome.triggers.jackpotTier ? { jackpotTier: outcome.triggers.jackpotTier } : {}),
      },
      bonusState: outcome.bonusState,
      totalWin,
      updatedWallet,
      jackpotLadder: app.db.getJackpots().reduce<Record<JackpotTier, number>>(
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
      ),
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
        bet: body.bet,
        totalWin,
        payload: response as unknown as Record<string, unknown>,
      },
      walletDelta: {
        coinsDelta: -body.bet + totalWin,
        spinsDelta: 1,
        winsDelta: totalWin,
      },
      sessionState: {
        ...session.state,
        lastSpinId: response.spinId,
        lastSpinAt: new Date().toISOString(),
        lastNonce: body.clientNonce,
        lastTriggers: response.triggers,
        lastBonusState: response.bonusState,
      },
      jackpotContributionBet: body.bet,
      ...(outcome.triggers.jackpotTier
        ? { jackpotPayoutTier: outcome.triggers.jackpotTier }
        : {}),
    });

    if (outcome.triggers.jackpotTier) {
      app.eventBus.publish("jackpot", {
        profileId: profile.id,
        sessionId: session.id,
        tier: outcome.triggers.jackpotTier,
        amount: jackpotPayoutAmount,
      });
    }

    if (response.triggers.emberLock || response.triggers.freeQuest) {
      app.eventBus.publish("bonus", {
        profileId: profile.id,
        sessionId: session.id,
        triggers: response.triggers,
      });
    }

    if (updatedWallet.lifetimeSpins > 0 && updatedWallet.lifetimeSpins % 100 === 0) {
      app.eventBus.publish("achievement", {
        profileId: profile.id,
        sessionId: session.id,
        key: "centurion_spinner",
        milestone: updatedWallet.lifetimeSpins,
      });
    }

    return response;
  });
};

export default spinRoutes;
