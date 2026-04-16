import assert from "node:assert/strict";
import test from "node:test";
import { createApp, registerApp } from "../src/index.js";
import { buildSseHeaders } from "../src/routes/events.js";

interface SpinApiResponse {
  spinId: string;
  sessionId: string;
  reels: string[][];
  triggers: {
    emberLock: boolean;
    freeQuest: boolean;
    jackpotTier?: string;
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
  bonusPayload: null;
  jackpotSnapshotBefore?: Record<string, number>;
  jackpotSnapshotAfter?: Record<string, number>;
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
    jackpotAwards: Array<{
      tier: string;
      amount: number;
      source: string;
    }>;
    progress: BonusSessionProgressApi;
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

const buildTestApp = async () => {
  const app = createApp({
    dbFilePath: ":memory:",
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
  coins = 5_000_000
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

const getBonusSnapshot = async (
  app: Awaited<ReturnType<typeof buildTestApp>>,
  bonusSessionId: string
): Promise<BonusSessionSnapshotResponse> => {
  const response = await app.inject({
    method: "GET",
    url: `/bonus/${bonusSessionId}`,
  });

  assert.equal(response.statusCode, 200);
  return response.json() as BonusSessionSnapshotResponse;
};

const findTriggeredBonus = async (
  app: Awaited<ReturnType<typeof buildTestApp>>,
  profileId: string,
  options: {
    desiredType?: string;
    requireActionable?: boolean;
    maxAttempts?: number;
  } = {}
): Promise<{ spin: SpinApiResponse; snapshot: BonusSessionSnapshotResponse }> => {
  const maxAttempts = options.maxAttempts ?? 2500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const sessionId = `bonus-session-${profileId}-${attempt}`;
    const response = await app.inject({
      method: "POST",
      url: "/spin",
      payload: {
        profileId,
        sessionId,
        bet: 50,
        linesMode: 20,
        clientNonce: `nonce-${profileId}-${attempt.toString().padStart(4, "0")}-authoritative`,
        volatility: "high",
      },
    });

    assert.equal(response.statusCode, 200);
    const spin = response.json() as SpinApiResponse;
    if (!spin.bonusSessionRef) {
      continue;
    }

    if (options.desiredType && spin.bonusSessionRef.type !== options.desiredType) {
      continue;
    }

    const snapshot = await getBonusSnapshot(app, spin.bonusSessionRef.id);
    const nextAction = snapshot.session.progress.nextAction;
    if (options.requireActionable && (!nextAction || nextAction === "CLAIM")) {
      continue;
    }

    return { spin, snapshot };
  }

  assert.fail(`Failed to trigger bonus${options.desiredType ? ` ${options.desiredType}` : ""} within budget`);
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

test("spin rejects replayed nonce", async () => {
  const app = await buildTestApp();

  try {
    await app.inject({
      method: "POST",
      url: "/profile",
      payload: {
        profileId: "p-spin-1",
        nickname: "Spinner",
        coins: 100_000,
      },
    });

    const payload = {
      profileId: "p-spin-1",
      sessionId: "s-spin-1",
      bet: 100,
      linesMode: 20,
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

test("spin emits triggerFlags and reserves authoritative bonus sessions", async () => {
  const app = await buildTestApp();

  try {
    await createTestProfile(app, "p-spin-v2-1", 500_000);

    const response = await app.inject({
      method: "POST",
      url: "/spin",
      payload: {
        profileId: "p-spin-v2-1",
        sessionId: "s-spin-v2-1",
        bet: 100,
        linesMode: 20,
        clientNonce: "nonce-v2-spin-compat-0001",
        volatility: "high",
      },
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json() as SpinApiResponse;

    assert.equal(typeof payload.triggers.emberLock, "boolean");
    assert.equal(typeof payload.triggers.freeQuest, "boolean");
    assert.equal(typeof payload.triggerFlags.emberRespin, "boolean");
    assert.equal(typeof payload.triggerFlags.wheelAscension, "boolean");
    assert.equal(typeof payload.triggerFlags.relicVaultPick, "boolean");
    assert.equal(typeof payload.triggerFlags.freeQuest, "boolean");

    const flat = payload.reels.flat();
    const orbCount = flat.filter((symbol) => symbol === "ORB").length;
    const scatterCount = flat.filter((symbol) => symbol === "SCATTER").length;
    const dragonCount = flat.filter((symbol) => symbol === "DRAGON").length;
    const wildCount = flat.filter((symbol) => symbol === "WILD").length;

    assert.equal(payload.triggerFlags.emberRespin, orbCount >= 6);
    assert.equal(payload.triggerFlags.wheelAscension, scatterCount >= 4 && dragonCount >= 1);
    assert.equal(
      payload.triggerFlags.relicVaultPick,
      dragonCount >= 4 && wildCount >= 2,
    );
    assert.equal(payload.triggerFlags.freeQuest, scatterCount >= 3);

    assert.equal(payload.triggers.emberLock, payload.triggerFlags.emberRespin);
    assert.equal(payload.triggers.freeQuest, payload.triggerFlags.freeQuest);

    assert.ok(payload.jackpotSnapshotBefore);
    assert.ok(payload.jackpotSnapshotAfter);
    assert.equal(payload.bonusPayload, null);

    for (const tier of ["ember", "relic", "mythic", "throne"]) {
      assert.equal(typeof payload.jackpotSnapshotBefore?.[tier], "number");
      assert.equal(typeof payload.jackpotSnapshotAfter?.[tier], "number");
    }

    if (payload.bonusSessionRef) {
      assert.match(payload.bonusSessionRef.type, /^(EMBER_RESPIN|WHEEL_ASCENSION|RELIC_VAULT_PICK)$/);
      assert.match(payload.bonusSessionRef.status, /^(PENDING|COMPLETED)$/);

      const snapshot = await getBonusSnapshot(app, payload.bonusSessionRef.id);
      assert.equal(snapshot.session.id, payload.bonusSessionRef.id);
      assert.equal(snapshot.session.sessionId, "s-spin-v2-1");
      assert.equal(snapshot.session.type, payload.bonusSessionRef.type);
      assert.equal(snapshot.actions[0]?.actionType, "START");
      assert.equal(snapshot.actions[0]?.ordinal, 1);

      for (const award of snapshot.session.jackpotAwards) {
        assert.equal(typeof award.tier, "string");
        assert.equal(typeof award.amount, "number");
        assert.equal(typeof award.source, "string");
        assert.equal(award.amount, payload.jackpotSnapshotBefore?.[award.tier]);
      }

      const activeResponse = await app.inject({
        method: "GET",
        url: `/bonus/session/${payload.sessionId}/active`,
      });

      assert.equal(activeResponse.statusCode, 200);
      const activeSnapshot = activeResponse.json() as BonusSessionSnapshotResponse;
      assert.equal(activeSnapshot.session.id, payload.bonusSessionRef.id);
    }

    assert.doesNotThrow(() => JSON.stringify(payload));
    assert.equal(typeof payload.signature, "string");
    assert.ok(payload.signature.length > 10);
  } finally {
    await app.close();
  }
});

test("spin can emit all three reel-triggered bonus payload types", async () => {
  const app = await buildTestApp();

  try {
    await createTestProfile(app, "p-spin-v2-2");

    const seenTypes = new Set<string>();

    for (let attempt = 0; attempt < 1200; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/spin",
        payload: {
          profileId: "p-spin-v2-2",
          sessionId: "s-spin-v2-2",
          bet: 50,
          linesMode: 20,
          clientNonce: `nonce-v2-bonus-${attempt.toString().padStart(4, "0")}-abcdef`,
          volatility: "high",
        },
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json() as SpinApiResponse;

      if (payload.bonusSessionRef) {
        seenTypes.add(payload.bonusSessionRef.type);
      }

      if (
        seenTypes.has("EMBER_RESPIN") &&
        seenTypes.has("WHEEL_ASCENSION") &&
        seenTypes.has("RELIC_VAULT_PICK")
      ) {
        break;
      }
    }

    assert.ok(seenTypes.has("EMBER_RESPIN"));
    assert.ok(seenTypes.has("WHEEL_ASCENSION"));
    assert.ok(seenTypes.has("RELIC_VAULT_PICK"));
  } finally {
    await app.close();
  }
});

test("bonus lifecycle routes journal actions, enforce sequencing, and credit claims", async () => {
  const app = await buildTestApp();

  try {
    const profileId = "p-bonus-life-1";
    await createTestProfile(app, profileId);

    const { spin, snapshot } = await findTriggeredBonus(app, profileId, {
      requireActionable: true,
    });

    assert.ok(spin.bonusSessionRef);
    assert.equal(snapshot.session.id, spin.bonusSessionRef?.id);
    assert.equal(snapshot.actions.length, 1);
    assert.equal(snapshot.actions[0]?.actionType, "START");

    const resumeResponse = await app.inject({
      method: "POST",
      url: `/bonus/${snapshot.session.id}/resume`,
    });

    assert.equal(resumeResponse.statusCode, 200);
    let current = resumeResponse.json() as BonusSessionSnapshotResponse;
    assert.equal(current.action?.actionType, "RESUME");
    assert.equal(current.action?.ordinal, 2);
    assert.match(current.session.status, /^(ACTIVE|COMPLETED)$/);

    if (!current.session.progress.completed) {
      const prematureClaimResponse = await app.inject({
        method: "POST",
        url: `/bonus/${snapshot.session.id}/claim`,
      });

      assert.equal(prematureClaimResponse.statusCode, 409);
    }

    const expectedAction = current.session.progress.nextAction;
    if (expectedAction && expectedAction !== "CLAIM") {
      const wrongAction =
        expectedAction === "RESPIN"
          ? "PICK"
          : expectedAction === "WHEEL_STOP"
            ? "RESPIN"
            : "WHEEL_STOP";

      const wrongActionResponse = await app.inject({
        method: "POST",
        url: `/bonus/${snapshot.session.id}/actions`,
        payload: {
          actionType: wrongAction,
        },
      });

      assert.equal(wrongActionResponse.statusCode, 409);
    }

    while (current.session.progress.nextAction && current.session.progress.nextAction !== "CLAIM") {
      const beforeOrdinal = current.actions[current.actions.length - 1]?.ordinal ?? 0;
      const actionType = current.session.progress.nextAction;
      const actionResponse = await app.inject({
        method: "POST",
        url: `/bonus/${snapshot.session.id}/actions`,
        payload: {
          actionType,
        },
      });

      assert.equal(actionResponse.statusCode, 200);
      current = actionResponse.json() as BonusSessionSnapshotResponse;
      assert.equal(current.action?.actionType, actionType);
      assert.equal(current.action?.ordinal, beforeOrdinal + 1);
    }

    assert.equal(current.session.progress.nextAction, "CLAIM");
    assert.equal(current.session.progress.completed, true);
    assert.equal(current.session.status, "COMPLETED");

    const walletBeforeClaim = app.db.getWallet(profileId);
    assert.ok(walletBeforeClaim);

    const claimResponse = await app.inject({
      method: "POST",
      url: `/bonus/${snapshot.session.id}/claim`,
    });

    assert.equal(claimResponse.statusCode, 200);
    const claimed = claimResponse.json() as BonusSessionSnapshotResponse;
    assert.equal(claimed.action?.actionType, "CLAIM");
    assert.equal(claimed.session.status, "CLAIMED");
    assert.equal(claimed.session.progress.claimed, true);
    assert.equal(claimed.session.progress.nextAction, null);
    assert.ok(claimed.wallet);
    assert.equal(
      claimed.wallet?.coins,
      (walletBeforeClaim?.coins ?? 0) + claimed.session.actualAward,
    );

    const postClaimSnapshot = await getBonusSnapshot(app, snapshot.session.id);
    assert.equal(postClaimSnapshot.session.status, "CLAIMED");
    assert.equal(postClaimSnapshot.actions.at(-1)?.actionType, "CLAIM");

    const activeAfterClaimResponse = await app.inject({
      method: "GET",
      url: `/bonus/session/${spin.sessionId}/active`,
    });

    assert.equal(activeAfterClaimResponse.statusCode, 404);

    const persistedSession = app.db.getSession(spin.sessionId);
    assert.ok(persistedSession);
    assert.deepEqual(
      (persistedSession?.state as { activeBonusSessionRef?: unknown }).activeBonusSessionRef,
      null,
    );
  } finally {
    await app.close();
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

    await app.inject({
      method: "POST",
      url: "/spin",
      payload: {
        profileId: "p-integrity-1",
        sessionId: "s-integrity-1",
        bet: 100,
        linesMode: 20,
        clientNonce: "nonce-integrity-100",
      },
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
