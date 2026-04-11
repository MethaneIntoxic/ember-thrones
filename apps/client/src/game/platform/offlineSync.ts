import type { SpinRequest } from "../net/apiClient";

const OFFLINE_SPIN_KEY = "dragon_link_offline_spin_queue";

export interface OfflineQueuedSpin extends SpinRequest {
  queuedAt: number;
}

export interface DrainQueueResult<T> {
  processed: number;
  failed: number;
  remaining: number;
  lastResult: T | null;
}

function isBrowserStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
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

    return parsed.filter((item) => typeof item.bet === "number" && typeof item.sessionId === "string");
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

export function enqueueOfflineSpin(request: SpinRequest): OfflineQueuedSpin[] {
  const queue = loadOfflineSpinQueue();

  queue.push({
    ...request,
    queuedAt: Date.now()
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
      lastResult: null
    };
  }

  const remainingQueue = [...queue];
  let processed = 0;
  let failed = 0;
  let lastResult: T | null = null;

  while (remainingQueue.length > 0) {
    const current = remainingQueue[0];
    if (!current) {
      break;
    }

    try {
      lastResult = await sender({
        profileId: current.profileId,
        sessionId: current.sessionId,
        bet: current.bet,
        linesMode: current.linesMode,
        clientNonce: current.clientNonce
      });

      remainingQueue.shift();
      processed += 1;
      saveOfflineSpinQueue(remainingQueue);
    } catch {
      failed += 1;
      break;
    }
  }

  return {
    processed,
    failed,
    remaining: remainingQueue.length,
    lastResult
  };
}
