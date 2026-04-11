import assert from "node:assert/strict";
import test from "node:test";
import { createApp, registerApp } from "../src/index.js";

interface SpinApiResponse {
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
  bonusPayload:
    | null
    | {
        type: string;
        sessionId: string;
        revealSeed: string;
        precomputedOutcome: Record<string, unknown>;
        expectedTotalAward: number;
        jackpotAwards: Array<{
          tier: string;
          amount: number;
          source: string;
        }>;
      };
  jackpotSnapshotBefore?: Record<string, number>;
  jackpotSnapshotAfter?: Record<string, number>;
  signature: string;
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

test("spin emits triggerFlags/bonusPayload and preserves legacy trigger compatibility", async () => {
  const app = await buildTestApp();

  try {
    await app.inject({
      method: "POST",
      url: "/profile",
      payload: {
        profileId: "p-spin-v2-1",
        nickname: "V2 Spinner",
        coins: 500_000,
      },
    });

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

    for (const tier of ["ember", "relic", "mythic", "throne"]) {
      assert.equal(typeof payload.jackpotSnapshotBefore?.[tier], "number");
      assert.equal(typeof payload.jackpotSnapshotAfter?.[tier], "number");
    }

    if (payload.bonusPayload) {
      assert.match(payload.bonusPayload.type, /^(EMBER_RESPIN|WHEEL_ASCENSION|RELIC_VAULT)$/);
      assert.equal(payload.bonusPayload.sessionId, "s-spin-v2-1");
      assert.equal(typeof payload.bonusPayload.revealSeed, "string");
      assert.ok(payload.bonusPayload.revealSeed.length >= 16);
      assert.equal(typeof payload.bonusPayload.expectedTotalAward, "number");

      for (const award of payload.bonusPayload.jackpotAwards) {
        assert.equal(typeof award.tier, "string");
        assert.equal(typeof award.amount, "number");
        assert.equal(typeof award.source, "string");
        assert.equal(award.amount, payload.jackpotSnapshotBefore?.[award.tier]);
      }
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
    await app.inject({
      method: "POST",
      url: "/profile",
      payload: {
        profileId: "p-spin-v2-2",
        nickname: "V2 Bonus Hunter",
        coins: 5_000_000,
      },
    });

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

      if (payload.bonusPayload) {
        seenTypes.add(payload.bonusPayload.type);
      }

      if (
        seenTypes.has("EMBER_RESPIN") &&
        seenTypes.has("WHEEL_ASCENSION") &&
        seenTypes.has("RELIC_VAULT")
      ) {
        break;
      }
    }

    assert.ok(seenTypes.has("EMBER_RESPIN"));
    assert.ok(seenTypes.has("WHEEL_ASCENSION"));
    assert.ok(seenTypes.has("RELIC_VAULT"));
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
