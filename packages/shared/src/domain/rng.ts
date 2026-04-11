export interface DeterministicRng {
  nextFloat: () => number;
  nextInt: (maxExclusive: number) => number;
  chance: (probability: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
  fork: (salt: number | string) => DeterministicRng;
  getState: () => number;
}

const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;
const FALLBACK_SEED = 0x6d2b79f5;

function toUint32(value: number): number {
  return value >>> 0;
}

export function hashSeed(seed: number | string): number {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    const normalized = toUint32(seed);
    return normalized === 0 ? FALLBACK_SEED : normalized;
  }

  const normalized = String(seed);
  let hash = 0x811c9dc5;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  hash = toUint32(hash);
  return hash === 0 ? FALLBACK_SEED : hash;
}

class XorShift32Rng implements DeterministicRng {
  private stateValue: number;

  constructor(seed: number | string) {
    this.stateValue = hashSeed(seed);
  }

  nextFloat(): number {
    let value = this.stateValue;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.stateValue = toUint32(value);
    return this.stateValue / UINT32_MAX_PLUS_ONE;
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error("maxExclusive must be a positive integer");
    }

    return Math.floor(this.nextFloat() * maxExclusive);
  }

  chance(probability: number): boolean {
    if (probability <= 0) {
      return false;
    }

    if (probability >= 1) {
      return true;
    }

    return this.nextFloat() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty array");
    }

    return items[this.nextInt(items.length)] as T;
  }

  fork(salt: number | string): DeterministicRng {
    const forkSeed = toUint32(this.stateValue ^ hashSeed(salt) ^ 0xa5a5a5a5);
    return new XorShift32Rng(forkSeed);
  }

  getState(): number {
    return this.stateValue;
  }
}

export function createSeededRng(seed: number | string): DeterministicRng {
  return new XorShift32Rng(seed);
}

export function createSeededRandom(seed: number | string): () => number {
  const rng = createSeededRng(seed);
  return () => rng.nextFloat();
}

export function seededRandomInts(
  seed: number | string,
  count: number,
  maxExclusive: number
): number[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("count must be a non-negative integer");
  }

  const rng = createSeededRng(seed);
  const values: number[] = [];

  for (let index = 0; index < count; index += 1) {
    values.push(rng.nextInt(maxExclusive));
  }

  return values;
}
