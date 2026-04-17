import type { SpinRequest } from "../net/apiClient";

const OFFLINE_SPIN_KEY = "dragon_link_offline_spin_queue";

export type OfflineReplayPolicy = "server-authoritative" | "unknown";

export interface OfflineQueuedSpin extends SpinRequest {
  queuedAt: number;
  replayPolicy: OfflineReplayPolicy;
}

export interface DrainQueueResult<T> {
  processed: number;
  failed: number;
  remaining: number;
  queuedRemaining: number;
  stranded: number;
  lastResult: T | null;
}

export interface OfflineQueueSnapshot {
  total: number;
  queued: number;
  stranded: number;
}

function isBrowserStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalSpeedMode(value: unknown): SpinRequest["speedMode"] {
  return value === "normal" || value === "turbo" || value === "auto" ? value : undefined;
}

function normalizeQueuedSpin(candidate: unknown): OfflineQueuedSpin | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const profileId =
    typeof candidate.profileId === "string"
      ? candidate.profileId
      : typeof candidate.playerId === "string"
        ? candidate.playerId
        : null;

  const linesMode =
    typeof candidate.linesMode === "number"
      ? candidate.linesMode
      : typeof candidate.lines === "number"
        ? candidate.lines
        : null;

  if (
    !profileId ||
    typeof candidate.sessionId !== "string" ||
    typeof candidate.bet !== "number" ||
    linesMode === null ||
    typeof candidate.clientNonce !== "string"
  ) {
    return null;
  }

  return {
    profileId,
    playerId: typeof candidate.playerId === "string" ? candidate.playerId : profileId,
    sessionId: candidate.sessionId,
    bet: candidate.bet,
    linesMode,
    lines: linesMode,
    clientNonce: candidate.clientNonce,
    ...(readOptionalNumber(candidate.denomination) !== undefined
      ? { denomination: readOptionalNumber(candidate.denomination) }
      : {}),
    ...(readOptionalNumber(candidate.creditsPerSpin) !== undefined
      ? { creditsPerSpin: readOptionalNumber(candidate.creditsPerSpin) }
      : {}),
    ...(readOptionalSpeedMode(candidate.speedMode) !== undefined
      ? { speedMode: readOptionalSpeedMode(candidate.speedMode) }
      : {}),
    ...(readOptionalBoolean(candidate.isMaxBet) !== undefined
      ? { isMaxBet: readOptionalBoolean(candidate.isMaxBet) }
      : {}),
    ...(readOptionalBoolean(candidate.qualifiesForProgressive) !== undefined
      ? { qualifiesForProgressive: readOptionalBoolean(candidate.qualifiesForProgressive) }
      : {}),
    queuedAt: typeof candidate.queuedAt === "number" ? candidate.queuedAt : Date.now(),
    replayPolicy:
      candidate.replayPolicy === "server-authoritative" ? "server-authoritative" : "unknown"
  };
}

export function loadOfflineSpinQueue(): OfflineQueuedSpin[] {
  if (!isBrowserStorageAvailable()) {
    return [];
  }

  const serialized = window.localStorage.getItem(OFFLINE_SPIN_KEY);
  if (!serialized) {
    return [];
  }

  try {
    const parsed = JSON.parse(serialized) as OfflineQueuedSpin[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeQueuedSpin(item))
      .filter((item): item is OfflineQueuedSpin => item !== null);
  } catch {
    return [];
  }
}

export function saveOfflineSpinQueue(queue: OfflineQueuedSpin[]): void {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  window.localStorage.setItem(OFFLINE_SPIN_KEY, JSON.stringify(queue));
}

export function getOfflineSpinQueueSnapshot(): OfflineQueueSnapshot {
  const queue = loadOfflineSpinQueue();
  const queued = queue.filter((item) => item.replayPolicy === "server-authoritative").length;

  return {
    total: queue.length,
    queued,
    stranded: queue.length - queued
  };
}

export function enqueueOfflineSpin(
  request: SpinRequest,
  replayPolicy: OfflineReplayPolicy = "server-authoritative"
): OfflineQueuedSpin[] {
  const queue = loadOfflineSpinQueue();
  const profileId = request.profileId || request.playerId;
  const linesMode = request.lines ?? request.linesMode;

  if (!profileId) {
    return queue;
  }

  queue.push({
    ...request,
    profileId,
    playerId: request.playerId ?? profileId,
    linesMode,
    lines: linesMode,
    queuedAt: Date.now(),
    replayPolicy
  });

  saveOfflineSpinQueue(queue);
  return queue;
}

export function clearOfflineSpinQueue(): void {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  window.localStorage.removeItem(OFFLINE_SPIN_KEY);
}

export async function drainOfflineSpinQueue<T>(
  sender: (request: SpinRequest) => Promise<T>
): Promise<DrainQueueResult<T>> {
  const queue = loadOfflineSpinQueue();
  if (queue.length === 0) {
    return {
      processed: 0,
      failed: 0,
      remaining: 0,
      queuedRemaining: 0,
      stranded: 0,
      lastResult: null
    };
  }

  const remainingQueue = [...queue];
  let processed = 0;
  let failed = 0;
  let lastResult: T | null = null;
  let index = 0;

  while (index < remainingQueue.length) {
    const current = remainingQueue[index];
    if (!current) {
      break;
    }

    if (current.replayPolicy !== "server-authoritative") {
      index += 1;
      continue;
    }

    try {
      lastResult = await sender({
        profileId: current.profileId,
        playerId: current.playerId ?? current.profileId,
        sessionId: current.sessionId,
        bet: current.bet,
        linesMode: current.linesMode,
        lines: current.lines ?? current.linesMode,
        clientNonce: current.clientNonce,
        ...(current.denomination !== undefined ? { denomination: current.denomination } : {}),
        ...(current.creditsPerSpin !== undefined
          ? { creditsPerSpin: current.creditsPerSpin }
          : {}),
        ...(current.speedMode !== undefined ? { speedMode: current.speedMode } : {}),
        ...(current.isMaxBet !== undefined ? { isMaxBet: current.isMaxBet } : {}),
        ...(current.qualifiesForProgressive !== undefined
          ? { qualifiesForProgressive: current.qualifiesForProgressive }
          : {})
      });

      remainingQueue.splice(index, 1);
      processed += 1;
      saveOfflineSpinQueue(remainingQueue);
    } catch {
      failed += 1;
      break;
    }
  }

  const queuedRemaining = remainingQueue.filter(
    (item) => item.replayPolicy === "server-authoritative"
  ).length;

  return {
    processed,
    failed,
    remaining: remainingQueue.length,
    queuedRemaining,
    stranded: remainingQueue.length - queuedRemaining,
    lastResult
  };
}
