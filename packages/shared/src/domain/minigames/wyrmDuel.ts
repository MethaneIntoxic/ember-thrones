import { createSeededRng } from "../rng";
import type { JackpotTier } from "../features/emberLock";

export type WyrmMove = "strike" | "guard" | "charge";

export interface WyrmDuelInput {
  seed: number | string;
  bet: number;
  moves: WyrmMove[];
}

export interface WyrmRoundResult {
  round: number;
  playerMove: WyrmMove;
  wyrmMove: WyrmMove;
  outcome: "win" | "loss" | "draw";
  scoreAfterRound: number;
}

export interface WyrmDuelResult {
  score: number;
  roundsPlayed: number;
  finalMultiplier: number;
  tier: JackpotTier;
  totalReward: number;
  rounds: WyrmRoundResult[];
}

const ALL_MOVES: readonly WyrmMove[] = ["strike", "guard", "charge"] as const;

function roundCoins(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function resolveMoveOutcome(player: WyrmMove, enemy: WyrmMove): -1 | 0 | 1 {
  if (player === enemy) {
    return 0;
  }

  if (
    (player === "strike" && enemy === "charge") ||
    (player === "guard" && enemy === "strike") ||
    (player === "charge" && enemy === "guard")
  ) {
    return 1;
  }

  return -1;
}

function scoreToMultiplier(score: number, undefeatedBonus: number): number {
  if (score <= -2) {
    return 0.4;
  }

  if (score === -1) {
    return 0.8;
  }

  if (score === 0) {
    return 1.2;
  }

  if (score === 1) {
    return 1.8 + undefeatedBonus;
  }

  if (score === 2) {
    return 2.9 + undefeatedBonus;
  }

  return 4.8 + undefeatedBonus;
}

function classifyTier(multiplier: number): JackpotTier {
  if (multiplier < 1.5) {
    return "ember";
  }

  if (multiplier < 3) {
    return "relic";
  }

  if (multiplier < 5) {
    return "mythic";
  }

  return "throne";
}

function normalizeMoves(moves: WyrmMove[]): WyrmMove[] {
  if (moves.length === 0) {
    return ["strike", "guard", "charge"];
  }

  return moves.slice(0, 5).map((move) => {
    if (move === "guard" || move === "charge") {
      return move;
    }

    return "strike";
  });
}

export function resolveWyrmDuel(input: WyrmDuelInput): WyrmDuelResult {
  const rng = createSeededRng(input.seed);
  const moves = normalizeMoves(input.moves);

  let score = 0;
  let losses = 0;
  const rounds: WyrmRoundResult[] = [];

  for (let round = 0; round < moves.length; round += 1) {
    const playerMove = moves[round] as WyrmMove;
    const wyrmMove = rng.pick(ALL_MOVES);
    const outcomeScore = resolveMoveOutcome(playerMove, wyrmMove);

    if (outcomeScore < 0) {
      losses += 1;
    }

    score += outcomeScore;

    rounds.push({
      round,
      playerMove,
      wyrmMove,
      outcome: outcomeScore > 0 ? "win" : outcomeScore < 0 ? "loss" : "draw",
      scoreAfterRound: score
    });
  }

  const undefeatedBonus = losses === 0 && moves.length > 0 ? 0.35 : 0;
  const finalMultiplier = roundCoins(scoreToMultiplier(score, undefeatedBonus));

  return {
    score,
    roundsPlayed: moves.length,
    finalMultiplier,
    tier: classifyTier(finalMultiplier),
    totalReward: roundCoins(input.bet * finalMultiplier),
    rounds
  };
}
