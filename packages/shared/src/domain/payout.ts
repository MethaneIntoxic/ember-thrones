import { countSymbol, type SpinGrid, type SlotSymbol } from "./reels";

export type PayableSymbol = Exclude<SlotSymbol, "orb" | "scatter">;

export type LinePattern = [number, number, number, number, number];

export interface LineWin {
  lineIndex: number;
  symbol: PayableSymbol;
  count: number;
  multiplier: number;
  payout: number;
  positions: Array<{ reel: number; row: number }>;
}

export interface PayoutResult {
  lineWins: LineWin[];
  lineWinTotal: number;
  scatterCount: number;
  scatterWin: number;
  totalWin: number;
  hit: boolean;
}

const PAYABLE_SYMBOLS: readonly PayableSymbol[] = [
  "ember",
  "flame",
  "scale",
  "relic",
  "mythic",
  "throne",
  "wild"
];

export const DEFAULT_PAYLINES: readonly LinePattern[] = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
  [1, 0, 2, 0, 1],
  [1, 2, 0, 2, 1],
  [0, 2, 1, 2, 0]
];

export const PAYOUT_TABLE: Record<PayableSymbol, Record<3 | 4 | 5, number>> = {
  ember: { 3: 2.7, 4: 8.1, 5: 18.9 },
  flame: { 3: 4.05, 4: 10.8, 5: 24.3 },
  scale: { 3: 5.4, 4: 14.85, 5: 32.4 },
  relic: { 3: 10.8, 4: 29.7, 5: 67.5 },
  mythic: { 3: 17.55, 4: 47.25, 5: 108 },
  throne: { 3: 33.75, 4: 94.5, 5: 202.5 },
  wild: { 3: 54, 4: 135, 5: 297 }
};

export const SCATTER_PAYOUT_MULTIPLIERS: Record<3 | 4 | 5, number> = {
  3: 18,
  4: 60,
  5: 180
};

function isPayableSymbol(symbol: SlotSymbol): symbol is PayableSymbol {
  return PAYABLE_SYMBOLS.includes(symbol as PayableSymbol);
}

function roundPayout(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function evaluateSingleLine(
  lineSymbols: readonly SlotSymbol[],
  linePattern: LinePattern,
  lineIndex: number,
  lineBet: number
): LineWin | null {
  const first = lineSymbols[0];

  if (!first || (first !== "wild" && !isPayableSymbol(first))) {
    return null;
  }

  const candidates: readonly PayableSymbol[] =
    first === "wild" ? PAYABLE_SYMBOLS : [first as PayableSymbol];

  let bestWin: LineWin | null = null;

  for (const candidate of candidates) {
    let count = 0;

    for (const symbol of lineSymbols) {
      if (symbol === candidate || symbol === "wild") {
        count += 1;
      } else {
        break;
      }
    }

    if (count < 3) {
      continue;
    }

    const key = Math.min(count, 5) as 3 | 4 | 5;
    const multiplier = PAYOUT_TABLE[candidate][key];
    const payout = roundPayout(lineBet * multiplier);

    if (!bestWin || payout > bestWin.payout) {
      const positions: Array<{ reel: number; row: number }> = [];
      for (let reel = 0; reel < count; reel += 1) {
        positions.push({ reel, row: linePattern[reel] as number });
      }

      bestWin = {
        lineIndex,
        symbol: candidate,
        count,
        multiplier,
        payout,
        positions
      };
    }
  }

  return bestWin;
}

function scatterMultiplierForCount(scatterCount: number): number {
  if (scatterCount >= 5) {
    return SCATTER_PAYOUT_MULTIPLIERS[5];
  }

  if (scatterCount === 4) {
    return SCATTER_PAYOUT_MULTIPLIERS[4];
  }

  if (scatterCount === 3) {
    return SCATTER_PAYOUT_MULTIPLIERS[3];
  }

  return 0;
}

export function evaluatePaylines(
  grid: SpinGrid,
  totalBet: number,
  paylines: readonly LinePattern[] = DEFAULT_PAYLINES
): PayoutResult {
  if (totalBet <= 0) {
    throw new Error("totalBet must be positive");
  }

  if (paylines.length === 0) {
    throw new Error("At least one payline is required");
  }

  const lineBet = totalBet / paylines.length;
  const lineWins: LineWin[] = [];

  for (let lineIndex = 0; lineIndex < paylines.length; lineIndex += 1) {
    const line = paylines[lineIndex] as LinePattern;
    const symbols: SlotSymbol[] = [];

    for (let reel = 0; reel < grid.columns.length; reel += 1) {
      const row = line[reel] as number;
      symbols.push(grid.columns[reel][row] as SlotSymbol);
    }

    const win = evaluateSingleLine(symbols, line, lineIndex, lineBet);
    if (win) {
      lineWins.push(win);
    }
  }

  const lineWinTotal = roundPayout(lineWins.reduce((sum, win) => sum + win.payout, 0));
  const scatterCount = countSymbol(grid, "scatter");
  const scatterWin = roundPayout(totalBet * scatterMultiplierForCount(scatterCount));
  const totalWin = roundPayout(lineWinTotal + scatterWin);

  return {
    lineWins,
    lineWinTotal,
    scatterCount,
    scatterWin,
    totalWin,
    hit: totalWin > 0
  };
}
