import type { Bootstrap, Event } from "./types";
export function applyTelemetry(
  current: Bootstrap | undefined,
  event: Event,
): Bootstrap | undefined {
  if (!current) return current;
  if (event.type === "drone.telemetry") {
    const t = event.data;
    const drone = current.drones.find((d) => d.id === t.drone_id);
    if (
      drone &&
      typeof t.state_timestamp === "string" &&
      Date.parse(t.state_timestamp) <= Date.parse(drone.updated_at)
    )
      return current;
    return {
      ...current,
      drones: current.drones.map((d) =>
        d.id === t.drone_id
          ? {
              ...d,
              latitude: Number(t.latitude),
              longitude: Number(t.longitude),
              battery_pct: Number(t.battery_pct),
              payload_l: Number(t.payload_l),
              altitude_m: Number(t.altitude_m),
              updated_at:
                typeof t.state_timestamp === "string"
                  ? t.state_timestamp
                  : d.updated_at,
              mission_id: ["completed", "aborted"].includes(String(t.status))
                ? null
                : String(t.mission_id),
              status:
                String(t.status) === "completed" ||
                String(t.status) === "aborted"
                  ? "available"
                  : String(t.status),
            }
          : d,
      ),
      missions: current.missions.map((m) =>
        m.id === t.mission_id
          ? {
              ...m,
              status: String(t.status),
              distance_m: Number(t.distance_m),
              eta_s: Number(t.eta_s),
              simulation_elapsed_s: Number(t.simulation_elapsed_s),
              scan_elapsed_s: typeof t.scan_elapsed_s === "number" ? t.scan_elapsed_s : m.scan_elapsed_s,
              updated_at:
                typeof t.state_timestamp === "string"
                  ? t.state_timestamp
                  : m.updated_at,
              route: [...m.route, [Number(t.longitude), Number(t.latitude)]],
            }
          : m,
      ),
    };
  }
  if (event.type === "dispatch.telemetry") {
    const unit = current.response_units.find(
      (u) => u.id === event.data.unit_id,
    );
    if (
      unit &&
      typeof event.data.state_timestamp === "string" &&
      Date.parse(event.data.state_timestamp) <= Date.parse(unit.updated_at)
    )
      return current;
    return {
      ...current,
      response_units: current.response_units.map((u) =>
        u.id === event.data.unit_id
          ? {
              ...u,
              latitude: Number(event.data.latitude),
              longitude: Number(event.data.longitude),
              updated_at:
                typeof event.data.state_timestamp === "string"
                  ? event.data.state_timestamp
                  : u.updated_at,
            }
          : u,
      ),
    };
  }
  return current;
}
