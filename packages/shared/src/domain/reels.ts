import { createSeededRng, type DeterministicRng } from "./rng";

export const REEL_COUNT = 5;
export const ROW_COUNT = 3;

export const SLOT_SYMBOLS = [
  "ten",
  "jack",
  "queen",
  "king",
  "ace",
  "coin",
  "lantern",
  "ingot",
  "dragon",
  "wild",
  "orb",
  "scatter"
] as const;

export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];
export type ReelColumn = [SlotSymbol, SlotSymbol, SlotSymbol];
export type SpinColumns = [ReelColumn, ReelColumn, ReelColumn, ReelColumn, ReelColumn];
export type ReelStops = [number, number, number, number, number];

export interface SpinGrid {
  columns: SpinColumns;
  stops: ReelStops;
}

type ReelComposition = Record<SlotSymbol, number>;

const SYMBOL_BUILD_ORDER: readonly SlotSymbol[] = SLOT_SYMBOLS;

export const MEDIUM_REEL_COMPOSITIONS: readonly ReelComposition[] = [
  {
    ten: 9,
    jack: 8,
    queen: 8,
    king: 7,
    ace: 6,
    coin: 6,
    lantern: 5,
    ingot: 5,
    dragon: 5,
    wild: 5,
    orb: 12,
    scatter: 2
  },
  {
    ten: 8,
    jack: 9,
    queen: 8,
    king: 7,
    ace: 6,
    coin: 6,
    lantern: 5,
    ingot: 5,
    dragon: 5,
    wild: 5,
    orb: 12,
    scatter: 2
  },
  {
    ten: 8,
    jack: 8,
    queen: 9,
    king: 7,
    ace: 6,
    coin: 6,
    lantern: 5,
    ingot: 5,
    dragon: 6,
    wild: 5,
    orb: 11,
    scatter: 2
  },
  {
    ten: 8,
    jack: 8,
    queen: 8,
    king: 8,
    ace: 6,
    coin: 6,
    lantern: 5,
    ingot: 5,
    dragon: 6,
    wild: 5,
    orb: 12,
    scatter: 2
  },
  {
    ten: 8,
    jack: 8,
    queen: 8,
    king: 7,
    ace: 7,
    coin: 6,
    lantern: 5,
    ingot: 5,
    dragon: 6,
    wild: 5,
    orb: 12,
    scatter: 2
  }
];

function buildStrip(composition: ReelComposition, seed: number): SlotSymbol[] {
  const strip: SlotSymbol[] = [];

  for (const symbol of SYMBOL_BUILD_ORDER) {
    const count = composition[symbol];
    for (let index = 0; index < count; index += 1) {
      strip.push(symbol);
    }
  }

  const rng = createSeededRng(seed);
  for (let index = strip.length - 1; index > 0; index -= 1) {
    const swapIndex = rng.nextInt(index + 1);
    const current = strip[index] as SlotSymbol;
    strip[index] = strip[swapIndex] as SlotSymbol;
    strip[swapIndex] = current;
  }

  return strip;
}

export const MEDIUM_REEL_STRIPS = MEDIUM_REEL_COMPOSITIONS.map((composition, index) =>
  buildStrip(composition, 0x10f1 + index * 0x1f)
);

export function generateSpin(
  rng: DeterministicRng,
  strips: ReadonlyArray<ReadonlyArray<SlotSymbol>> = MEDIUM_REEL_STRIPS
): SpinGrid {
  if (strips.length !== REEL_COUNT) {
    throw new Error(`Expected ${REEL_COUNT} reel strips, received ${strips.length}`);
  }

  const columns: ReelColumn[] = [];
  const stops: number[] = [];

  for (let reel = 0; reel < REEL_COUNT; reel += 1) {
    const strip = strips[reel];
    if (!strip || strip.length < ROW_COUNT) {
      throw new Error(`Reel strip ${reel} is invalid`);
    }

    const stop = rng.nextInt(strip.length);
    const column: ReelColumn = [
      strip[stop] as SlotSymbol,
      strip[(stop + 1) % strip.length] as SlotSymbol,
      strip[(stop + 2) % strip.length] as SlotSymbol
    ];

    columns.push(column);
    stops.push(stop);
  }

  return {
    columns: columns as SpinColumns,
    stops: stops as ReelStops
  };
}

export function generateSpinFromSeed(
  seed: number | string,
  strips: ReadonlyArray<ReadonlyArray<SlotSymbol>> = MEDIUM_REEL_STRIPS
): SpinGrid {
  return generateSpin(createSeededRng(seed), strips);
}

export function countSymbol(grid: SpinGrid, symbol: SlotSymbol): number {
  let count = 0;

  for (const column of grid.columns) {
    for (const currentSymbol of column) {
      if (currentSymbol === symbol) {
        count += 1;
      }
    }
  }

  return count;
}

export function listSymbolPositions(grid: SpinGrid, symbol: SlotSymbol): number[] {
  const positions: number[] = [];

  for (let reel = 0; reel < grid.columns.length; reel += 1) {
    const column = grid.columns[reel] as ReelColumn;
    for (let row = 0; row < column.length; row += 1) {
      if (column[row] === symbol) {
        positions.push(reel * ROW_COUNT + row);
      }
    }
  }

  return positions;
}

export function positionToReelRow(position: number): { reel: number; row: number } {
  if (!Number.isInteger(position) || position < 0 || position >= REEL_COUNT * ROW_COUNT) {
    throw new Error(`Position must be between 0 and ${REEL_COUNT * ROW_COUNT - 1}`);
  }

  return {
    reel: Math.floor(position / ROW_COUNT),
    row: position % ROW_COUNT
  };
}

export function symbolAtPosition(grid: SpinGrid, position: number): SlotSymbol | undefined {
  const { reel, row } = positionToReelRow(position);
  return grid.columns[reel]?.[row];
}

export function toRows(grid: SpinGrid): [SlotSymbol[], SlotSymbol[], SlotSymbol[]] {
  const top: SlotSymbol[] = [];
  const middle: SlotSymbol[] = [];
  const bottom: SlotSymbol[] = [];

  for (const column of grid.columns) {
    top.push(column[0]);
    middle.push(column[1]);
    bottom.push(column[2]);
  }

  return [top, middle, bottom];
}
