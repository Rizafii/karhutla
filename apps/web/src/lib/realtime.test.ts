import { describe, it, expect } from "vitest";
import { applyTelemetry } from "./realtime";
import type { Bootstrap, Event } from "./types";
describe("backend telemetry integration", () => {
  it("does not move a drone backwards after a fresher REST resync", () => {
    const state = {
      drones: [
        { id: "DRONE-01", latitude: 2, updated_at: "2026-10-13T15:31:00Z" },
      ],
      missions: [],
    } as unknown as Bootstrap;
    const result = applyTelemetry(state, {
      event_id: "old",
      type: "drone.telemetry",
      timestamp: "2026-10-13T15:30:00Z",
      sequence: 1,
      data: {
        drone_id: "DRONE-01",
        state_timestamp: "2026-10-13T15:30:00Z",
        latitude: 1,
      },
    });
    expect(result).toBe(state);
  });
  it("updates position and battery without resolving an incident", () => {
    const state = {
      drones: [{ id: "DRONE-01", latitude: 0, longitude: 0, battery_pct: 100 }],
      missions: [{ id: "MSN-1", status: "en_route", route: [] }],
      incidents: [{ id: "INC-1", status: "in_progress" }],
    } as unknown as Bootstrap;
    const result = applyTelemetry(state, {
      event_id: "evt-1",
      timestamp: "2026-10-13T15:30:00Z",
      sequence: 1,
      type: "drone.telemetry",
      data: {
        drone_id: "DRONE-01",
        mission_id: "MSN-1",
        latitude: -2.3,
        longitude: 113.9,
        battery_pct: 95,
        payload_l: 0,
        altitude_m: 80,
        status: "suppression_simulation",
        distance_m: 0,
        eta_s: 0,
        simulation_elapsed_s: 60,
      },
    })!;
    expect(result.drones[0].latitude).toBe(-2.3);
    expect(result.drones[0].battery_pct).toBe(95);
    expect(result.incidents[0].status).toBe("in_progress");
    expect(state.drones[0].latitude).toBe(0);
  });
  it("releases visual drone state on backend completion", () => {
    const state = {
      drones: [{ id: "DRONE-01" }],
      missions: [{ id: "MSN-1", route: [] }],
    } as unknown as Bootstrap;
    const result = applyTelemetry(state, {
      event_id: "evt-2",
      timestamp: "2026-10-13T15:31:00Z",
      sequence: 2,
      type: "drone.telemetry",
      data: {
        drone_id: "DRONE-01",
        mission_id: "MSN-1",
        status: "completed",
        latitude: 1,
        longitude: 2,
      },
    })!;
    expect(result.drones[0].status).toBe("available");
    expect(result.missions[0].status).toBe("completed");
  });
});
