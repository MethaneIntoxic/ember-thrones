import { randomUUID } from "node:crypto";

export type ServerEventType = "jackpot" | "achievement" | "bonus";

export interface ServerEvent {
  id: string;
  type: ServerEventType;
  ts: string;
  payload: Record<string, unknown>;
}

type EventListener = (event: ServerEvent) => void;

export class EventBus {
  private readonly listeners = new Set<EventListener>();

  public publish(type: ServerEventType, payload: Record<string, unknown>): ServerEvent {
    const event: ServerEvent = {
      id: randomUUID(),
      type,
      ts: new Date().toISOString(),
      payload,
    };

    for (const listener of this.listeners) {
      listener(event);
    }

    return event;
  }

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
