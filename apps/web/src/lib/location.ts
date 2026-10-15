import type { Incident } from "./types";
export function locationLabel(incident: Incident) {
  if (incident.location_source === "drone_simulation") return "Pemindaian drone virtual · bukan GPS terukur";
  if (incident.location_source === "camera_bearing_estimate") return "Estimasi otomatis arah kamera · jarak diasumsikan";
  return "Estimasi pilihan operator";
}
