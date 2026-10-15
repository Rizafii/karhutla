"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request, WS } from "./api";
import type { Bootstrap } from "./types";
import { connectEvents } from "./event-connection";
import { applyTelemetry } from "./realtime";

export function useOperations() {
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  const query = useQuery({ queryKey: ["bootstrap"], queryFn: () => request<Bootstrap>("/api/bootstrap"), refetchInterval: 10000 });
  useEffect(() => connectEvents(WS, {
    connection: setConnected,
    resync: async () => { await client.invalidateQueries({ queryKey: ["bootstrap"] }); },
    event: event => {
      if (event.type.endsWith(".telemetry")) client.setQueryData<Bootstrap>(["bootstrap"], previous => applyTelemetry(previous, event));
      else client.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  }), [client]);
  return { ...query, connected };
}
