import type { Event } from "./types";

type Callbacks = {
  connection: (connected: boolean) => void;
  resync: () => Promise<void>;
  event: (event: Event) => void;
};

/** Buffer incremental events until REST resync completes; retain deduplication across reconnects. */
export function connectEvents(
  url: string,
  callbacks: Callbacks,
  factory: (url: string) => WebSocket = (url) => new WebSocket(url),
) {
  let socket: WebSocket,
    retry: ReturnType<typeof setTimeout>,
    heartbeat: ReturnType<typeof setInterval>,
    disposed = false,
    attempt = 0;
  const seen = new Set<string>();
  const deliver = (event: Event) => {
    if (seen.has(event.event_id)) return;
    seen.add(event.event_id);
    if (seen.size > 2000) seen.delete(seen.values().next().value!);
    callbacks.event(event);
  };
  function open() {
    const active = factory(url);
    socket = active;
    let syncing = true;
    const buffered: Event[] = [];
    active.onopen = () => {
      attempt = 0;
      callbacks.connection(true);
      heartbeat = setInterval(() => {
        if (active.readyState === 1) active.send("ping");
      }, 15000);
      callbacks
        .resync()
        .then(() => {
          if (disposed || socket !== active) return;
          syncing = false;
          buffered.forEach(deliver);
          buffered.length = 0;
        })
        .catch(() => active.close());
    };
    active.onmessage = (message) => {
      let event: Event;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      if (!event.type || event.type.startsWith("system.") || !event.event_id)
        return;
      if (syncing) buffered.push(event);
      else deliver(event);
    };
    active.onclose = () => {
      callbacks.connection(false);
      clearInterval(heartbeat);
      if (!disposed)
        retry = setTimeout(open, Math.min(10000, 500 * 2 ** attempt++));
    };
    active.onerror = () => active.close();
  }
  open();
  return () => {
    disposed = true;
    clearTimeout(retry);
    clearInterval(heartbeat);
    socket?.close();
  };
}
