"use client";
import dynamic from "next/dynamic";
import { Plane, Radio, Battery, Navigation, ScanLine, MapPin, Home, Clock, Target, Package } from "lucide-react";
import { useOperations } from "@/lib/use-operations";
import { label, time } from "@/lib/api";
import { locationLabel } from "@/lib/location";
import { DronePOV } from "./drone-pov";
import { Button } from "./ui/button";
const MonitoringMap = dynamic(() => import("./monitoring-map"), { ssr: false });
const terminal = ["completed", "cancelled", "aborted", "failed"];

export function DronePanel() {
  const { data, error, connected, refetch } = useOperations();
  if (!data) return <main className="role-wait"><Plane size={36} /><h1>POV Drone</h1><p>{error?.message || "Menghubungkan telemetri…"}</p>{error && <Button onClick={() => refetch()}>Coba kembali</Button>}</main>;
  const drone = data.drones[0];
  if (!drone) return <main className="role-wait"><h1>Drone belum dikonfigurasi</h1></main>;
  const mission = data.missions.find(m => m.id === drone.mission_id) || data.missions.at(-1);
  const incident = data.incidents.find(i => i.id === mission?.incident_id);
  const active = mission && !terminal.includes(mission.status);
  const scanning = mission && ["on_site", "suppression_simulation"].includes(mission.status);
  const releasing = mission?.status === "suppression_simulation";
  const events = mission ? data.activities.filter(e => e.data.mission_id === mission.id).slice(0, 10) : [];
  return <main className="drone-page">
    <header className="role-page-heading"><div><div className="eyebrow">AUTONOMOUS RECON · SELURUH OPERASI VIRTUAL</div><h1><Plane size={29} /> POV Drone <span className="drone-auto-tag">{mission?.automatic ? "AUTO" : "VIRTUAL"}</span></h1><p>Footage udara hutan dan kebakaran mengikuti tahap penerbangan virtual.</p></div><span className={`connection ${connected ? "on" : ""}`}><i />{connected ? "Telemetri terhubung" : "Telemetri menghubungkan"}</span></header>
    <div className="drone-layout"><section className="drone-view-column"><div className={`drone-pov ${scanning ? "is-scanning" : ""}`}>
      <DronePOV drone={drone} mission={mission} paused={data.demo.paused} speed={data.demo.speed} />
      <div className="pov-top"><div><Radio size={13} /><strong>{drone.id}</strong><span>FOOTAGE REPLAY</span></div><div>{data.demo.paused ? "PAUSED" : `SIM ${data.demo.speed}×`}<span>{mission ? label(mission.status).toUpperCase() : "STANDBY"}</span></div></div>
      <div className="pov-heading-tape"><i /><span>{scanning ? "GIMBAL · NADIR SCAN" : "GIMBAL · AUTO TRACK"}</span><i /></div>
      <div className="pov-side pov-left"><span>ALT</span><strong>{drone.altitude_m.toFixed(0)}<small>m</small></strong><i /><span>V / SIM</span><strong>{active && ["en_route", "returning"].includes(mission.status) ? drone.speed_mps : 0}<small>m/s</small></strong></div>
      <div className="pov-reticle"><span /><i /><span /></div>
      <div className="pov-side pov-right"><span>BAT</span><strong>{drone.battery_pct.toFixed(0)}<small>%</small></strong><i /><span>RANGE</span><strong>{active ? (mission.distance_m / 1000).toFixed(2) : "0.00"}<small>km</small></strong></div>
      {(!active || data.demo.paused) && <div className="pov-idle"><Plane size={30} /><strong>{data.demo.paused ? "SIMULASI DIJEDA" : "MENUNGGU MISI OPERATOR"}</strong><span>{data.demo.paused ? "Lanjutkan simulasi dari panel operator." : "Setelah operator mengizinkan, penerbangan dan pemindaian berjalan otomatis."}</span></div>}
      {releasing && !data.demo.paused && <div className="pov-payload-status"><Package size={17} /><strong>PELEPASAN PAYLOAD AIR</strong><span>Replay helikopter / payload virtual</span></div>}
      {!releasing && scanning && !data.demo.paused && <div className="pov-scan-status"><ScanLine size={17} />{mission.location_refined_at ? "PEMINDAIAN VIRTUAL SELESAI" : "MEMINDAI AREA TARGET"}<span>{Math.min(100, mission.scan_elapsed_s / 24 * 100).toFixed(0)}%</span></div>}
      <div className="pov-bottom"><span>{Math.abs(drone.latitude).toFixed(6)} {drone.latitude < 0 ? "S" : "N"} / {drone.longitude.toFixed(6)} E</span><span>SIMULASI VISUAL · BUKAN KAMERA DRONE NYATA</span><span>{mission?.simulation_elapsed_s.toFixed(0) || "0"} s SIM</span></div>
    </div><div className="drone-telemetry-strip">{[
      { icon: Battery, title: "BATERAI VIRTUAL", value: `${drone.battery_pct.toFixed(1)}%` },
      { icon: Navigation, title: "JARAK TERSISA", value: active ? `${mission.distance_m.toFixed(0)} m` : "—" },
      { icon: Clock, title: "ETA WAKTU SIM", value: active ? `${mission.eta_s.toFixed(0)} s` : "—" },
      { icon: Package, title: "PAYLOAD VIRTUAL", value: `${drone.payload_l.toFixed(1)} L` },
    ].map(item => <div key={item.title}><item.icon size={17} /><span>{item.title}<strong>{item.value}</strong></span></div>)}</div><div className="pov-caption"><ScanLine size={17} /><p>Video hutan dan kebakaran adalah footage asli yang diputar ulang sesuai tahap misi virtual. Sumber: <a href="https://www.pexels.com/video/aerial-view-of-forest-fire-with-heavy-smoke-29702252/" target="_blank" rel="noreferrer">8K / Pexels</a>. Pelepasan air memakai <a href="https://www.pexels.com/video/aerial-view-of-forest-fire-battled-by-helicopter-29703477/" target="_blank" rel="noreferrer">footage helikopter pemadam</a>. Footage tidak berasal dari koordinat demo; operasi dan payload tetap simulasi.</p></div></section>
    <aside className="drone-side-panel"><div className="panel-title"><h2>Misi & penentuan lokasi</h2><span><Plane size={16} /></span></div><div className="drone-mission-info"><span className={`status status-${mission?.status || "available"}`}><i />{label(mission?.status || "available")}</span><strong>{mission?.id || "Belum ada misi"}</strong><p>{mission?.automatic ? "Disetujui operator · pelaksanaan otomatis" : "Drone menunggu persetujuan operator"}</p><div className="drone-mission-steps">{[
      ["Operator mengizinkan", !!mission?.launched_at], ["Terbang menuju target", !!mission?.arrived_at], ["Pemindaian virtual", !!mission?.location_refined_at], ["Kembali ke base", mission?.status === "completed"],
    ].map(([text, done], index) => <div className={done ? "done" : ""} key={String(text)}><span>{done ? "✓" : index + 1}</span>{text}</div>)}</div></div>
      {incident && <div className="drone-location"><Target size={18} /><div><strong>{incident.latitude?.toFixed(6)}, {incident.longitude?.toFixed(6)}</strong><p>{locationLabel(incident)}</p>{incident.location_uncertainty_m !== null && <small>Radius asumsi ±{incident.location_uncertainty_m.toFixed(0)} m · bukan akurasi terukur</small>}</div></div>}
      <div className="map-area drone-mini-map"><div className="map-toolbar"><span><MapPin size={12} /> LIVE POSITION</span><small>ONLINE MAP / OSM</small></div><MonitoringMap data={data} onLocation={() => {}} /></div>
      <div className="drone-home"><Home size={14} />BASE {drone.home_latitude.toFixed(5)}, {drone.home_longitude.toFixed(5)}</div>
      <div className="panel-title"><h2>Log misi</h2></div><div className="drone-event-list">{events.length ? events.map(event => <div key={event.event_id}><time>{time(event.timestamp)}</time><span>{({ "mission.started": "Drone virtual diluncurkan", "mission.arrived": "Tiba di area target", "incident.location_refined": "Estimasi lokasi diperbarui secara virtual", "mission.completed": "Misi selesai di base", "mission.automation_authorized": "Otomasi diizinkan operator", "mission.approved": "Misi disetujui", "mission.created": "Misi dibuat", "mission.scan_completed": "Pemindaian virtual selesai" } as Record<string, string>)[event.type] || event.type}</span></div>) : <p>Belum ada aktivitas misi.</p>}</div>
    </aside></div>
  </main>;
}
