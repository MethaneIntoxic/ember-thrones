import { createApp, registerApp } from "../../apps/server/src/index.js";

type JackpotTier = "ember" | "relic" | "mythic" | "throne";
type BonusType = "EMBER_RESPIN" | "WHEEL_ASCENSION" | "RELIC_VAULT";

interface TriggerFlags {
  emberRespin?: boolean;
  wheelAscension?: boolean;
  relicVaultPick?: boolean;
  freeQuest?: boolean;
}

interface BonusJackpotAward {
  tier?: JackpotTier;
  amount?: number;
}

interface BonusPayload {
  type?: BonusType;
  jackpotAwards?: BonusJackpotAward[];
}

interface SpinResponse {
  totalWin?: number;
  triggerFlags?: TriggerFlags;
  bonusPayload?: BonusPayload | null;
}

interface CadenceReport {
  spins: number;
  bet: number;
  volatility: "low" | "medium" | "high";
  frequencies: {
    emberRespin: number;
    wheelAscension: number;
    relicVaultPick: number;
    freeQuest: number;
    anyBonus: number;
  };
  cadenceEverySpins: {
    emberRespin: number | null;
    wheelAscension: number | null;
    relicVaultPick: number | null;
    freeQuest: number | null;
    anyBonus: number | null;
  };
  bonusPayloadTypes: Record<BonusType, number>;
  jackpotTierHits: Record<JackpotTier, number>;
  avgWinPerSpin: number;
}

function parseArg(name: string, fallback: number): number {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!arg) {
    return fallback;
  }

  const value = Number(arg.slice(arg.indexOf("=") + 1));
  return Number.isFinite(value) ? value : fallback;
}

function parseVolatility(): "low" | "medium" | "high" {
  const arg = process.argv.find((entry) => entry.startsWith("--volatility="));
  const value = (arg ? arg.slice(arg.indexOf("=") + 1) : "medium").toLowerCase();

  if (value === "low" || value === "high") {
    return value;
  }

  return "medium";
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function freq(count: number, total: number): number {
  return total > 0 ? round(count / total) : 0;
}

function every(total: number, count: number): number | null {
  return count > 0 ? round(total / count) : null;
}

async function main(): Promise<void> {
  const spins = Math.max(1, Math.trunc(parseArg("spins", 100_000)));
  const bet = Math.max(1, Math.trunc(parseArg("bet", 25)));
  const seed = Math.max(1, Math.trunc(parseArg("seed", 42)));
  const volatility = parseVolatility();

  const app = createApp({
    dbFilePath: ":memory:",
    logger: false,
    signatureSecret: "sim-signature",
    replayTtlMs: 120_000
  });

  await registerApp(app);

  const profileId = `sim-profile-${seed}`;
  const sessionId = `sim-session-${seed}`;

  try {
    const createProfile = await app.inject({
      method: "POST",
      url: "/profile",
      payload: {
        profileId,
        nickname: "Sim Runner",
        coins: 1_000_000_000,
        gems: 0
      }
    });

    if (createProfile.statusCode !== 200) {
      throw new Error(`Failed to create profile: ${createProfile.statusCode}`);
    }

    let emberRespin = 0;
    let wheelAscension = 0;
    let relicVaultPick = 0;
    let freeQuest = 0;
    let anyBonus = 0;
    let totalWin = 0;

    const bonusPayloadTypes: Record<BonusType, number> = {
      EMBER_RESPIN: 0,
      WHEEL_ASCENSION: 0,
      RELIC_VAULT: 0
    };

    const jackpotTierHits: Record<JackpotTier, number> = {
      ember: 0,
      relic: 0,
      mythic: 0,
      throne: 0
    };

    for (let index = 0; index < spins; index += 1) {
      const nonce = `sim-${seed}-${index}`;
      const spin = await app.inject({
        method: "POST",
        url: "/spin",
        payload: {
          profileId,
          sessionId,
          bet,
          linesMode: 20,
          clientNonce: nonce,
          volatility
        }
      });

      if (spin.statusCode === 400) {
        await app.inject({
          method: "POST",
          url: `/wallet/${profileId}`,
          payload: { coinsDelta: 1_000_000_000 }
        });
        continue;
      }

      if (spin.statusCode !== 200) {
        throw new Error(`Spin failed at index ${index} with status ${spin.statusCode}`);
      }

      const payload = spin.json() as SpinResponse;
      totalWin += typeof payload.totalWin === "number" ? payload.totalWin : 0;

      const flags = payload.triggerFlags ?? {};
      const hasEmber = Boolean(flags.emberRespin);
      const hasWheel = Boolean(flags.wheelAscension);
      const hasVault = Boolean(flags.relicVaultPick);
      const hasQuest = Boolean(flags.freeQuest);

      if (hasEmber) {
        emberRespin += 1;
      }
      if (hasWheel) {
        wheelAscension += 1;
      }
      if (hasVault) {
        relicVaultPick += 1;
      }
      if (hasQuest) {
        freeQuest += 1;
      }

      if (hasEmber || hasWheel || hasVault) {
        anyBonus += 1;
      }

      const bonusPayload = payload.bonusPayload;
      if (bonusPayload && bonusPayload.type) {
        bonusPayloadTypes[bonusPayload.type] += 1;

        for (const award of bonusPayload.jackpotAwards ?? []) {
          if (award.tier) {
            jackpotTierHits[award.tier] += 1;
          }
        }
      }
    }

    const report: CadenceReport = {
      spins,
      bet,
      volatility,
      frequencies: {
        emberRespin: freq(emberRespin, spins),
        wheelAscension: freq(wheelAscension, spins),
        relicVaultPick: freq(relicVaultPick, spins),
        freeQuest: freq(freeQuest, spins),
        anyBonus: freq(anyBonus, spins)
      },
      cadenceEverySpins: {
        emberRespin: every(spins, emberRespin),
        wheelAscension: every(spins, wheelAscension),
        relicVaultPick: every(spins, relicVaultPick),
        freeQuest: every(spins, freeQuest),
        anyBonus: every(spins, anyBonus)
      },
      bonusPayloadTypes,
      jackpotTierHits,
      avgWinPerSpin: round(totalWin / spins)
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await app.close();
  }
}

void main();
