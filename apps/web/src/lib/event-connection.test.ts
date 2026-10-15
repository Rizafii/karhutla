import { afterEach, describe, it, expect, vi } from "vitest";
import { connectEvents } from "./event-connection";
import type { Event } from "./types";

class Socket {
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  emit(event: Event) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}
const event: Event = {
  event_id: "evt-1",
  type: "incident.created",
  timestamp: "2026-10-13T15:30:00Z",
  sequence: 1,
  data: { incident_id: "INC-1" },
};
afterEach(() => vi.useRealTimers());
describe("realtime reconnect and synchronization", () => {
  it("buffers events until the initial REST state has arrived", async () => {
    vi.useFakeTimers();
    const sockets: Socket[] = [];
    const delivered = vi.fn();
    let resolve!: () => void;
    const stop = connectEvents(
      "ws://test",
      {
        connection: vi.fn(),
        resync: () => new Promise<void>((r) => (resolve = r)),
        event: delivered,
      },
      () => {
        const s = new Socket();
        sockets.push(s);
        return s as unknown as WebSocket;
      },
    );
    sockets[0].onopen?.();
    sockets[0].emit(event);
    expect(delivered).not.toHaveBeenCalled();
    resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(delivered).toHaveBeenCalledWith(event);
    stop();
  });
  it("fetches REST again after reconnect and suppresses repeated notifications", async () => {
    vi.useFakeTimers();
    const sockets: Socket[] = [];
    const delivered = vi.fn(),
      resync = vi.fn(async () => {});
    const stop = connectEvents(
      "ws://test",
      { connection: vi.fn(), resync, event: delivered },
      () => {
        const s = new Socket();
        sockets.push(s);
        return s as unknown as WebSocket;
      },
    );
    sockets[0].onopen?.();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0].emit(event);
    sockets[0].close();
    await vi.advanceTimersByTimeAsync(500);
    sockets[1].onopen?.();
    await vi.advanceTimersByTimeAsync(0);
    sockets[1].emit(event);
    expect(resync).toHaveBeenCalledTimes(2);
    expect(delivered).toHaveBeenCalledTimes(1);
    stop();
  });
  it("stops reconnecting after disposal", async () => {
    vi.useFakeTimers();
    const factory = vi.fn(() => new Socket() as unknown as WebSocket);
    const stop = connectEvents(
      "ws://test",
      { connection: vi.fn(), resync: async () => {}, event: vi.fn() },
      factory,
    );
    stop();
    await vi.advanceTimersByTimeAsync(30000);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
