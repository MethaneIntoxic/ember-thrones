import { createSeededRng } from "../rng";
import type { JackpotTier } from "./emberLock";
import type {
  RelicVaultBoardSlot as RelicVaultBoardSlotContract,
  RelicVaultHidden as RelicVaultHiddenContract,
  RelicVaultPickSession as RelicVaultPickSessionContract
} from "../../contracts/api";

export type RelicVaultHidden = RelicVaultHiddenContract;

export type RelicVaultBoardSlot = RelicVaultBoardSlotContract;

export type RelicVaultPickSession = RelicVaultPickSessionContract;
export type VaultPickSession = RelicVaultPickSession;

export interface ResolveRelicVaultPickInput {
  seed: number | string;
  bet: number;
  keyCount?: number;
}

export type ResolveVaultPickInput = ResolveRelicVaultPickInput;

type VaultToken =
  | { hidden: "coin"; value: number }
  | { hidden: "multiplier"; value: number }
  | { hidden: "jackpotTier"; value: JackpotTier }
  | { hidden: "bustShield"; value: number };

function roundCoins(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clampInt(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, normalized));
}

function pickFeaturedTier(seed: number | string): JackpotTier {
  const rng = createSeededRng(`${seed}:vault-tier`);
  const roll = rng.nextFloat();

  if (roll < 0.58) {
    return "ember";
  }

  if (roll < 0.84) {
    return "relic";
  }

  if (roll < 0.97) {
    return "mythic";
  }

  return "throne";
}

function buildTokenDeck(featuredTier: JackpotTier): VaultToken[] {
  return [
    { hidden: "coin", value: 0.55 },
    { hidden: "coin", value: 0.8 },
    { hidden: "coin", value: 1.05 },
    { hidden: "coin", value: 1.4 },
    { hidden: "coin", value: 1.9 },
    { hidden: "multiplier", value: 1.4 },
    { hidden: "multiplier", value: 1.8 },
    { hidden: "jackpotTier", value: featuredTier },
    { hidden: "jackpotTier", value: featuredTier },
    { hidden: "jackpotTier", value: featuredTier },
    { hidden: "bustShield", value: 0.25 },
    { hidden: "bustShield", value: 0.4 }
  ];
}

function shuffleTokens(seed: number | string, tokens: VaultToken[]): VaultToken[] {
  const rng = createSeededRng(`${seed}:vault-board`);
  const deck = [...tokens];

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(index + 1);
    const current = deck[index] as VaultToken;
    deck[index] = deck[swapIndex] as VaultToken;
    deck[swapIndex] = current;
  }

  return deck;
}

function tokenToSlot(token: VaultToken, slotId: string): RelicVaultBoardSlot {
  return {
    slotId,
    hidden: token.hidden,
    value: token.value
  };
}

export function resolveRelicVaultPick(input: ResolveRelicVaultPickInput): RelicVaultPickSession {
  if (!Number.isFinite(input.bet) || input.bet <= 0) {
    throw new Error("bet must be positive");
  }

  const rng = createSeededRng(`${input.seed}:vault-run`);
  const featuredTier = pickFeaturedTier(input.seed);
  const deck = shuffleTokens(input.seed, buildTokenDeck(featuredTier));
  const board = deck.map((token, index) => tokenToSlot(token, `slot-${index + 1}`));

  const keyCount =
    input.keyCount === undefined ? 3 + rng.nextInt(3) : clampInt(input.keyCount, 1, 5);
  const picksAllowed = Math.min(keyCount, board.length);

  const revealed: string[] = [];
  const remaining = new Set<number>(board.map((_, index) => index));
  const jackpotMatchCounts: Record<JackpotTier, number> = {
    ember: 0,
    relic: 0,
    mythic: 0,
    throne: 0
  };

  const jackpotTierHits: JackpotTier[] = [];
  let baseAward = 0;
  let runningMultiplier = 1;

  const pickIndex = (mustAvoidBustShield: boolean): number | null => {
    const candidates = [...remaining].filter((index) => {
      if (!mustAvoidBustShield) {
        return true;
      }

      const slot = board[index];
      return slot?.hidden !== "bustShield";
    });

    const pool = candidates.length > 0 ? candidates : [...remaining];
    if (pool.length === 0) {
      return null;
    }

    return pool[rng.nextInt(pool.length)] as number;
  };

  for (let pick = 0; pick < picksAllowed; pick += 1) {
    const selected = pickIndex(pick === 0);
    if (selected === null) {
      break;
    }

    remaining.delete(selected);

    const slot = board[selected] as RelicVaultBoardSlot;
    revealed.push(slot.slotId);

    if (slot.hidden === "coin" || slot.hidden === "bustShield") {
      const value = typeof slot.value === "number" ? slot.value : 0;
      baseAward = roundCoins(baseAward + input.bet * value);
      continue;
    }

    if (slot.hidden === "multiplier") {
      const value = typeof slot.value === "number" ? slot.value : 1;
      runningMultiplier = roundCoins(runningMultiplier * Math.max(1, value));
      continue;
    }

    if (slot.hidden === "jackpotTier" && typeof slot.value === "string") {
      const tier = slot.value as JackpotTier;
      jackpotMatchCounts[tier] += 1;

      if (jackpotMatchCounts[tier] >= 3 && !jackpotTierHits.includes(tier)) {
        jackpotTierHits.push(tier);
      }
    }
  }

  const finalAward = roundCoins(baseAward * runningMultiplier);

  return {
    type: "RELIC_VAULT_PICK",
    keyCount,
    board,
    picksAllowed,
    picksMade: revealed.length,
    revealed,
    guaranteedNonBustFirstPick: true,
    jackpotTierHits,
    finalAward
  };
}

export const resolveVaultPick = resolveRelicVaultPick;
