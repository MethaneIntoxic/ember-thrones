import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createApp, registerApp } from "../src/index.js";
import { buildSseHeaders } from "../src/routes/events.js";

interface SpinApiResponse {
  spinId: string;
  sessionId: string;
  bet: number;
  linesMode: number;
  reels: string[][];
  wager: {
    denomination: number;
    creditsPerSpin: number;
    totalBet: number;
    isMaxBet: boolean;
    qualifiesForGrandJackpot: boolean;
    qualifiesForFeatureBoost: boolean;
    speedMode: string;
  };
  triggers: {
    holdAndSpin: boolean;
    freeSpins: boolean;
    wheel: boolean;
    progressiveEligible: boolean;
  };
  triggerFlags: {
    emberRespin: boolean;
    wheelAscension: boolean;
    relicVaultPick: boolean;
    freeQuest: boolean;
  };
  bonusState: Record<string, unknown>;
  bonusSessionRef: null | {
    id: string;
    type: string;
    status: string;
  };
  featureShell: null | {
    type: string;
    mode: string;
    nextAction: string;
    totalRounds: number;
    roundsRemaining: number;
    entryState: Record<string, unknown>;
  };
  bonusPayload: null;
  jackpotSnapshotBefore: Record<string, number>;
  jackpotSnapshotAfter: Record<string, number>;
  mathProfileVersion: {
    id: string;
    profileKey: string;
    versionTag: string;
    reelSetId: string;
  };
  runtimeCapabilities: {
    mode: string;
    supportsRealtimeEvents: boolean;
    supportsResumableBonuses: boolean;
    disclosureCopy: string;
  };
  signature: string;
}

interface BonusSessionProgressApi {
  type: string;
  completed: boolean;
  claimed: boolean;
  nextAction: string | null;
}

interface BonusSessionSnapshotResponse {
  session: {
    id: string;
    sessionId: string;
    profileId: string;
    type: string;
    status: string;
    expectedTotalAward: number;
    actualAward: number;
    progress: BonusSessionProgressApi & Record<string, unknown>;
    entrySnapshot: {
      type: string;
      mode: string;
      nextAction: string;
      totalRounds: number;
      roundsRemaining: number;
      entryState: Record<string, unknown>;
    };
    revealedJackpotAwards: Array<{
      tier: string;
      amount: number;
      source: string;
    }>;
    mathProfileVersionId: string;
  };
  action?: {
    actionType: string;
    ordinal: number;
  };
  actions: Array<{
    actionType: string;
    ordinal: number;
    requestPayload: Record<string, unknown>;
    resultPayload: Record<string, unknown>;
  }>;
  wallet?: {
    coins: number;
    gems: number;
    lifetimeSpins: number;
    lifetimeWins: number;
  };
}

const typedStepRouteByType: Record<string, string> = {
  EMBER_RESPIN: "hold-and-spin/step",
  FREE_SPINS: "free-spins/step",
  WHEEL_ASCENSION: "wheel/step",
  RELIC_VAULT_PICK: "actions",
};

const buildTestApp = async (options: { dbFilePath?: string } = {}) => {
  const app = createApp({
    dbFilePath: options.dbFilePath ?? ":memory:",
    logger: false,
    signatureSecret: "test-signature-secret",
    replayTtlMs: 60_000,
  });

  await registerApp(app);
  return app;
};

const createTestProfile = async (
  app: Awaited<ReturnType<typeof buildTestApp>>,
  profileId: string,
  coins = 5_000_000,
): Promise<void> => {
  const response = await app.inject({
    method: "POST",
    url: "/profile",
    payload: {
      profileId,
      nickname: `Profile ${profileId}`,
      coins,
    },
  });

  assert.equal(response.statusCode, 200);
};

const spinWithWager = async (
  app: Awaited<ReturnType<typeof buildTestApp>>,
  options: {
    profileId: string;
    sessionId: string;
    denomination?: number;
    creditsPerSpin?: number;
    speedMode?: "normal" | "turbo" | "auto";
    clientNonce: string;
    volatility?: "low" | "medium" | "high";
  },
): Promise<SpinApiResponse> => {
  const response = await app.inject({
    method: "POST",
    url: "/spin",
    payload: {
      profileId: options.profileId,
      sessionId: options.sessionId,
      denomination: options.denomination ?? 1,
      creditsPerSpin: options.creditsPerSpin ?? 50,
      speedMode: options.speedMode ?? "normal",
      clientNonce: options.clientNonce,
      volatility: options.volatility ?? "high",
    },
  });

  assert.equal(response.statusCode, 200);
  return response.json() as SpinApiResponse;
};

const getBonusSnapshot = async (
  app: Awaited<ReturnType<typeof buildTestApp>>,
  bonusSessionId: string,
): Promise<BonusSessionSnapshotResponse> => {
  const response = await app.inject({
    method: "GET",
    url: `/bonus/${bonusSessionId}`,
  });

  assert.equal(response.statusCode, 200);
  return response.json() as BonusSessionSnapshotResponse;
};

const spinUntilFeature = async (
  app: Awaited<ReturnType<typeof buildTestApp>>,
  profileId: string,
  desiredType: string,
  options: {
    denomination?: number;
    creditsPerSpin?: number;
    maxAttempts?: number;
  } = {},
): Promise<{ spin: SpinApiResponse; snapshot: BonusSessionSnapshotResponse }> => {
  const maxAttempts = options.maxAttempts ?? 2500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const spin = await spinWithWager(app, {
      profileId,
      sessionId: `feature-${profileId}-${desiredType}-${attempt}`,
      denomination: options.denomination ?? 1,
      creditsPerSpin: options.creditsPerSpin ?? 50,
      clientNonce: `nonce-${profileId}-${desiredType}-${attempt.toString().padStart(4, "0")}`,
      volatility: "high",
    });

    if (!spin.bonusSessionRef || spin.bonusSessionRef.type !== desiredType) {
      continue;
    }

    const snapshot = await getBonusSnapshot(app, spin.bonusSessionRef.id);
    return { spin, snapshot };
  }

  assert.fail(`Failed to trigger ${desiredType} within ${maxAttempts} attempts`);
};

const resolveBonusToClaim = async (
  app: Awaited<ReturnType<typeof buildTestApp>>,
  snapshot: BonusSessionSnapshotResponse,
): Promise<BonusSessionSnapshotResponse> => {
  const resumeResponse = await app.inject({
    method: "POST",
    url: `/bonus/${snapshot.session.id}/resume`,
  });

  assert.equal(resumeResponse.statusCode, 200);
  let current = resumeResponse.json() as BonusSessionSnapshotResponse;

  while (current.session.progress.nextAction && current.session.progress.nextAction !== "CLAIM") {
    const route = typedStepRouteByType[current.session.type] ?? "actions";
    const actionResponse = await app.inject({
      method: "POST",
      url: `/bonus/${current.session.id}/${route}`,
      ...(route === "actions"
        ? {
            payload: {
              actionType: current.session.progress.nextAction,
            },
          }
        : {}),
    });

    assert.equal(actionResponse.statusCode, 200);
    current = actionResponse.json() as BonusSessionSnapshotResponse;
  }

  const claimResponse = await app.inject({
    method: "POST",
    url: `/bonus/${current.session.id}/claim`,
  });

  assert.equal(claimResponse.statusCode, 200);
  return claimResponse.json() as BonusSessionSnapshotResponse;
};

test("profile lifecycle endpoints create and fetch wallets", async () => {
  const app = await buildTestApp();

  try {
    const createResponse = await app.inject({
      method: "POST",
      url: "/profile",
      payload: {
        profileId: "p-test-1",
        nickname: "Test Rider",
        coins: 2_500,
      },
    });

    assert.equal(createResponse.statusCode, 200);
    const createdPayload = createResponse.json() as { profile: { id: string } };
    assert.equal(createdPayload.profile.id, "p-test-1");

    const walletResponse = await app.inject({
      method: "GET",
      url: "/wallet/p-test-1",
    });

    assert.equal(walletResponse.statusCode, 200);
    const walletPayload = walletResponse.json() as { wallet: { coins: number } };
    assert.equal(walletPayload.wallet.coins, 2_500);
  } finally {
    await app.close();
  }
});

test("event stream headers preserve origin for browser EventSource clients", () => {
  const headers = buildSseHeaders("http://127.0.0.1:5173");

  assert.equal(headers["Content-Type"], "text/event-stream");
  assert.equal(headers["Access-Control-Allow-Origin"], "http://127.0.0.1:5173");
  assert.equal(headers.Vary, "Origin");

  const defaultHeaders = buildSseHeaders();
  assert.equal(defaultHeaders["Access-Control-Allow-Origin"], "*");
});

test("config publishes wager ladders, max-bet rules, speed modes, and connected runtime honesty", async () => {
  const app = await buildTestApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/config",
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as Record<string, unknown>;

    assert.deepEqual(payload.geometry, { reels: 5, rows: 3, paylines: 50 });
    assert.deepEqual(payload.denominationLadder, [1, 2, 5, 10, 20, 50, 100]);
    assert.deepEqual(payload.creditsPerSpinOptions, [25, 50, 75, 100]);
    assert.deepEqual(payload.supportedSpeedModes, ["normal", "turbo", "auto"]);
    assert.deepEqual(payload.supportedBonusTypes, ["EMBER_RESPIN", "FREE_SPINS", "WHEEL_ASCENSION"]);

    const maxBetQualification = payload.maxBetQualification as {
      requiresMaxBetForGrand: boolean;
      maxBetCreditsPerSpin: number;
      rules: Array<{ id: string }>;
    };
    assert.equal(maxBetQualification.requiresMaxBetForGrand, true);
    assert.equal(maxBetQualification.maxBetCreditsPerSpin, 100);
    assert.ok(maxBetQualification.rules.some((rule) => rule.id === "grand_jackpot"));

    const runtimeCapabilities = payload.runtimeCapabilities as {
      mode: string;
      supportsRealtimeEvents: boolean;
      supportsResumableBonuses: boolean;
      disclosureCopy: string;
    };
    assert.equal(runtimeCapabilities.mode, "connected");
    assert.equal(runtimeCapabilities.supportsRealtimeEvents, true);
    assert.equal(runtimeCapabilities.supportsResumableBonuses, true);
    assert.match(runtimeCapabilities.disclosureCopy, /authoritative server/i);
    assert.match(runtimeCapabilities.disclosureCopy, /disabled/i);
    assert.equal(payload.localOnly, false);
  } finally {
    await app.close();
  }
});

test("spin rejects replayed nonce", async () => {
  const app = await buildTestApp();

  try {
    await createTestProfile(app, "p-spin-1", 100_000);

    const payload = {
      profileId: "p-spin-1",
      sessionId: "s-spin-1",
      denomination: 1,
      creditsPerSpin: 50,
      clientNonce: "nonce-abc-12345",
      volatility: "medium",
    };

    const firstResponse = await app.inject({
      method: "POST",
      url: "/spin",
      payload,
    });

    assert.equal(firstResponse.statusCode, 200);

    const replayResponse = await app.inject({
      method: "POST",
      url: "/spin",
      payload,
    });

    assert.equal(replayResponse.statusCode, 409);
  } finally {
    await app.close();
  }
});

test("spin returns wager semantics, fixed payline mode, and server-owned feature shells", async () => {
  const app = await buildTestApp();

  try {
    await createTestProfile(app, "p-spin-v3-1", 500_000);

    const payload = await spinWithWager(app, {
      profileId: "p-spin-v3-1",
      sessionId: "s-spin-v3-1",
      denomination: 1,
      creditsPerSpin: 50,
      speedMode: "turbo",
      clientNonce: "nonce-v3-spin-0001",
      volatility: "high",
    });

    assert.equal(payload.bet, 50);
    assert.equal(payload.linesMode, 50);
    assert.equal(payload.wager.denomination, 1);
    assert.equal(payload.wager.creditsPerSpin, 50);
    assert.equal(payload.wager.totalBet, 50);
    assert.equal(payload.wager.isMaxBet, false);
    assert.equal(payload.wager.qualifiesForGrandJackpot, false);
    assert.equal(payload.wager.speedMode, "turbo");
    assert.equal(payload.triggers.progressiveEligible, false);
    assert.equal(payload.bonusPayload, null);
    assert.equal(payload.runtimeCapabilities.mode, "connected");
    assert.equal(payload.mathProfileVersion.id.length > 0, true);
    assert.equal(typeof payload.signature, "string");
    assert.equal(payload.signature.length > 10, true);

    const flat = payload.reels.flat();
    const orbCount = flat.filter((symbol) => symbol === "ORB").length;
    const scatterCount = flat.filter((symbol) => symbol === "SCATTER").length;
    const dragonCount = flat.filter((symbol) => symbol === "DRAGON").length;

    assert.equal(payload.triggerFlags.emberRespin, orbCount >= 6);
    assert.equal(payload.triggerFlags.wheelAscension, scatterCount >= 4 && dragonCount >= 1);
    assert.equal(payload.triggerFlags.freeQuest, scatterCount >= 3);
    assert.equal(payload.triggerFlags.relicVaultPick, false);

    if (payload.bonusSessionRef) {
      assert.equal(payload.featureShell?.type, payload.bonusSessionRef.type);
      assert.equal(payload.featureShell?.mode, "server-owned");
      const snapshot = await getBonusSnapshot(app, payload.bonusSessionRef.id);
      assert.equal(snapshot.session.id, payload.bonusSessionRef.id);
      assert.equal(snapshot.session.type, payload.bonusSessionRef.type);
      assert.equal(Object.prototype.hasOwnProperty.call(snapshot.session as object, "outcome"), false);
      assert.equal(snapshot.session.entrySnapshot.mode, "server-owned");
      assert.equal(snapshot.actions[0]?.actionType, "START");
    }
  } finally {
    await app.close();
  }
});

test("spin surfaces max-bet qualification and blocks same-session spins while a streamed bonus is active", async () => {
  const app = await buildTestApp();

  try {
    const profileId = "p-max-bet-1";
    await createTestProfile(app, profileId, 1_000_000);

    const regularSpin = await spinWithWager(app, {
      profileId,
      sessionId: "s-max-bet-regular",
      denomination: 1,
      creditsPerSpin: 50,
      clientNonce: "nonce-max-bet-regular",
    });
    assert.equal(regularSpin.wager.qualifiesForGrandJackpot, false);
    assert.equal(regularSpin.triggers.progressiveEligible, false);

    const maxBetSpin = await spinWithWager(app, {
      profileId,
      sessionId: "s-max-bet-high",
      denomination: 1,
      creditsPerSpin: 100,
      clientNonce: "nonce-max-bet-high",
    });
    assert.equal(maxBetSpin.wager.isMaxBet, true);
    assert.equal(maxBetSpin.wager.qualifiesForGrandJackpot, true);
    assert.equal(maxBetSpin.triggers.progressiveEligible, true);

    const { spin } = await spinUntilFeature(app, profileId, "FREE_SPINS", {
      denomination: 1,
      creditsPerSpin: 50,
      maxAttempts: 1500,
    });

    const blockedSpin = await app.inject({
      method: "POST",
      url: "/spin",
      payload: {
        profileId,
        sessionId: spin.sessionId,
        denomination: 1,
        creditsPerSpin: 50,
        clientNonce: "nonce-blocked-while-bonus-active",
        volatility: "high",
      },
    });

    assert.equal(blockedSpin.statusCode, 409);
    const blockedPayload = blockedSpin.json() as { activeBonusSessionRef?: { id: string } };
    assert.equal(blockedPayload.activeBonusSessionRef?.id, spin.bonusSessionRef?.id);
  } finally {
    await app.close();
  }
});

test("streamed bonus routes resolve hold-and-spin, free-spins, and wheel sessions end-to-end", async () => {
  const app = await buildTestApp();

  try {
    const profileId = "p-streamed-1";
    await createTestProfile(app, profileId);

    for (const bonusType of ["EMBER_RESPIN", "FREE_SPINS", "WHEEL_ASCENSION"]) {
      const { spin, snapshot } = await spinUntilFeature(app, profileId, bonusType, {
        denomination: 1,
        creditsPerSpin: bonusType === "WHEEL_ASCENSION" ? 100 : 50,
      });

      assert.ok(spin.bonusSessionRef);
      assert.equal(snapshot.session.id, spin.bonusSessionRef?.id);
      assert.equal(snapshot.actions[0]?.actionType, "START");
      assert.equal(snapshot.session.entrySnapshot.type, bonusType);

      const claimed = await resolveBonusToClaim(app, snapshot);
      assert.equal(claimed.session.status, "CLAIMED");
      assert.equal(claimed.session.progress.claimed, true);
      assert.equal(claimed.session.progress.nextAction, null);
      assert.ok(claimed.wallet);

      const postClaim = await getBonusSnapshot(app, snapshot.session.id);
      assert.equal(postClaim.session.status, "CLAIMED");
      assert.equal(postClaim.actions.at(-1)?.actionType, "CLAIM");

      const activeAfterClaimResponse = await app.inject({
        method: "GET",
        url: `/bonus/session/${spin.sessionId}/active`,
      });

      assert.equal(activeAfterClaimResponse.statusCode, 404);
    }
  } finally {
    await app.close();
  }
});

test("bonus sessions survive app restart and can resume from persisted storage", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "dragon-link-server-test-"));
  const dbFilePath = join(tempDir, "server.sqlite");
  let app = await buildTestApp({ dbFilePath });

  try {
    const profileId = "p-recovery-1";
    await createTestProfile(app, profileId, 1_000_000);

    const { spin, snapshot } = await spinUntilFeature(app, profileId, "FREE_SPINS", {
      denomination: 1,
      creditsPerSpin: 50,
      maxAttempts: 1500,
    });

    assert.equal(snapshot.session.status, "PENDING");
    await app.close();

    app = await buildTestApp({ dbFilePath });

    const activeResponse = await app.inject({
      method: "GET",
      url: `/bonus/session/${spin.sessionId}/active`,
    });

    assert.equal(activeResponse.statusCode, 200);
    const activeSnapshot = activeResponse.json() as BonusSessionSnapshotResponse;
    assert.equal(activeSnapshot.session.id, spin.bonusSessionRef?.id);
    assert.equal(activeSnapshot.session.type, "FREE_SPINS");

    const resumeResponse = await app.inject({
      method: "POST",
      url: `/bonus/${activeSnapshot.session.id}/resume`,
    });

    assert.equal(resumeResponse.statusCode, 200);
    const resumed = resumeResponse.json() as BonusSessionSnapshotResponse;
    assert.match(resumed.session.status, /^(ACTIVE|COMPLETED)$/);
    assert.equal(resumed.session.mathProfileVersionId.length > 0, true);
  } finally {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("server boot migrates legacy sqlite files before creating dependent indexes", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "dragon-link-legacy-db-"));
  const dbFilePath = join(tempDir, "legacy.sqlite");

  const legacyDb = new Database(dbFilePath);

  try {
    legacyDb.exec(`
      CREATE TABLE profiles (
        id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        xp INTEGER NOT NULL DEFAULT 0,
        coins INTEGER NOT NULL DEFAULT 50000,
        gems INTEGER NOT NULL DEFAULT 0,
        lifetime_spins INTEGER NOT NULL DEFAULT 0,
        lifetime_wins INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        volatility TEXT NOT NULL DEFAULT 'medium',
        state_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(profile_id) REFERENCES profiles(id)
      );

      CREATE TABLE spins (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        bet INTEGER NOT NULL,
        total_win INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id),
        FOREIGN KEY(profile_id) REFERENCES profiles(id)
      );

      CREATE TABLE jackpots (
        tier TEXT PRIMARY KEY,
        amount INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE bonus_sessions (
        id TEXT PRIMARY KEY,
        spin_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        reveal_seed TEXT NOT NULL,
        expected_total_award REAL NOT NULL,
        actual_award REAL NOT NULL DEFAULT 0,
        jackpot_tiers_json TEXT NOT NULL,
        jackpot_awards_json TEXT NOT NULL,
        outcome_json TEXT NOT NULL,
        progress_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        claimed_at TEXT,
        FOREIGN KEY(spin_id) REFERENCES spins(id),
        FOREIGN KEY(session_id) REFERENCES sessions(id),
        FOREIGN KEY(profile_id) REFERENCES profiles(id)
      );

      CREATE TABLE bonus_actions (
        id TEXT PRIMARY KEY,
        bonus_session_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        request_payload_json TEXT NOT NULL,
        result_payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(bonus_session_id) REFERENCES bonus_sessions(id)
      );
    `);
  } finally {
    legacyDb.close();
  }

  const app = await buildTestApp({ dbFilePath });

  try {
    const payload = await spinWithWager(app, {
      profileId: "p-legacy-1",
      sessionId: "s-legacy-1",
      denomination: 1,
      creditsPerSpin: 50,
      clientNonce: "nonce-legacy-migration-1",
      volatility: "medium",
    });

    assert.ok(payload.spinId);
    assert.equal(payload.linesMode, 50);
    assert.equal(payload.wager.totalBet, 50);
    assert.equal(payload.mathProfileVersion.id.length > 0, true);
  } finally {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("integrity endpoint returns checksum for profile session state", async () => {
  const app = await buildTestApp();

  try {
    await app.inject({
      method: "POST",
      url: "/profile",
      payload: {
        profileId: "p-integrity-1",
        nickname: "Integrity Tester",
        coins: 10_000,
      },
    });

    await spinWithWager(app, {
      profileId: "p-integrity-1",
      sessionId: "s-integrity-1",
      denomination: 1,
      creditsPerSpin: 50,
      clientNonce: "nonce-integrity-100",
      volatility: "medium",
    });

    const response = await app.inject({
      method: "GET",
      url: "/integrity/p-integrity-1/s-integrity-1",
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as { checksum?: string; wallet?: { coins: number } };
    assert.ok(payload.checksum);
    assert.ok(payload.wallet);
    assert.equal(typeof payload.checksum, "string");
  } finally {
    await app.close();
  }
});

