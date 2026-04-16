import { resolveRuntimeMode, type RuntimeMode } from "../platform/runtimePolicy";

export interface ServerEvent<T = unknown> {
  id?: string;
  type: string;
  payload: T;
  ts: number;
  source: "server" | "runtime";
}

export interface EventClientOptions {
  endpoint?: string;
  retryMs?: number;
  runtimeMode?: RuntimeMode;
}

type EventHandler = (event: ServerEvent) => void;
type ErrorHandler = (error: Error) => void;

const DEFAULT_ENDPOINT =
  (import.meta.env.VITE_SSE_URL as string | undefined) ?? "http://127.0.0.1:4300/events";
const RUNTIME_MODE: RuntimeMode = resolveRuntimeMode(import.meta.env.VITE_RUNTIME_MODE);

export class EventClient {
  private readonly endpoint: string;

  private readonly retryMs: number;

  private eventSource: EventSource | null = null;

  private reconnectTimer: number | null = null;

  private onEvent: EventHandler | null = null;

  private onError: ErrorHandler | null = null;

  private readonly runtimeMode: RuntimeMode;

  public constructor(options: EventClientOptions = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.retryMs = options.retryMs ?? 2000;
    this.runtimeMode = options.runtimeMode ?? RUNTIME_MODE;
  }

  public connect(onEvent: EventHandler, onError?: ErrorHandler): void {
    this.onEvent = onEvent;
    this.onError = onError ?? null;

    if (this.runtimeMode === "serverless") {
      this.emitRuntimeEvent("runtime.unavailable", {
        mode: "serverless",
        reason: "Live event stream is unavailable in demo runtime."
      });
      return;
    }

    this.openSource();
  }

  private emitRuntimeEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.onEvent) {
      return;
    }

    this.onEvent({
      type,
      payload,
      ts: Date.now(),
      source: "runtime"
    });
  }

  private toTimestamp(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return Date.now();
  }

  private normalizeMessage(eventType: string, data: string): ServerEvent {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;

      if (eventType === "connected") {
        return {
          type: "runtime.connected",
          payload: {
            mode: this.runtimeMode,
            ...(parsed ?? {})
          },
          ts: this.toTimestamp(parsed?.ts),
          source: "runtime"
        };
      }

      if (eventType === "ping") {
        return {
          type: "runtime.ping",
          payload: parsed,
          ts: this.toTimestamp(parsed?.ts),
          source: "runtime"
        };
      }

      if (typeof parsed.type === "string" && "payload" in parsed) {
        return {
          id: typeof parsed.id === "string" ? parsed.id : undefined,
          type: parsed.type,
          payload: parsed.payload,
          ts: this.toTimestamp(parsed.ts),
          source: "server"
        };
      }

      return {
        type: eventType,
        payload: parsed,
        ts: this.toTimestamp(parsed.ts),
        source: "server"
      };
    } catch {
      return {
        type: eventType,
        payload: data,
        ts: Date.now(),
        source: eventType.startsWith("runtime.") ? "runtime" : "server"
      };
    }
  }

  public close(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private openSource(): void {
    this.close();

    const source = new EventSource(this.endpoint);
    this.eventSource = source;

    const namedEvents = ["jackpot", "achievement", "bonus", "connected", "ping"];
    for (const eventType of namedEvents) {
      source.addEventListener(eventType, (message) => {
        if (!this.onEvent) {
          return;
        }

        this.onEvent(this.normalizeMessage(eventType, (message as MessageEvent).data));
      });
    }

    source.onmessage = (message) => {
      if (!this.onEvent) {
        return;
      }

      this.onEvent(this.normalizeMessage("raw", message.data));
    };

    source.onerror = () => {
      this.emitRuntimeEvent("runtime.disconnected", {
        mode: this.runtimeMode,
        endpoint: this.endpoint
      });
      this.onError?.(new Error("SSE stream disconnected."));
      source.close();

      this.reconnectTimer = window.setTimeout(() => {
        this.openSource();
      }, this.retryMs);
    };
  }
}
