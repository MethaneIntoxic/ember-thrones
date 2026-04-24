import { createHash, randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  countSymbol,
  evaluatePaylines,
  generateSpin,
  listSymbolPositions,
  type BonusPayload,
  type BonusSessionReference,
  type GameVariant,
  type HoldAndSpinStateContract,
  type FreeGamesStateContract,
  type JackpotTier,
  type SpinResult
} from "@ember-thrones/shared";
import { buildBonusSessionSeed, createInitialBonusProgress } from "../lib/bonusSessions.js";
import { type WalletState } from "../lib/db.js";
import { signPayload } from "../lib/signature.js";
import {
  DEFAULT_GAME_VARIANT,
  DEFAULT_SPEED_MODE,
  DENOMINATION_LADDER,
  CREDITS_PER_SPIN_OPTIONS,
  SeededRng,
  SLOT_GEOMETRY,
  buildFreeGamesOutcome,
  buildRuntimeCapabilities,
  collectJackpotTiersForOutcome,
  createFeatureShell,
  resolveWagerSelection,
  sanitizeBonusOutcomeForWager,
  type ServerBonusOutcome,
  type WagerProfile
} from "../lib/slotRuntime.js";
import { createDefaultProfile } from "../seeds/defaultProfile.js";
import { resolveEmberRespinCollectorLock } from "@ember-thrones/shared";

const spinBodySchema = z.object({
  profileId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  bet: z.number().int().positive().max(1_000_000).optional(),
  denomination: z.number().int().positive().optional(),
  creditsPerSpin: z.number().int().positive().optional(),
  clientNonce: z.string().trim().min(8).max(128),
  volatility: z.enum(["low", "medium", "high"]).optional(),
  speedMode: z.enum(["normal", "turbo", "auto"]).optional(),
  nickname: z.string().trim().min(1).max(24).optional(),
  gameVariantId: z.string().trim().min(1).optional()
});

interface SharedSpinInput {
  sessionId: string;
  profileId: string;
  wager: WagerProfile;
  clientNonce: string;
  variant: GameVariant;
}

const buildSeedBase = (input: SharedSpinInput): string =>
  `${input.sessionId}|${input.profileId}|${input.clientNonce}|${input.wager.totalBet}|${input.variant.id}|${input.wager.speedMode}`;

const buildRevealSeed = (input: SharedSpinInput, bonusType: ServerBonusOutcome["type"], gridHash: string): string =>
  createHash("sha256").update(`${buildSeedBase(input)}|${bonusType}|${gridHash}`).digest("hex");

const toJackpotSnapshot = (rows: Array<{ tier: JackpotTier; amount: number }>): Record<JackpotTier, number> =>
  rows.reduce<Record<JackpotTier, number>>(
    (acc, row) => {
      acc[row.tier] = row.amount;
      return acc;
    },
    { mini: 0, minor: 0, major: 0, grand: 0 }
  );

const projectJackpotSnapshotAfter = (
  before: Record<JackpotTier, number>,
  totalBet: number,
  payoutTiers: Set<JackpotTier>,
  variant: GameVariant
): Record<JackpotTier, number> => {
  const contribution = Math.max(1, Math.floor(totalBet * 0.05));
  const shares = variant.jackpotConfig.contributionShares;
  const mini = Math.floor(contribution * shares.mini);
  const minor = Math.floor(contribution * shares.minor);
  const major = Math.floor(contribution * shares.major);
  const grand = contribution - mini - minor - major;

  const projected: Record<JackpotTier, number> = {
    mini: (before.mini ?? 0) + mini,
    minor: (before.minor ?? 0) + minor,
    major: (before.major ?? 0) + major,
    grand: (before.grand ?? 0) + grand
  };

  for (const tier of payoutTiers) {
    projected[tier] = variant.jackpotConfig.resetAmounts[tier];
  }

  return projected;
};

const spinRoutes: FastifyPluginAsync = async (app) => {
  app.post("/spin", async (request, reply) => {
    const body = spinBodySchema.parse(request.body ?? {});
    const variant = DEFAULT_GAME_VARIANT;

    let wager: WagerProfile;
    try {
      wager = resolveWagerSelection({
        ...(body.bet !== undefined ? { bet: body.bet } : {}),
        ...(body.denomination !== undefined ? { denomination: body.denomination } : {}),
        ...(body.creditsPerSpin !== undefined ? { creditsPerSpin: body.creditsPerSpin } : {}),
        speedMode: body.speedMode ?? DEFAULT_SPEED_MODE
      });
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : "Unsupported wager selection",
        supportedDenominations: [...DENOMINATION_LADDER],
        supportedCreditsPerSpin: [...CREDITS_PER_SPIN_OPTIONS]
      });
    }

    const replayKey = `${body.sessionId}:${body.clientNonce}`;
    if (!app.replayGuard.consume(replayKey)) {
      return reply.code(409).send({ message: "Replay detected for nonce" });
    }

    const profile = app.db.ensureProfile(
      createDefaultProfile({
        id: body.profileId,
        ...(body.nickname ? { nickname: body.nickname } : {})
      })
    );

    const walletBefore = app.db.getWallet(profile.id);
    if (!walletBefore) {
      return reply.code(500).send({ message: "Unable to load wallet" });
    }

    if (walletBefore.coins < wager.totalBet) {
      return reply.code(400).send({ message: "Insufficient coins", wallet: walletBefore, wager });
    }

    const existingSession = app.db.getSession(body.sessionId);
    if (existingSession && existingSession.profileId !== profile.id) {
      return reply.code(409).send({ message: "Session belongs to another profile" });
    }

    const activeBonusSessionRef = existingSession?.state?.activeBonusSessionRef;
    if (typeof activeBonusSessionRef === "object" && activeBonusSessionRef && "id" in activeBonusSessionRef) {
      return reply.code(409).send({
        message: "Session has an active streamed bonus. Resume or claim it before spinning again.",
        activeBonusSessionRef
      });
    }

    const session = app.db.upsertSession({
      id: body.sessionId,
      profileId: profile.id,
      volatility: body.volatility ?? existingSession?.volatility ?? "medium",
      state: existingSession?.state ?? {}
    });

    const sharedInput: SharedSpinInput = {
      sessionId: session.id,
      profileId: profile.id,
      wager,
      clientNonce: body.clientNonce,
      variant
    };

    const rng = new SeededRng(buildSeedBase(sharedInput));
    const spinGrid = generateSpin(rng);
    const payout = evaluatePaylines(spinGrid, wager.totalBet);
    const orbCount = countSymbol(spinGrid, "orb");
    const scatterCount = countSymbol(spinGrid, "scatter");
    const triggerFlags = {
      holdAndSpin: orbCount >= variant.orbTriggerConfig.minOrbs,
      freeGames: scatterCount >= variant.scatterTriggerConfig.minScatters
    };

    const gridColumns = spinGrid.columns.map((column: (typeof spinGrid.columns)[number]) => [...column]);
    const gridHash = createHash("sha256").update(JSON.stringify(gridColumns)).digest("hex");

    let bonusOutcome: ServerBonusOutcome | null = null;
    if (triggerFlags.holdAndSpin) {
      bonusOutcome = resolveEmberRespinCollectorLock({
        seed: buildRevealSeed(sharedInput, "HOLD_AND_SPIN", gridHash),
        bet: wager.totalBet,
        initialLockedCells: listSymbolPositions(spinGrid, "orb"),
        gameVariantId: variant.id
      });
    } else if (triggerFlags.freeGames) {
      bonusOutcome = buildFreeGamesOutcome({
        seed: buildRevealSeed(sharedInput, "FREE_GAMES", gridHash),
        wager,
        triggerScatters: scatterCount,
        modifierId: variant.freeGamesModifierId,
        gameVariantId: variant.id
      });
    }

    if (bonusOutcome) {
      bonusOutcome = sanitizeBonusOutcomeForWager(bonusOutcome, wager);
    }

    const holdAndSpinState: HoldAndSpinStateContract | undefined =
      bonusOutcome?.type === "HOLD_AND_SPIN"
        ? {
            active: true,
            lockedCount: bonusOutcome.startingOrbs.length,
            respinsRemaining: 3,
            filledPositions: bonusOutcome.startingOrbs.map((orb: (typeof bonusOutcome.startingOrbs)[number]) => orb.position)
          }
        : undefined;

    const freeGamesState: FreeGamesStateContract | undefined =
      bonusOutcome?.type === "FREE_GAMES"
        ? {
            active: true,
            modifierId: bonusOutcome.modifierId,
            gamesRemaining: bonusOutcome.initialGames,
            retriggerCount: 0,
            totalAwardedGames: bonusOutcome.totalAwardedGames
          }
        : undefined;

    const spinId = randomUUID();
    const mathProfileVersion = app.db.getActiveMathProfileVersion();
    const jackpotSnapshotBefore = toJackpotSnapshot(app.db.getJackpots());
    const jackpotPayoutTierSet = new Set<JackpotTier>();

    let bonusSessionRef: BonusSessionReference | null = null;
    let bonusPayload: BonusPayload | null = null;
    let reservedBonusSession: ReturnType<typeof buildBonusSessionSeed> | null = null;
    let featureShell = null;
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

    if (bonusOutcome) {
      const jackpotTiersHit = collectJackpotTiersForOutcome(bonusOutcome);
      const jackpotAwards = jackpotTiersHit.map((tier) => ({
        tier,
        amount: jackpotSnapshotBefore[tier] ?? 0,
        source: bonusOutcome.type === "HOLD_AND_SPIN" ? "hold_and_spin" : "free_games"
      }));

      for (const award of jackpotAwards) {
        jackpotPayoutTierSet.add(award.tier);
      }

      bonusSessionRef = {
        id: randomUUID(),
        type: bonusOutcome.type,
        status: "PENDING"
      };

      const progress = createInitialBonusProgress(bonusOutcome);
      featureShell = createFeatureShell(bonusOutcome, progress, wager);
      const expectedTotalAward =
        bonusOutcome.finalAward + jackpotAwards.reduce((sum, award) => sum + award.amount, 0);

      bonusPayload = {
        type: bonusOutcome.type,
        sessionId: bonusSessionRef.id,
        revealSeed: buildRevealSeed(sharedInput, bonusOutcome.type, gridHash),
        gameVariantId: variant.id,
        freeGamesModifierId: variant.freeGamesModifierId,
        expectedTotalAward,
        jackpotTiersHit,
        jackpotAwards,
        jackpotConfig: variant.jackpotConfig,
        orbTriggerConfig: variant.orbTriggerConfig,
        scatterTriggerConfig: variant.scatterTriggerConfig,
        precomputedOutcome: bonusOutcome
      };

      reservedBonusSession = buildBonusSessionSeed({
        id: bonusSessionRef.id,
        spinId,
        sessionId: session.id,
        profileId: profile.id,
        revealSeed: bonusPayload.revealSeed,
        expectedTotalAward,
        jackpotTiersHit,
        jackpotAwards,
        outcome: bonusOutcome,
        mathProfileVersionId: mathProfileVersion.id,
        entrySnapshot: featureShell
      });

      jackpotEvents = jackpotAwards
        .filter((award) => award.amount > 0)
        .map((award) => ({
          tier: award.tier,
          eventType: "RESERVED" as const,
          amount: award.amount,
          profileId: profile.id,
          sessionId: session.id,
          spinId,
          bonusSessionId: bonusSessionRef!.id,
          mathProfileVersionId: mathProfileVersion.id
        }));
    }

    const baseWin = Math.floor(payout.totalWin);
    const featureWin = 0;
    const totalWin = baseWin + featureWin;
    const jackpotSnapshotAfter = projectJackpotSnapshotAfter(
      jackpotSnapshotBefore,
      wager.totalBet,
      jackpotPayoutTierSet,
      variant
    );

    const wallet: WalletState = {
      coins: Math.max(0, walletBefore.coins - wager.totalBet + totalWin),
      gems: walletBefore.gems,
      lifetimeSpins: walletBefore.lifetimeSpins + 1,
      lifetimeWins: walletBefore.lifetimeWins + totalWin
    };

    const runtimeCapabilities = buildRuntimeCapabilities();
    const unsignedResult: SpinResult & {
      profileId: string;
      wallet: WalletState;
      wager: WagerProfile;
      reels: string[][];
      jackpotLadder: Record<JackpotTier, number>;
      runtimeCapabilities: ReturnType<typeof buildRuntimeCapabilities>;
      mathProfileVersion: {
        id: string;
        profileKey: string;
        versionTag: string;
        reelSetId: string;
      };
    } = {
      spinId,
      profileId: profile.id,
      sessionId: session.id,
      bet: wager.totalBet,
      grid: spinGrid.columns,
      reels: gridColumns,
      lineWins: payout.lineWins.map((lineWin: (typeof payout.lineWins)[number]) => ({
        lineIndex: lineWin.lineIndex,
        symbol: lineWin.symbol,
        count: lineWin.count,
        multiplier: lineWin.multiplier,
        payout: lineWin.payout
      })),
      scatterCount,
      orbCount,
      baseWin,
      featureWin,
      totalWin,
      triggers: triggerFlags,
      gameVariantId: variant.id,
      freeGamesModifierId: variant.freeGamesModifierId,
      jackpotConfig: variant.jackpotConfig,
      orbTriggerConfig: variant.orbTriggerConfig,
      scatterTriggerConfig: variant.scatterTriggerConfig,
      holdAndSpinState,
      freeGamesState,
      bonusSessionRef,
      bonusPayload,
      signature: "",
      wallet,
      wager,
      jackpotLadder: jackpotSnapshotAfter,
      runtimeCapabilities,
      mathProfileVersion: {
        id: mathProfileVersion.id,
        profileKey: mathProfileVersion.profileKey,
        versionTag: mathProfileVersion.versionTag,
        reelSetId: mathProfileVersion.reelSetId
      }
    };

    const signature = signPayload(unsignedResult, app.signatureSecret);
    unsignedResult.signature = signature;

    app.db.commitSpinAtomic({
      spin: {
        id: spinId,
        sessionId: session.id,
        profileId: profile.id,
        bet: wager.totalBet,
        totalWin,
        payload: unsignedResult as unknown as Record<string, unknown>,
        wager,
        mathProfileVersionId: mathProfileVersion.id
      },
      walletDelta: {
        coinsDelta: totalWin - wager.totalBet,
        spinsDelta: 1,
        winsDelta: totalWin
      },
      sessionState: {
        ...(session.state ?? {}),
        lastSpinId: spinId,
        lastWager: wager,
        lastSpeedMode: wager.speedMode,
        runtimeMode: runtimeCapabilities.mode,
        mathProfileVersionId: mathProfileVersion.id,
        activeBonusSessionRef: bonusSessionRef,
        lastBonusSessionRef: bonusSessionRef
      },
      jackpotContributionBet: wager.totalBet,
      jackpotPayoutTiers: [...jackpotPayoutTierSet],
      ...(reservedBonusSession ? { bonusSession: reservedBonusSession } : {}),
      ...(jackpotEvents.length > 0 ? { jackpotEvents } : {})
    });

    if (bonusSessionRef) {
      app.eventBus.publish("bonus", {
        profileId: profile.id,
        sessionId: session.id,
        bonusSessionId: bonusSessionRef.id,
        bonusType: bonusSessionRef.type,
        status: bonusSessionRef.status,
        streamMode: "server-owned"
      });
    }

    return unsignedResult;
  });
};

export default spinRoutes;
