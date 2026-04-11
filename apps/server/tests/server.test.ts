import assert from "node:assert/strict";
import test from "node:test";
import { createApp, registerApp } from "../src/index.js";

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
