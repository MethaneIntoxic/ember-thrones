export interface ServerEvent<T = unknown> {
  type: string;
  payload: T;
  ts: number;
}

export interface EventClientOptions {
  endpoint?: string;
  retryMs?: number;
}

type RuntimeMode = "hybrid" | "serverless";

type EventHandler = (event: ServerEvent) => void;
type ErrorHandler = (error: Error) => void;

const DEFAULT_ENDPOINT =
  (import.meta.env.VITE_SSE_URL as string | undefined) ?? "http://127.0.0.1:4300/events";
const runtimeModeEnv = (import.meta.env.VITE_RUNTIME_MODE ?? "").toLowerCase();
const RUNTIME_MODE: RuntimeMode = runtimeModeEnv === "hybrid" ? "hybrid" : "serverless";

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
    this.runtimeMode = RUNTIME_MODE;
  }

  public connect(onEvent: EventHandler, onError?: ErrorHandler): void {
    this.onEvent = onEvent;
    this.onError = onError ?? null;

    if (this.runtimeMode === "serverless") {
      this.onEvent({
        type: "connected",
        payload: { mode: "serverless" },
        ts: Date.now()
      });
      return;
    }

    this.openSource();
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

        try {
          const parsed = JSON.parse((message as MessageEvent).data) as ServerEvent;
          this.onEvent(parsed);
        } catch {
          this.onEvent({
            type: eventType,
            payload: (message as MessageEvent).data,
            ts: Date.now()
          });
        }
      });
    }

    source.onmessage = (message) => {
      if (!this.onEvent) {
        return;
      }

      try {
        const parsed = JSON.parse(message.data) as ServerEvent;
        this.onEvent(parsed);
      } catch {
        this.onEvent({
          type: "raw",
          payload: message.data,
          ts: Date.now()
        });
      }
    };

    source.onerror = () => {
      this.onError?.(new Error("SSE stream disconnected."));
      source.close();

      this.reconnectTimer = window.setTimeout(() => {
        this.openSource();
      }, this.retryMs);
    };
  }
}
