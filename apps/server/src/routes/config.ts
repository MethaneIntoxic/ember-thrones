import type { FastifyPluginAsync } from "fastify";

const configRoutes: FastifyPluginAsync = async (app) => {
  app.get("/config", async () => {
    const jackpotRows = app.db.getJackpots();
    const jackpotLadder = jackpotRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.tier] = row.amount;
      return acc;
    }, {});

    return {
      minBet: 10,
      maxBet: 500,
      defaultBet: 25,
      volatilityDefault: "medium",
      cadenceTargets: {
        emberLock: {
          spinsPerTriggerMin: 50,
          spinsPerTriggerMax: 60,
        },
        freeQuest: {
          spinsPerTriggerMin: 80,
          spinsPerTriggerMax: 140,
        },
        retriggerChance: {
          min: 0.15,
          max: 0.25,
        },
      },
      styleGateConfig: {
        mandatory: [
          "ember_lock_primary_excitement",
          "jackpot_ladder_always_visible",
          "free_quest_secondary_loop",
          "medium_volatility_profile",
        ],
        jackpotTiers: ["ember", "relic", "mythic", "throne"],
        mediumVolatility: {
          lineWinWeight: 0.62,
          featureWeight: 0.26,
          jackpotWeight: 0.12,
        },
      },
      jackpotLadder,
      localOnly: true,
    };
  });
};

export default configRoutes;
