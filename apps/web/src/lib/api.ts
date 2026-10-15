export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const WS =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/events";
export async function request<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : JSON.stringify(error.detail),
    );
  }
  return response.json();
}
export const statusNames: Record<string, string> = {
  pending_review: "Perlu verifikasi",
  confirmed: "Terverifikasi",
  dispatched: "Ditugaskan",
  in_progress: "Penanganan",
  resolved: "Teratasi",
  false_alarm: "Alarm palsu",
  closed: "Ditutup",
  proposed: "Proposal",
  approved: "Disetujui",
  en_route: "Menuju target",
  on_site: "Di lokasi",
  suppression_simulation: "Payload dilepas",
  returning: "Kembali ke base",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  aborted: "Abort selesai",
  failed: "Gagal",
  available: "Siaga",
  reserved: "Direservasi",
  assigned: "Ditugaskan",
  accepted: "Diterima",
  responding: "Merespons",
  standby: "Siaga",
  connected: "Terhubung",
  reconnecting: "Menghubungkan",
  unavailable: "Tidak tersedia",
  ready: "AI siap",
  processing: "Inference",
  paused: "Dijeda",
  idle: "Siap",
  running: "Berjalan",
  error: "Error",
};
export const label = (value: string) => statusNames[value] || value;
export const time = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleTimeString("id-ID", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
