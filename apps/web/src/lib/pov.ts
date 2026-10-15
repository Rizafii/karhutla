export type WorldPoint = { east: number; north: number; height: number };
export type Viewpoint = WorldPoint & { heading: number; pitch: number };
export function worldPoint(latitude: number, longitude: number, height = 0): WorldPoint {
  return { east: (longitude - 113.9) * 111320 * Math.cos(-2.3 * Math.PI / 180), north: (latitude + 2.3) * 110540, height };
}
export function bearing(from: WorldPoint, to: WorldPoint) {
  return Math.atan2(to.east - from.east, to.north - from.north) * 180 / Math.PI;
}
export function projectPoint(point: WorldPoint, camera: Viewpoint, width: number, height: number) {
  const angle = camera.heading * Math.PI / 180, pitch = camera.pitch * Math.PI / 180;
  const dx = point.east - camera.east, dy = point.north - camera.north, dz = point.height - camera.height;
  const side = dx * Math.cos(angle) - dy * Math.sin(angle);
  const forward = dx * Math.sin(angle) + dy * Math.cos(angle);
  const depth = forward * Math.cos(pitch) - dz * Math.sin(pitch);
  if (depth < 8) return null;
  const up = dz * Math.cos(pitch) + forward * Math.sin(pitch);
  const scale = width * .72 / depth;
  return { x: width / 2 + side * scale, y: height / 2 - up * scale, scale, depth };
}
export function terrainNoise(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}
