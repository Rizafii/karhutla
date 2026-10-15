"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  Flame,
  LayoutDashboard,
  Video,
  TriangleAlert,
  Shield,
  Plane,
  History,
  Settings,
  Bell,
  Radio,
  MapPin,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  Play,
  Pause,
  RotateCcw,
  X,
  Check,
  Navigation,
  Target,
  Battery,
  Package,
  WifiOff,
  LoaderCircle,
  FileText,
  Download,
  Layers,
  ScanLine,
  Activity,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { API, WS, request, label, time } from "@/lib/api";
import type {
  Bootstrap,
  Camera,
  Incident,
  Mission,
  Report,
  Event,
} from "@/lib/types";
import { useWorkspace } from "@/lib/store";
import { applyTelemetry } from "@/lib/realtime";
import { connectEvents } from "@/lib/event-connection";
import { locationLabel } from "@/lib/location";

const Map = dynamic(() => import("./monitoring-map"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <LoaderCircle className="spin" /> Menyiapkan peta lokal…
    </div>
  ),
});
const navigation = [
  { id: "overview", name: "Command Center", icon: LayoutDashboard },
  { id: "cameras", name: "Jaringan Kamera", icon: Video },
  { id: "incidents", name: "Insiden", icon: TriangleAlert },
  { id: "response", name: "Operasi Respons", icon: Shield },
  { id: "missions", name: "Misi Drone", icon: Plane },
  { id: "history", name: "Riwayat Kejadian", icon: History },
  { id: "settings", name: "Pengaturan", icon: Settings },
];
const closed = ["closed", "resolved", "false_alarm"];
const terminal = ["completed", "cancelled", "aborted", "failed"];
const eventName: Record<string, string> = {
  "incident.created": "Kandidat insiden terdeteksi",
  "incident.confirmed": "Insiden dikonfirmasi operator",
  "incident.location_refined": "Titik diperbarui oleh pemindaian drone virtual",
  "mission.scan_completed": "Pemindaian virtual selesai",
  "mission.automation_authorized": "Respons otomatis diizinkan operator",
  "incident.rejected": "Kandidat ditolak operator",
  "incident.updated": "Insiden diperbarui",
  "mission.created": "Proposal misi dibuat",
  "mission.approved": "Misi disetujui operator",
  "mission.started": "Drone virtual diluncurkan",
  "mission.arrived": "Drone tiba di target",
  "mission.payload_released": "Payload virtual dilepas",
  "mission.completed": "Drone kembali ke base",
  "mission.abort_requested": "Abort diminta operator",
  "mission.aborted": "Abort selesai di base",
  "dispatch.created": "Regu ditugaskan",
  "dispatch.updated": "Status regu diperbarui",
  "detection.validated": "Temporal validation terpenuhi",
  "camera.status_changed": "Status kamera berubah",
  "demo.started": "Skenario demo dimulai",
  "demo.reset": "Skenario direset",
  "demo.updated": "Kontrol simulasi diperbarui",
};
function Status({ value }: { value: string }) {
  return (
    <span className={`status status-${value}`}>
      <i />
      {label(value)}
    </span>
  );
}
function Provenance({ incident }: { incident: Incident }) {
  return (
    <span
      className={`provenance ${incident.provenance === "ai" ? "real" : "sim"}`}
    >
      {incident.provenance === "ai" ? (
        <>
          <ScanLine size={12} /> AI · inference nyata
        </>
      ) : (
        <>SIMULASI MANUAL</>
      )}
    </span>
  );
}
function Stream({
  camera,
  annotated = false,
}: {
  camera: Camera;
  annotated?: boolean;
}) {
  const [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setFailed(false);
    setRetry((n) => n + 1);
  }, [camera.connection_status, camera.ai_status, annotated]);
  useEffect(() => {
    if (
      !failed ||
      camera.connection_status !== "connected" ||
      (annotated && camera.ai_status !== "ready")
    )
      return;
    const timer = setTimeout(() => {
      setFailed(false);
      setRetry((n) => n + 1);
    }, 2500);
    return () => clearTimeout(timer);
  }, [failed, camera.connection_status, camera.ai_status, annotated]);
  if (
    camera.connection_status === "unavailable" ||
    camera.connection_status === "reconnecting" ||
    failed
  )
    return (
      <div className="video-empty">
        <WifiOff size={24} />
        <span>Video belum tersedia</span>
        <small>{camera.error || "Periksa sumber kamera"}</small>
        {failed && (
          <button
            onClick={() => {
              setFailed(false);
              setRetry((n) => n + 1);
            }}
          >
            Coba kembali
          </button>
        )}
      </div>
    );
  return (
    <img
      className="camera-stream"
      src={`${API}/api/cameras/${camera.id}/stream.mjpg?annotated=${annotated}&v=${retry}`}
      alt={`Preview ${camera.id}${annotated ? " dengan hasil inference" : ""}`}
      onError={() => setFailed(true)}
    />
  );
}
function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal ${wide ? "modal-wide" : ""}`}>
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Tutup">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Informasi dan kontrol operasional KARHUTLA.AI.
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function CommandCenter() {
  return <Dashboard />;
}

function Dashboard() {
  const client = useQueryClient(),
    workspace = useWorkspace();
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => request<Bootstrap>("/api/bootstrap"),
    refetchInterval: 10000,
  });
  const [connected, setConnected] = useState(false),
    [notice, setNotice] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<string | null>(null),
    [confirm, setConfirm] = useState<{
      title: string;
      message: string;
      action: () => Promise<void>;
    } | null>(null);
  const [demoOpen, setDemoOpen] = useState(true),
    [online, setOnline] = useState(false),
    [notifications, setNotifications] = useState(false),
    [cameraEditor, setCameraEditor] = useState<Camera | null>(null),
    [now, setNow] = useState("");
  useEffect(() => {
    const timer = setInterval(
      () =>
        setNow(
          new Date().toLocaleTimeString("id-ID", {
            timeZone: "Asia/Jakarta",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(
    () =>
      connectEvents(WS, {
        connection: setConnected,
        resync: async () => {
          await client.invalidateQueries({ queryKey: ["bootstrap"] });
        },
        event: (event) => {
          if (event.type.endsWith(".telemetry"))
            client.setQueryData<Bootstrap>(["bootstrap"], (previous) =>
              applyTelemetry(previous, event),
            );
          else {
            client.invalidateQueries({ queryKey: ["bootstrap"] });
            client.invalidateQueries({ queryKey: ["report"] });
          }
          if (event.type === "incident.created") {
            setNotice(
              `${event.data.provenance === "ai" ? "AI" : "SIMULASI"} ? Kandidat baru dari ${event.data.camera_id}`,
            );
            useWorkspace
              .getState()
              .selectIncident(String(event.data.incident_id));
          }
        },
      }),
    [client],
  );
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function act(path: string, body: unknown = {}, method = "POST") {
    setBusy(true);
    setFailure(null);
    try {
      await request(path, body, method);
      await client.invalidateQueries({ queryKey: ["bootstrap"] });
      await client.invalidateQueries({ queryKey: ["report"] });
    } catch (error) {
      setFailure((error as Error).message);
      throw error;
    } finally {
      setBusy(false);
    }
  }
  const safely = (path: string, body: unknown = {}, method = "POST") =>
    act(path, body, method).catch(() => {});
  function ask(
    title: string,
    message: string,
    path: string,
    body: unknown = {},
  ) {
    setConfirm({ title, message, action: () => act(path, body) });
  }
  if (isLoading)
    return (
      <div className="boot">
        <div className="brand-mark">
          <Flame />
        </div>
        <h1>
          KARHUTLA<span>.AI</span>
        </h1>
        <LoaderCircle className="spin" />
        <p>Menghubungkan command center…</p>
      </div>
    );
  if (!data)
    return (
      <div className="boot">
        <WifiOff size={32} />
        <h2>Backend belum terhubung</h2>
        <p>{error?.message}</p>
        <Button onClick={() => refetch()}>Coba kembali</Button>
        <small>Jalankan docker compose up --build -d</small>
      </div>
    );
  const active = data.incidents.filter((i) => !closed.includes(i.status)),
    pending = active.filter((i) => i.status === "pending_review");
  const camera = data.cameras.find((c) => c.id === workspace.cameraId),
    incident = data.incidents.find((i) => i.id === workspace.incidentId),
    drone = data.drones[0];
  const mission =
    data.missions.find((m) => m.id === drone?.mission_id) ||
    [...data.missions]
      .reverse()
      .find(
        (m) => workspace.view === "missions" || m.incident_id === incident?.id,
      );
  const onlineCameras = data.cameras.filter(
    (c) => c.connection_status === "connected",
  ).length;
  async function place(lat: number, lon: number) {
    if (!incident) return;
    await safely(
      `/api/incidents/${incident.id}`,
      { latitude: lat, longitude: lon },
      "PATCH",
    );
    workspace.setPlacing(false);
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <div className="brand-mark">
            <Flame size={22} />
          </div>
          <div>
            KARHUTLA<span>.AI</span>
            <small>WILDFIRE INTELLIGENCE</small>
          </div>
        </div>
        <div className="workspace-label">
          WORKSPACE <span>01</span>
        </div>
        <nav>
          {navigation.map((n) => (
            <button
              key={n.id}
              className={workspace.view === n.id ? "active" : ""}
              onClick={() => {
                workspace.setView(n.id);
                if (n.id === "overview") {
                  workspace.setReport(null);
                }
              }}
            >
              <n.icon size={17} />
              <span>{n.name}</span>
              {n.id === "incidents" && pending.length > 0 ? (
                <b>{pending.length}</b>
              ) : n.id === "overview" ? (
                <ChevronRight size={14} />
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment">
            <i /> LOCAL DEMO ENVIRONMENT
          </div>
          <p>
            Keputusan tetap di tangan operator.
            <br />
            Respons drone sepenuhnya virtual.
          </p>
          <div className="operator">
            <span>OP</span>
            <div>
              Operator Demo<small>Command Center · Lokal</small>
            </div>
            <Shield size={15} />
          </div>
        </div>
      </aside>
      <section className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Operasional <ChevronRight size={12} />
            <strong>
              {navigation.find((n) => n.id === workspace.view)?.name}
            </strong>
          </div>
          <div className="header-right">
            <span className={`connection ${connected ? "on" : ""}`}>
              <i />
              {connected ? "Realtime terhubung" : "Realtime menghubungkan"}
            </span>
            <span className="header-alert">
              <TriangleAlert size={14} />
              {active.length} insiden aktif
            </span>
            <button
              className="icon-button"
              aria-label="Notifikasi"
              onClick={() => setNotifications(true)}
            >
              <Bell size={18} />
              {pending.length > 0 && <i />}
            </button>
            <div className="avatar">OP</div>
          </div>
        </header>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              KALIMANTAN TENGAH · SEKTOR DEMONSTRASI
            </div>
            <h1>
              {navigation.find((n) => n.id === workspace.view)?.name}
              <span className="live-tag">
                <i />
                LIVE
              </span>
            </h1>
            <p>Pemantauan dini, verifikasi insiden, dan koordinasi respons.</p>
          </div>
          <div className="heading-meta">
            <span>
              <Clock size={14} />
              {now || "—"} WIB
            </span>
            <small>Koordinat demonstrasi · WGS84</small>
          </div>
        </div>
        <div className="operational-strip">
          <div>
            <Video size={17} />
            <span>
              KAMERA TERHUBUNG
              <strong>
                {onlineCameras}
                <small> / {data.cameras.length}</small>
              </strong>
            </span>
          </div>
          <div>
            <TriangleAlert size={17} />
            <span>
              MENUNGGU VERIFIKASI
              <strong className={pending.length ? "amber" : ""}>
                {pending.length.toString().padStart(2, "0")}
              </strong>
            </span>
          </div>
          <div>
            <Shield size={17} />
            <span>
              REGU SIAGA
              <strong>
                {data.response_units
                  .filter((u) => u.availability === "available")
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
            </span>
          </div>
          <div>
            <Plane size={17} />
            <span>
              DRONE VIRTUAL
              <strong className="blue">
                {drone ? label(drone.status) : "—"}
              </strong>
            </span>
          </div>
          <div className="ai-overview">
            <ScanLine size={17} />
            <span>
              VISION WORKER
              <strong
                className={
                  data.worker_fresh && data.demo.worker.model_ready
                    ? "green"
                    : "amber"
                }
              >
                {!data.worker_fresh
                  ? "Tidak terhubung"
                  : data.demo.worker.model_ready
                    ? "Model siap"
                    : "AI belum tersedia"}
              </strong>
            </span>
          </div>
        </div>
        {failure && (
          <div role="alert" className="error-banner">
            <AlertCircle size={15} />
            {failure}
            <button onClick={() => setFailure(null)} aria-label="Tutup pesan">
              <X size={14} />
            </button>
          </div>
        )}
        <div className="workspace">
          <div className="map-area">
            <div className="map-toolbar">
              <div>
                <span className="map-live-dot" /> Peta pemantauan{" "}
                <span className="subtle">/ Forest Sector B</span>
              </div>
              <div>
                <button
                  onClick={() => setOnline((v) => !v)}
                  className="map-tool"
                >
                  <Layers size={14} />
                  {online ? "Basemap online" : "GeoJSON lokal"}
                </button>
                <span className="map-tool">
                  <Radio size={13} />
                  {data.demo.speed}× simulasi
                  {data.demo.paused ? " · PAUSED" : ""}
                </span>
              </div>
            </div>
            <Map
              data={data}
              onLocation={place}
              online={online}
              onTileError={() => {
                setOnline(false);
                setNotice(
                  "Basemap online gagal dimuat · GeoJSON lokal tetap aktif",
                );
              }}
            />
            <div className="sector-label sector-north">
              SEKTOR B <small>AREA PEMANTAUAN DEMO</small>
            </div>
            <div className="sector-label sector-west">FOREST WEST</div>
            <div className="map-caption">
              <MapPin size={12} /> Geometri dan koordinat demonstrasi · bukan
              lokasi kebakaran terukur
              {online && <span> · © OpenStreetMap contributors</span>}
            </div>
            <div className="map-legend">
              <span>
                <i className="legend-camera" /> Kamera
              </span>
              <span>
                <i className="legend-incident" /> Insiden
              </span>
              <span>
                <i className="legend-drone" /> Drone virtual
              </span>
              <span>
                <i className="legend-team" /> Regu virtual
              </span>
            </div>
            {workspace.placing && (
              <div className="placement">
                <Target size={18} />
                <div>
                  Klik peta untuk menetapkan lokasi perkiraan
                  <small>
                    Deteksi satu kamera tidak menghasilkan posisi GPS kebakaran.
                  </small>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => workspace.setPlacing(false)}
                >
                  Batal
                </Button>
              </div>
            )}
            {workspace.view === "history" && (
              <div className="map-overlay-panel">
                <h2>
                  Riwayat insiden <span>{data.incidents.length}</span>
                </h2>
                {data.incidents.length === 0 ? (
                  <Empty text="Belum ada riwayat insiden." />
                ) : (
                  data.incidents.map((i) => (
                    <button
                      className="history-row"
                      key={i.id}
                      onClick={() => workspace.setReport(i.id)}
                    >
                      <span>
                        <strong>{i.id}</strong>
                        <small>
                          {i.camera_id} · {time(i.created_at)} WIB
                        </small>
                      </span>
                      <Status value={i.status} />
                      <FileText size={16} />
                    </button>
                  ))
                )}
                <div className="chart-wrap">
                  <p>Aktivitas tersimpan per kategori</p>
                  <ResponsiveContainer width="100%" height={110}>
                    <AreaChart
                      data={[
                        "incident",
                        "dispatch",
                        "mission",
                        "detection",
                        "camera",
                      ].map((name) => ({
                        name,
                        count: data.activities.filter((e) =>
                          e.type.startsWith(name + "."),
                        ).length,
                      }))}
                    >
                      <defs>
                        <linearGradient
                          id="chart-fill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#63b78d"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="100%"
                            stopColor="#63b78d"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "#82908b", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#1b2523",
                          border: "1px solid #37433e",
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#63b78d"
                        fill="url(#chart-fill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {workspace.view === "settings" && (
              <div className="map-overlay-panel">
                <h2>Konfigurasi sistem</h2>
                <div className="settings-summary">
                  <p>
                    <strong>Akses lokal</strong>
                    <span>localhost · satu operator</span>
                  </p>
                  <p>
                    <strong>AI inference</strong>
                    <span>
                      {data.demo.worker.model_ready
                        ? "Model kompatibel dimuat"
                        : "Belum tersedia"}
                    </span>
                  </p>
                  <p>
                    <strong>Inference terukur</strong>
                    <span>
                      {(data.demo.worker.inference_fps ?? 0).toFixed(2)} fps
                      total worker
                    </span>
                  </p>
                  <p>
                    <strong>Simulasi</strong>
                    <span>{data.demo.speed}× · drone dan tim virtual</span>
                  </p>
                </div>
                <p className="help-text">
                  Model, threshold, dan laju inference dikonfigurasi melalui
                  environment. Restart worker setelah mengubahnya.
                </p>
                {data.cameras.map((c) => (
                  <button
                    key={c.id}
                    className="history-row"
                    onClick={() => setCameraEditor(c)}
                  >
                    <span>
                      <strong>{c.id}</strong>
                      <small>
                        {c.source_type} · {c.name}
                      </small>
                    </span>
                    <Settings size={16} />
                  </button>
                ))}
                <p className="help-text">
                  Footage referensi publik diberi atribusi di panduan demo.
                  Model belum divalidasi untuk penggunaan operasional.
                </p>
              </div>
            )}
            {data.demo_enabled && (
              <div className={`demo-controller ${demoOpen ? "expanded" : ""}`}>
                <button
                  className="demo-heading"
                  onClick={() => setDemoOpen((v) => !v)}
                >
                  <div>
                    <Play size={14} />
                    <strong>Demo Scenario Controller</strong>
                    <span>{label(data.demo.status)}</span>
                  </div>
                  <ChevronDown size={16} />
                </button>
                {demoOpen && (
                  <>
                    <p>Forest Sector B — Early Smoke Detection</p>
                    <div className="demo-readiness">
                      <span
                        className={
                          data.demo.worker.model_ready ? "green" : "amber"
                        }
                      >
                        AI{" "}
                        {data.demo.worker.model_ready ? "siap" : "belum siap"}
                      </span>
                      <span
                        className={
                          data.demo.worker.footage_ready ? "green" : "amber"
                        }
                      >
                        Footage{" "}
                        {data.demo.worker.footage_ready ? "siap" : "belum siap"}
                      </span>
                      <select
                        aria-label="Kecepatan simulasi"
                        value={data.demo.speed}
                        onChange={(e) =>
                          safely("/api/demo/control", {
                            speed: Number(e.target.value),
                          })
                        }
                      >
                        {[1, 5, 8, 10].map((n) => (
                          <option value={n} key={n}>
                            {n}× simulasi
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="demo-buttons">
                      <Button
                        size="sm"
                        disabled={
                          busy ||
                          data.demo.status !== "idle" ||
                          !data.worker_fresh ||
                          !data.demo.worker.model_ready ||
                          !data.demo.worker.footage_ready
                        }
                        onClick={() =>
                          safely("/api/demo/scenarios/forest-sector-b/start", {
                            mode: "ai",
                          })
                        }
                      >
                        <ScanLine size={13} />
                        Mulai AI
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || data.demo.status !== "idle"}
                        onClick={() =>
                          safely("/api/demo/scenarios/forest-sector-b/start", {
                            mode: "manual_simulation",
                          })
                        }
                      >
                        Mode manual
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        aria-label={
                          data.demo.paused
                            ? "Lanjutkan skenario"
                            : "Jeda skenario"
                        }
                        onClick={() =>
                          safely("/api/demo/control", {
                            paused: !data.demo.paused,
                          })
                        }
                      >
                        {data.demo.paused ? (
                          <Play size={14} />
                        ) : (
                          <Pause size={14} />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        aria-label="Reset skenario"
                        onClick={() =>
                          ask(
                            "Reset skenario demo?",
                            "Data insiden, misi, dan evidence demo akan dibersihkan. Drone dan regu kembali siaga.",
                            "/api/demo/reset",
                          )
                        }
                      >
                        <RotateCcw size={14} />
                      </Button>
                    </div>
                    {data.demo.status !== "idle" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="demo-replay"
                        disabled={busy}
                        onClick={() =>
                          ask(
                            "Replay skenario?",
                            "Replay membersihkan data demo dan memulai video dari awal dalam mode yang sama.",
                            "/api/demo/replay",
                            { mode: data.demo.mode },
                          )
                        }
                      >
                        <RotateCcw size={12} />
                        Replay skenario
                      </Button>
                    )}
                    {data.demo.status === "running" &&
                      data.demo.mode === "manual_simulation" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="manual-event"
                          disabled={busy || data.demo.paused}
                          onClick={() => safely("/api/demo/manual-event", {})}
                        >
                          Buat Kejadian Simulasi Manual
                        </Button>
                      )}
                    <small>
                      {data.demo.mode === "manual_simulation" &&
                      data.demo.status === "running"
                        ? "SIMULASI MANUAL · tidak berasal dari inference"
                        : "Mulai AI hanya memutar video; alert berasal dari inference."}
                    </small>
                  </>
                )}
              </div>
            )}
          </div>
          <aside className="context-panel">
            <div className="panel-heading">
              <span>
                {incident
                  ? "DETAIL INSIDEN"
                  : camera
                    ? "MONITOR KAMERA"
                    : workspace.view === "missions"
                      ? "MISSION CONTROL"
                      : workspace.view === "response"
                        ? "OPERASI RESPONS"
                        : "ANTREAN INSIDEN"}
              </span>
              <span>
                {incident || camera ? (
                  <button
                    aria-label="Kembali ke antrean"
                    onClick={() => {
                      useWorkspace.setState({
                        incidentId: null,
                        cameraId: null,
                        placing: false,
                      });
                    }}
                  >
                    <X size={16} />
                  </button>
                ) : (
                  <span className="count-label">{active.length} aktif</span>
                )}
              </span>
            </div>
            <div className="panel-scroll">
              {incident ? (
                <IncidentPanel
                  incident={incident}
                  data={data}
                  busy={busy}
                  safely={safely}
                  ask={ask}
                />
              ) : camera ? (
                <CameraPanel
                  camera={camera}
                  onEdit={() => setCameraEditor(camera)}
                />
              ) : workspace.view === "cameras" ? (
                <CameraNetworkPanel data={data} />
              ) : workspace.view === "missions" ? (
                <MissionPanel
                  mission={mission}
                  data={data}
                  busy={busy}
                  ask={ask}
                />
              ) : workspace.view === "response" ? (
                <ResponsePanel data={data} busy={busy} safely={safely} />
              ) : (
                <>
                  <div className="panel-intro">
                    <h2>Situasi terkini</h2>
                    <p>
                      {pending.length
                        ? "Kandidat membutuhkan verifikasi operator."
                        : "Pantau kamera dan tinjau kandidat yang masuk."}
                    </p>
                  </div>
                  {active.length ? (
                    active.map((i) => (
                      <button
                        key={i.id}
                        className="incident-item"
                        onClick={() => workspace.selectIncident(i.id)}
                      >
                        <div className="incident-item-top">
                          <span>
                            <Flame size={15} />
                            {i.category === "smoke"
                              ? "Indikasi asap"
                              : "Indikasi api"}
                          </span>
                          <ArrowUpRight size={15} />
                        </div>
                        <div className="incident-item-info">
                          {i.camera_id}
                          <span>{time(i.created_at)} WIB</span>
                        </div>
                        <Status value={i.status} />
                        <Provenance incident={i} />
                      </button>
                    ))
                  ) : (
                    <div className="empty-queue">
                      <CheckCircle2 size={30} />
                      <h3>Belum ada insiden aktif</h3>
                      <p>
                        Alert akan muncul setelah temporal validation atau
                        kejadian simulasi manual.
                      </p>
                    </div>
                  )}
                  <div className="divider-label">KONEKTIVITAS KAMERA</div>
                  {data.cameras.map((c) => (
                    <button
                      key={c.id}
                      className="camera-list-item"
                      onClick={() => workspace.selectCamera(c.id)}
                    >
                      <div className="camera-icon">
                        <Video size={16} />
                      </div>
                      <div>
                        <strong>{c.id}</strong>
                        <small>{c.name}</small>
                      </div>
                      <Status value={c.connection_status} />
                    </button>
                  ))}
                  <div className="system-note">
                    <Shield size={15} />
                    <p>Semua kandidat harus diverifikasi sebelum dispatch.</p>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
        <div className="bottom-grid">
          <section className="camera-strip">
            <div className="section-heading">
              <span>
                <Video size={15} /> LIVE CAMERA NETWORK
              </span>
              <small>
                {onlineCameras}/{data.cameras.length} terhubung
              </small>
            </div>
            <div className="preview-grid">
              {data.cameras.map((c) => (
                <button
                  key={c.id}
                  className={`preview ${workspace.cameraId === c.id ? "selected" : ""}`}
                  onClick={() => workspace.selectCamera(c.id)}
                >
                  <div className="preview-video">
                    <Stream camera={c} />
                    <span className="preview-label">
                      {c.id}
                      <i
                        className={
                          c.connection_status === "connected" ? "on" : ""
                        }
                      />
                    </span>
                    <span className="preview-ai">
                      {c.ai_status === "ready"
                        ? "AI READY"
                        : label(c.ai_status)}
                    </span>
                  </div>
                  <div className="preview-meta">
                    <strong>{c.name}</strong>
                    <span>{time(c.last_frame_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <section className="activity-strip">
            <div className="section-heading">
              <span>
                <Activity size={15} /> AKTIVITAS TERBARU
              </span>
              <button
                onClick={() => setNotifications(true)}
                aria-label="Lihat semua aktivitas"
              >
                <ArrowUpRight size={14} />
              </button>
            </div>
            <Timeline events={data.activities.slice(0, 3)} />
          </section>
        </div>
        <footer>
          <span>
            <i /> KARHUTLA.AI · SUSTAINABILITY HACKATHON MVP
          </span>
          <span>
            Operator verification required <span className="footer-dot">·</span>{" "}
            Drone & team simulation
          </span>
        </footer>
      </section>
      {notice && (
        <div className="toast" role="status">
          <TriangleAlert size={18} />
          {notice}
          <button aria-label="Tutup notifikasi" onClick={() => setNotice(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      <AlertDialog.Root
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="modal-overlay" />
          <AlertDialog.Content className="confirm-modal">
            <AlertDialog.Title>{confirm?.title}</AlertDialog.Title>
            <AlertDialog.Description>
              {confirm?.message}
            </AlertDialog.Description>
            <div className="confirm-buttons">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">Batal</Button>
              </AlertDialog.Cancel>
              <Button
                disabled={busy}
                onClick={async () => {
                  try {
                    await confirm?.action();
                  } catch {
                  } finally {
                    setConfirm(null);
                  }
                }}
              >
                {busy ? "Memproses…" : "Konfirmasi"}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <Modal
        open={notifications}
        onClose={() => setNotifications(false)}
        title="Aktivitas operasional"
      >
        <Timeline events={data.activities} />
      </Modal>
      <ReportModal
        id={workspace.reportId}
        onClose={() => workspace.setReport(null)}
      />
      {cameraEditor && (
        <CameraEditor
          camera={cameraEditor}
          onClose={() => setCameraEditor(null)}
          save={act}
          busy={busy}
        />
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty-small">{text}</div>;
}
function CameraNetworkPanel({ data }: { data: Bootstrap }) {
  return (
    <div className="detail-body">
      <h2>Jaringan pemantauan</h2>
      <p className="help-text">
        Tiga kamera virtual. Pilih kamera untuk melihat preview, sektor, dan
        konfigurasi sumber.
      </p>
      {data.cameras.map((camera) => (
        <button
          key={camera.id}
          className="network-camera"
          onClick={() => useWorkspace.getState().selectCamera(camera.id)}
        >
          <div>
            <Video size={17} />
            <strong>{camera.id}</strong>
            <Status value={camera.connection_status} />
          </div>
          <span>{camera.name}</span>
          <small>
            {camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)} · FOV{" "}
            {camera.fov}°
          </small>
          <small>
            AI: {label(camera.ai_status)} · frame {time(camera.last_frame_at)}
          </small>
        </button>
      ))}
    </div>
  );
}
function Timeline({ events }: { events: Event[] }) {
  return (
    <div className="timeline">
      {events.length ? (
        events.map((event) => (
          <div className="timeline-event" key={event.event_id}>
            <i />
            <div>
              <strong>{eventName[event.type] || event.type}</strong>
              <small>
                {String(
                  event.data.camera_id ||
                    event.data.mission_id ||
                    event.data.unit_id ||
                    event.data.incident_id ||
                    "Sistem",
                )}
                {event.data.provenance === "manual_simulation"
                  ? " · SIMULASI"
                  : ""}
              </small>
            </div>
            <time>{time(event.timestamp)}</time>
          </div>
        ))
      ) : (
        <Empty text="Belum ada aktivitas tersimpan." />
      )}
    </div>
  );
}
function CameraPanel({
  camera,
  onEdit,
}: {
  camera: Camera;
  onEdit: () => void;
}) {
  const [annotated, setAnnotated] = useState(false);
  const { data: detections = [] } = useQuery({
    queryKey: ["detections", camera.id],
    queryFn: () =>
      request<
        {
          id: string;
          category: string;
          confidence: number;
          captured_at: string;
          provenance: string;
        }[]
      >(`/api/cameras/${camera.id}/detections`),
    refetchInterval: 5000,
  });
  return (
    <div className="detail-body">
      <div className="detail-kicker">{camera.id}</div>
      <h2>{camera.name}</h2>
      <div className="status-row">
        <Status value={camera.connection_status} />
        <Status value={camera.ai_status} />
      </div>
      <div className="detail-video">
        <Stream camera={camera} annotated={annotated} />
      </div>
      {camera.source_config.normal === "/videos/normal.mp4" && (
        <p className="footage-attribution">
          <a
            href="https://zenodo.org/records/836749"
            target="_blank"
            rel="noreferrer"
          >
            FIRESENSE · CC BY 4.0
          </a>{" "}
          · footage referensi, bukan rekaman Kalimantan.
        </p>
      )}
      <div className="segmented">
        <button
          className={!annotated ? "active" : ""}
          onClick={() => setAnnotated(false)}
        >
          Preview
        </button>
        <button
          className={annotated ? "active" : ""}
          onClick={() => setAnnotated(true)}
        >
          Frame AI + bbox
        </button>
      </div>
      <dl className="metadata">
        <dt>Lokasi demo</dt>
        <dd>
          {camera.latitude.toFixed(5)}, {camera.longitude.toFixed(5)}
        </dd>
        <dt>Azimuth / FOV</dt>
        <dd>
          {camera.heading}° / {camera.fov}°
        </dd>
        <dt>Jangkauan perkiraan</dt>
        <dd>{camera.range_m} m</dd>
        <dt>Sumber</dt>
        <dd>{camera.source_type.toUpperCase()}</dd>
        <dt>Frame terakhir</dt>
        <dd>{time(camera.last_frame_at)} WIB</dd>
        <dt>Inference terakhir</dt>
        <dd>{time(camera.last_inference_at)} WIB</dd>
        <dt>Deteksi terakhir</dt>
        <dd>{time(camera.last_detection_at)} WIB</dd>
      </dl>
      <Button variant="outline" className="full-width" onClick={onEdit}>
        <Settings size={14} />
        Konfigurasi kamera
      </Button>
      <div className="divider-label">DETEKSI TERVALIDASI</div>
      {detections.length ? (
        detections.slice(0, 8).map((d) => (
          <div className="detection-row" key={d.id}>
            <span>
              {d.category}{" "}
              <small>
                {d.provenance === "ai"
                  ? `${(d.confidence * 100).toFixed(1)}%`
                  : "SIMULASI"}
              </small>
            </span>
            <time>{time(d.captured_at)}</time>
          </div>
        ))
      ) : (
        <Empty text="Belum ada deteksi tervalidasi." />
      )}
      <p className="help-text">
        Confidence adalah output model, bukan ukuran akurasi. Frame AI
        beranotasi memiliki timestamp sendiri.
      </p>
    </div>
  );
}
type Actions = {
  busy: boolean;
  safely: (path: string, body?: unknown, method?: string) => Promise<void>;
  ask: (title: string, message: string, path: string, body?: unknown) => void;
};
function IncidentPanel({
  incident,
  data,
  busy,
  safely,
  ask,
}: { incident: Incident; data: Bootstrap } & Actions) {
  const workspace = useWorkspace(),
    [notes, setNotes] = useState(incident.notes),
    [type, setType] = useState("suppression_simulation");
  useEffect(() => setNotes(incident.notes), [incident.id]);
  const missions = data.missions.filter((m) => m.incident_id === incident.id),
    mission =
      missions.find((m) => !terminal.includes(m.status)) || missions.at(-1),
    drone = data.drones[0];
  const canDispatch = ["confirmed", "dispatched", "in_progress"].includes(
    incident.status,
  );
  return (
    <div className="detail-body">
      <div className="detail-kicker">{incident.id}</div>
      <h2>
        {incident.category === "smoke" ? "Indikasi asap" : "Indikasi api"}{" "}
        <span>{incident.camera_id}</span>
      </h2>
      <div className="status-row">
        <Status value={incident.status} />
      </div>
      <Provenance incident={incident} />
      <div className="evidence">
        {incident.evidence_path ? (
          <img
            src={`${API}/api/evidence/${incident.evidence_path.replace(/^evidence\//, "")}`}
            alt="Snapshot evidence hasil inference"
          />
        ) : (
          <div className="evidence-manual">
            <TriangleAlert size={26} />
            <strong>Kejadian simulasi manual</strong>
            <span>Tidak ada evidence inference AI.</span>
          </div>
        )}
        <div>
          {incident.provenance === "ai"
            ? `Confidence ${(incident.confidence * 100).toFixed(1)}%`
            : "PROVENANCE: MANUAL SIMULATION"}
          <time>{time(incident.created_at)} WIB</time>
        </div>
      </div>
      <label className="field-label" htmlFor="incident-notes">
        Catatan operator
      </label>
      <textarea
        id="incident-notes"
        value={notes}
        maxLength={4000}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Hasil pemeriksaan evidence…"
      />
      {incident.status === "pending_review" ? (
        <>
        <Button
          className="full-width auto-response-button"
          disabled={busy || drone?.status !== "available"}
          onClick={() => ask(
            "Verifikasi & izinkan drone otomatis?",
            "Dengan persetujuan ini, insiden dikonfirmasi dan drone virtual langsung berangkat ke titik perkiraan, memindai area, lalu pulang otomatis. Tidak menunggu konfirmasi petugas damkar. Lokasi hasil pemindaian tetap simulasi.",
            `/api/incidents/${incident.id}/respond`, { notes, mission_type: "reconnaissance" },
          )}
        ><Plane size={15} /> Verifikasi & kirim drone otomatis</Button>
        <p className="help-text">Persetujuan operator mencakup launch dan pemindaian virtual. Alarm tidak otomatis mengirim drone.</p>
        <div className="action-pair">
          <Button
            disabled={busy}
            onClick={() =>
              ask(
                "Konfirmasi insiden?",
                "Evidence telah ditinjau operator. Konfirmasi membuka tindakan dispatch.",
                `/api/incidents/${incident.id}/confirm`,
                { notes },
              )
            }
          >
            <Check size={14} />
            Konfirmasi
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              ask(
                "Tolak kandidat?",
                "Kandidat dicatat sebagai alarm palsu dan tetap tersedia di riwayat.",
                `/api/incidents/${incident.id}/reject`,
                { notes },
              )
            }
          >
            Alarm palsu
          </Button>
        </div>
        </>
      ) : (
        !closed.includes(incident.status) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              safely(`/api/incidents/${incident.id}`, { notes }, "PATCH")
            }
            disabled={busy}
          >
            Simpan catatan
          </Button>
        )
      )}
      <div className="divider-label">LOKASI PERKIRAAN</div>
      <div className="location-box">
        <MapPin size={18} />
        <div>
          <strong>
            {incident.latitude !== null
              ? `${incident.latitude.toFixed(5)}, ${incident.longitude!.toFixed(5)}`
              : "Target belum ditentukan"}
          </strong>
          <small>{locationLabel(incident)}</small>
          {incident.location_uncertainty_m !== null && <small>Radius asumsi ±{incident.location_uncertainty_m.toFixed(0)} m · bukan akurasi terukur</small>}
        </div>
      </div>
      <Button
        className="full-width"
        variant="outline"
        disabled={busy || !canDispatch}
        onClick={() => workspace.setPlacing(true)}
      >
        <Target size={14} />
        {incident.latitude === null
          ? "Tentukan lokasi di peta"
          : "Ubah lokasi perkiraan"}
      </Button>
      <div className="divider-label">DISPATCH REGU · VIRTUAL</div>
      {data.response_units.map((unit) => {
        const dispatch = data.dispatches.find(
          (d) =>
            d.incident_id === incident.id &&
            d.unit_id === unit.id &&
            d.status !== "completed",
        );
        return (
          <div key={unit.id} className="unit-card">
            <div>
              <Shield size={15} />
              <strong>{unit.name}</strong>
              <small>{label(dispatch?.status || unit.availability)}</small>
            </div>
            {dispatch ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  safely(`/api/dispatches/${dispatch.id}/update-status`, {
                    status: (
                      {
                        assigned: "accepted",
                        accepted: "responding",
                        responding: "on_site",
                        on_site: "completed",
                      } as Record<string, string>
                    )[dispatch.status],
                  })
                }
              >
                {
                  (
                    {
                      assigned: "Terima",
                      accepted: "Mulai respons",
                      responding: "Tiba di lokasi",
                      on_site: "Selesai",
                    } as Record<string, string>
                  )[dispatch.status]
                }
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={
                  busy || !canDispatch || unit.availability !== "available"
                }
                onClick={() =>
                  ask(
                    "Tugaskan regu?",
                    "Assignment dan gerakan regu dalam MVP ini merupakan operasi virtual.",
                    `/api/incidents/${incident.id}/dispatch`,
                    { unit_id: unit.id },
                  )
                }
              >
                <Send size={12} />
                Tugaskan
              </Button>
            )}
          </div>
        );
      })}
      <div className="divider-label">DRONE MISSION CONTROL</div>
      {canDispatch && drone?.status === "available" && !mission && <Button
        className="full-width auto-response-button"
        disabled={busy}
        onClick={() => ask("Izinkan drone otomatis?", "Drone virtual akan terbang, memindai, lalu pulang otomatis tanpa menunggu regu damkar.", `/api/incidents/${incident.id}/respond`, { notes, mission_type: "reconnaissance" })}
      ><Plane size={14} /> Kirim drone otomatis</Button>}
      {mission ? (
        <MissionPanel
          mission={mission}
          data={data}
          busy={busy}
          ask={ask}
          compact
        />
      ) : (
        <>
          <select
            aria-label="Jenis misi"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="suppression_simulation">
              Suppression Simulation
            </option>
            <option value="reconnaissance">Reconnaissance</option>
          </select>
          <Button
            className="full-width"
            disabled={
              busy ||
              !canDispatch ||
              incident.latitude === null ||
              drone?.status !== "available"
            }
            onClick={() =>
              safely("/api/missions", {
                incident_id: incident.id,
                drone_id: drone.id,
                mission_type: type,
              })
            }
          >
            <Plane size={14} />
            Buat proposal misi
          </Button>
          <p className="help-text">
            Koordinat target wajib diisi. Approval dan launch dilakukan
            terpisah.
          </p>
        </>
      )}
      {incident.status === "in_progress" && (
        <Button
          className="full-width"
          variant="outline"
          disabled={busy}
          onClick={() =>
            ask(
              "Konfirmasi kebakaran teratasi?",
              "Pelepasan payload virtual tidak membuktikan api padam. Resolusi merupakan keputusan eksplisit operator.",
              `/api/incidents/${incident.id}/resolve`,
              { notes },
            )
          }
        >
          <CheckCircle2 size={14} />
          Tandai teratasi
        </Button>
      )}
      {["resolved", "false_alarm"].includes(incident.status) && (
        <Button
          className="full-width"
          variant="outline"
          disabled={busy}
          onClick={() =>
            ask(
              "Tutup insiden?",
              "Penutupan akan dicatat pada riwayat operasional.",
              `/api/incidents/${incident.id}/close`,
              { notes },
            )
          }
        >
          Tutup insiden
        </Button>
      )}
      <Button
        variant="ghost"
        className="full-width"
        onClick={() => workspace.setReport(incident.id)}
      >
        <FileText size={14} />
        Lihat laporan dan timeline
      </Button>
    </div>
  );
}
function MissionPanel({
  mission,
  data,
  busy,
  ask,
  compact = false,
}: {
  mission: Mission | undefined;
  data: Bootstrap;
  busy: boolean;
  ask: Actions["ask"];
  compact?: boolean;
}) {
  const drone =
    data.drones.find((d) => d.id === mission?.drone_id) || data.drones[0];
  if (!drone) return <Empty text="Drone belum tersedia." />;
  const action = (
    name: string,
    title: string,
    message: string,
    body: unknown = {},
  ) =>
    mission && ask(title, message, `/api/missions/${mission.id}/${name}`, body);
  return (
    <div className={compact ? "mission-card" : "detail-body"}>
      <div className="mission-top">
        <Plane size={21} />
        <div>
          <strong>{drone.id}</strong>
          <small>Wildfire Response UAV · VIRTUAL</small>
        </div>
        <Status value={mission?.status || drone.status} />
      </div>
      {mission?.automatic && <p className="help-text">AUTO · Disetujui operator. Pemindaian dan kembali ke base berjalan otomatis tanpa aksi regu. Pemindaian lokasi bersifat virtual.</p>}
      <div className="telemetry-grid">
        <div>
          <Battery size={13} />
          <span>Baterai</span>
          <strong>
            {drone.battery_pct.toFixed(1)}
            <small>%</small>
          </strong>
        </div>
        <div>
          <Navigation size={13} />
          <span>Altitude</span>
          <strong>
            {drone.altitude_m}
            <small>m</small>
          </strong>
        </div>
        <div>
          <Package size={13} />
          <span>Payload</span>
          <strong>
            {drone.payload_l.toFixed(1)}
            <small>L</small>
          </strong>
        </div>
        <div>
          <ArrowUpRight size={13} />
          <span>Speed virtual</span>
          <strong>
            {mission && ["en_route", "returning"].includes(mission.status)
              ? drone.speed_mps
              : 0}
            <small>m/s</small>
          </strong>
        </div>
      </div>
      <div className="battery-track">
        <span style={{ width: `${drone.battery_pct}%` }} />
      </div>
      {mission ? (
        <>
          <div className="mission-route">
            <span>{mission.id}</span>
            <small>
              {mission.mission_type === "reconnaissance"
                ? "Reconnaissance"
                : "Suppression Simulation"}
            </small>
            <p>
              <Target size={13} />
              {mission.target_latitude.toFixed(5)},{" "}
              {mission.target_longitude.toFixed(5)}
            </p>
            <div>
              <span>{(mission.distance_m / 1000).toFixed(2)} km tersisa</span>
              <strong>ETA {Math.ceil(mission.eta_s)}s sim</strong>
            </div>
            <small>
              {data.demo.speed}× · ETA aktual ≈{" "}
              {Math.ceil(mission.eta_s / data.demo.speed)}s
            </small>
          </div>
          <div className="mission-controls">
            <Button
              size="sm"
              disabled={busy || mission.status !== "proposed"}
              onClick={() =>
                action(
                  "approve",
                  "Setujui misi virtual?",
                  "Operator menyetujui target perkiraan dan rencana misi.",
                )
              }
            >
              <Check size={13} />
              Approve
            </Button>
            <Button
              size="sm"
              disabled={busy || mission.status !== "approved"}
              onClick={() =>
                action(
                  "launch",
                  "Launch drone virtual?",
                  "Drone simulasi bergerak geografis ke target dengan percepatan waktu yang ditampilkan.",
                )
              }
            >
              <Play size={13} />
              Launch
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                busy ||
                mission.status !== "on_site" ||
                mission.mission_type !== "suppression_simulation" ||
                drone.payload_l <= 0
              }
              onClick={() =>
                action(
                  "release-payload",
                  "Lepaskan payload virtual?",
                  "Aksi simulasi ini tidak menyatakan kebakaran telah padam.",
                  { liters: drone.payload_l, command_id: crypto.randomUUID() },
                )
              }
            >
              <Package size={13} />
              Payload
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                busy ||
                !["en_route", "on_site", "suppression_simulation"].includes(
                  mission.status,
                )
              }
              onClick={() =>
                action(
                  "return",
                  "Kembali ke base?",
                  "Drone virtual akan bergerak kembali ke home base.",
                )
              }
            >
              <RotateCcw size={13} />
              Return
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={
                busy ||
                terminal.includes(mission.status) ||
                mission.status === "returning"
              }
              onClick={() =>
                action(
                  "abort",
                  "Abort misi?",
                  "Proposal dibatalkan. Drone yang telah terbang akan kembali ke base sebelum assignment dilepas.",
                )
              }
            >
              <X size={13} />
              Abort
            </Button>
          </div>
          <p className="help-text">
            {terminal.includes(mission.status)
              ? "Misi berakhir. Status insiden tetap membutuhkan keputusan operator."
              : "State dan telemetry berasal dari backend. Semua parameter drone bersifat virtual."}
          </p>
        </>
      ) : (
        <Empty text="Belum ada misi. Pilih insiden terverifikasi untuk membuat proposal." />
      )}
    </div>
  );
}
function ResponsePanel({
  data,
  busy,
  safely,
}: {
  data: Bootstrap;
  busy: boolean;
  safely: Actions["safely"];
}) {
  return (
    <div className="detail-body">
      <h2>Regu respons virtual</h2>
      <p className="help-text">
        Pergerakan langsung secara geografis; tidak memakai navigasi jalan.
      </p>
      {data.response_units.map((unit) => (
        <div className="response-unit" key={unit.id}>
          <Shield size={20} />
          <h3>{unit.name}</h3>
          <Status value={unit.response_status} />
          <p>
            {unit.latitude.toFixed(5)}, {unit.longitude.toFixed(5)}
          </p>
          {unit.assigned_incident && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                useWorkspace.getState().selectIncident(unit.assigned_incident!)
              }
            >
              Buka insiden
            </Button>
          )}
        </div>
      ))}
      <div className="divider-label">ASSIGNMENT</div>
      {data.dispatches.length ? (
        data.dispatches.map((d) => (
          <div className="detection-row" key={d.id}>
            <span>
              {d.unit_id}
              <small>{d.incident_id}</small>
            </span>
            <Status value={d.status} />
          </div>
        ))
      ) : (
        <Empty text="Belum ada assignment." />
      )}
    </div>
  );
}
function ReportModal({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data, error } = useQuery({
    queryKey: ["report", id],
    queryFn: () => request<Report>(`/api/incidents/${id}/report`),
    enabled: !!id,
  });
  function download() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.id}-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title="Laporan insiden operasional"
      wide
    >
      {error ? (
        <p>{error.message}</p>
      ) : !data ? (
        <p>Memuat laporan…</p>
      ) : (
        <div className="report-body">
          <div className="report-header">
            <div>
              <small>{data.id}</small>
              <h2>
                {data.camera_id} ·{" "}
                {data.category === "smoke" ? "Indikasi asap" : "Indikasi api"}
              </h2>
              <Provenance incident={data} />
            </div>
            <Status value={data.status} />
            <Button variant="outline" size="sm" onClick={download}>
              <Download size={14} />
              JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              Cetak
            </Button>
          </div>
          <div className="report-grid">
            <div>
              {data.evidence_path ? (
                <img
                  className="report-image"
                  src={`${API}/api/evidence/${data.evidence_path.replace(/^evidence\//, "")}`}
                  alt="Evidence insiden"
                />
              ) : (
                <div className="evidence-manual">
                  <TriangleAlert />
                  <strong>Simulasi manual</strong>
                  <span>Tidak ada evidence AI.</span>
                </div>
              )}
              <dl className="metadata">
                <dt>Deteksi</dt>
                <dd>{time(data.created_at)} WIB</dd>
                <dt>Verifikasi</dt>
                <dd>{time(data.verified_at)} WIB</dd>
                <dt>Resolusi</dt>
                <dd>{time(data.resolved_at)} WIB</dd>
                <dt>Deteksi → verifikasi</dt>
                <dd>
                  {data.intervals.detection_to_verification_s?.toFixed(1) ??
                    "—"}{" "}
                  s aktual
                </dd>
                <dt>Lokasi perkiraan</dt>
                <dd>
                  {data.latitude?.toFixed(5) ?? "Belum diisi"},{" "}
                  {data.longitude?.toFixed(5) ?? "—"}
                </dd>
              </dl>
              <p className="help-text">
                {data.notes || "Tidak ada catatan operator."}
              </p>
              {data.missions.map((m) => (
                <div className="report-mission" key={m.id}>
                  <strong>{m.id}</strong>
                  <dl className="metadata">
                    <dt>Launch</dt>
                    <dd>{time(m.launched_at)}</dd>
                    <dt>Arrival</dt>
                    <dd>{time(m.arrived_at)}</dd>
                    <dt>Completion</dt>
                    <dd>{time(m.completed_at)}</dd>
                    <dt>Waktu perjalanan aktual</dt>
                    <dd>{m.travel_wall_seconds?.toFixed(1) ?? "—"} s</dd>
                    <dt>Durasi simulasi</dt>
                    <dd>{m.simulation_elapsed_s.toFixed(1)} s</dd>
                    <dt>State</dt>
                    <dd>{label(m.status)}</dd>
                  </dl>
                </div>
              ))}
              {data.dispatches.map((d) => (
                <p key={d.id} className="help-text">
                  {d.unit_id} · dispatch {time(d.created_at)} ·{" "}
                  {label(d.status)}
                </p>
              ))}
            </div>
            <div>
              <div className="divider-label">TIMELINE TERSIMPAN</div>
              <Timeline events={data.timeline} />
            </div>
          </div>
          <p className="report-disclaimer">{data.disclaimer}</p>
        </div>
      )}
    </Modal>
  );
}
function CameraEditor({
  camera,
  onClose,
  save,
  busy,
}: {
  camera: Camera;
  onClose: () => void;
  save: Actions["safely"];
  busy: boolean;
}) {
  const [sourceType, setSourceType] = useState(camera.source_type),
    [config, setConfig] = useState(
      JSON.stringify(camera.source_config, null, 2),
    ),
    [heading, setHeading] = useState(camera.heading),
    [fov, setFov] = useState(camera.fov),
    [range, setRange] = useState(camera.range_m),
    [error, setError] = useState("");
  async function submit() {
    let source_config;
    try {
      source_config = JSON.parse(config);
    } catch {
      setError("JSON source configuration tidak valid");
      return;
    }
    try {
      await save(
        `/api/cameras/${camera.id}`,
        {
          source_type: sourceType,
          source_config,
          heading,
          fov,
          range_m: range,
        },
        "PATCH",
      );
      onClose();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Konfigurasi ${camera.id}`}>
      <div className="editor-body">
        <label className="field-label">Jenis sumber</label>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
        >
          <option value="mp4">MP4 lokal</option>
          <option value="rtsp">RTSP stream</option>
          <option value="webcam">Webcam (native)</option>
        </select>
        <label className="field-label">Source configuration (JSON)</label>
        <textarea
          className="config-input"
          value={config}
          onChange={(e) => setConfig(e.target.value)}
        />
        <p className="help-text">
          MP4: normal/scenario di /videos. RTSP: url. Webcam: index integer.
          Perubahan memulai ulang capture.
        </p>
        <div className="editor-numbers">
          <label>
            Azimuth
            <input
              type="number"
              value={heading}
              min="0"
              max="359"
              onChange={(e) => setHeading(Number(e.target.value))}
            />
          </label>
          <label>
            FOV
            <input
              type="number"
              value={fov}
              min="1"
              max="180"
              onChange={(e) => setFov(Number(e.target.value))}
            />
          </label>
          <label>
            Range (m)
            <input
              type="number"
              value={range}
              min="1"
              max="20000"
              onChange={(e) => setRange(Number(e.target.value))}
            />
          </label>
        </div>
        {error && <p role="alert">{error}</p>}
        <Button disabled={busy} onClick={submit}>
          Simpan konfigurasi
        </Button>
      </div>
    </Modal>
  );
}
