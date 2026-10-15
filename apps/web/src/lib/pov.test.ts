import { expect, it } from "vitest";
import { projectPoint, worldPoint, bearing } from "./pov";
it("projects terrain in front and clips terrain behind the drone", () => {
  const camera = { east: 0, north: 0, height: 80, heading: 0, pitch: 15 };
  const ahead = projectPoint({ east: 0, north: 300, height: 0 }, camera, 1000, 600);
  expect(ahead?.x).toBeCloseTo(500);
  expect(projectPoint({ east: 0, north: -300, height: 0 }, camera, 1000, 600)).toBeNull();
  expect(projectPoint({ east: 30, north: 300, height: 0 }, camera, 1000, 600)!.x).toBeGreaterThan(500);
});
it("supports downward scanning directly beneath the virtual aircraft", () => {
  const result = projectPoint({ east: 0, north: 0, height: 0 }, { east: 0, north: 0, height: 80, heading: 0, pitch: 70 }, 1000, 600);
  expect(result).not.toBeNull();
  expect(result!.depth).toBeGreaterThan(70);
});
it("uses geographic telemetry as the scene position", () => {
  const origin = worldPoint(-2.3, 113.9);
  const east = worldPoint(-2.3, 113.901);
  expect(east.east - origin.east).toBeCloseTo(111.23, 0);
  expect(bearing(origin, east)).toBeCloseTo(90);
});
