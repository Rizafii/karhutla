"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { Shield, MapPin, Radio, Check, Navigation, Clock, AlertCircle, Flame } from "lucide-react";
import { useOperations } from "@/lib/use-operations";
import { API, label, request, time } from "@/lib/api";
import { locationLabel } from "@/lib/location";
import { Button } from "./ui/button";

const MonitoringMap = dynamic(() => import("./monitoring-map"), { ssr: false });
const nextStatus: Record<string, { status: string; title: string }> = {
  assigned: { status: "accepted", title: "Terima penugasan" },
  accepted: { status: "responding", title: "Berangkat menuju lokasi" },
  responding: { status: "on_site", title: "Laporkan tiba di lokasi" },
  on_site: { status: "completed", title: "Selesaikan penugasan regu" },
};

export function FieldPanel() {
  const { data, error, connected, refetch } = useOperations();
  const client = useQueryClient();
  const [unitId, setUnitId] = useState("TEAM-01");
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<string | null>(null);
  if (!data) return <main className="role-wait"><Shield size={36} /><h1>Panel Petugas Damkar</h1><p>{error?.message || "Menghubungkan data operasi…"}</p>{error && <Button onClick={() => refetch()}>Coba kembali</Button>}</main>;
  const unit = data.response_units.find(u => u.id === unitId) || data.response_units[0];
  const assignments = data.dispatches.filter(d => d.unit_id === unit?.id && d.status !== "completed");
  async function update(id: string, status: string) {
    if (status === "completed" && !window.confirm("Selesaikan penugasan regu? Status kebakaran tetap harus ditutup oleh operator.")) return;
    setBusy(true); setFailure(null);
    try { await request(`/api/dispatches/${id}/update-status`, { status }); await client.invalidateQueries({ queryKey: ["bootstrap"] }); }
    catch (error) { setFailure((error as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="field-page">
    <header className="role-page-heading"><div><div className="eyebrow">FIELD RESPONSE · GERAKAN REGU VIRTUAL</div><h1><Shield size={28} /> Petugas Damkar</h1><p>Penugasan, titik perkiraan, dan progres regu dalam satu ruang kerja.</p></div><span className={`connection ${connected ? "on" : ""}`}><i />{connected ? "Realtime terhubung" : "Menghubungkan ulang"}</span></header>
    <div className="field-unit-tabs">{data.response_units.map(u => <button key={u.id} className={u.id === unit?.id ? "selected" : ""} onClick={() => setUnitId(u.id)}><Shield size={18} /><span><strong>{u.name}</strong><small>{u.id} · {label(u.response_status)}</small></span><i className={u.availability} /></button>)}</div>
    {failure && <div className="error-banner" role="alert"><AlertCircle size={16} />{failure}</div>}
    <div className="field-layout"><section className="field-tasks">
      <div className="panel-title"><h2>Penugasan aktif</h2><span>{assignments.length.toString().padStart(2, "0")}</span></div>
      {!assignments.length && <div className="field-standby"><Radio size={38} /><h2>Regu dalam posisi siaga</h2><p>Penugasan dari operator akan muncul otomatis. Drone dapat menjalankan pengintaian tanpa menunggu konfirmasi regu.</p><span>BASE · {unit?.home_latitude.toFixed(5)}, {unit?.home_longitude.toFixed(5)}</span></div>}
      {assignments.map(dispatch => {
        const incident = data.incidents.find(i => i.id === dispatch.incident_id);
        if (!incident) return null;
        const next = nextStatus[dispatch.status];
        return <article className="field-assignment" key={dispatch.id}>
          <div className="field-assignment-heading"><span className={`status status-${dispatch.status}`}><i />{label(dispatch.status)}</span><small>{dispatch.id}</small></div>
          <h2><Flame size={21} />{incident.category === "fire" ? "Indikasi kebakaran" : "Indikasi asap"}</h2>
          <p>{incident.camera_id} · {incident.id}</p>
          <div className="field-target"><MapPin size={20} /><div><strong>{incident.latitude?.toFixed(6)}, {incident.longitude?.toFixed(6)}</strong><span>{locationLabel(incident)}</span>{incident.location_uncertainty_m !== null && <small>Radius asumsi simulasi ±{incident.location_uncertainty_m.toFixed(0)} m</small>}</div></div>
          <div className="field-detail-row"><span><Clock size={14} /> Ditugaskan {time(dispatch.created_at)} WIB</span><span>{incident.provenance === "ai" ? "Deteksi AI" : "Simulasi manual"}</span></div>
          {incident.evidence_path && <img className="field-evidence" alt="Evidence kamera sumber; bukan video drone" src={`${API}/api/evidence/${incident.evidence_path.replace(/^evidence\//, "")}`} />}
          {incident.notes && <blockquote>{incident.notes}</blockquote>}
          {next && <Button className="full-width" disabled={busy} onClick={() => update(dispatch.id, next.status)}>{next.status === "responding" ? <Navigation size={15} /> : <Check size={15} />}{next.title}</Button>}
          <small className="help-text">Pergerakan di peta merupakan simulasi. Penyelesaian tugas regu tidak otomatis menandai api padam.</small>
        </article>;
      })}
      <div className="panel-title"><h2>Situasi sektor</h2></div>
      {data.incidents.filter(i => !["closed", "resolved", "false_alarm"].includes(i.status)).map(i => <div className="field-sector-row" key={i.id}><span className={`status status-${i.status}`}><i />{label(i.status)}</span><strong>{i.camera_id}</strong><small>{i.location_source === "drone_simulation" ? "Titik hasil pemindaian virtual" : "Lokasi masih perkiraan"}</small></div>)}
    </section><section className="field-map-section"><div className="map-area field-map"><div className="map-toolbar"><span><MapPin size={13} /> POSISI REGU & TITIK PERKIRAAN</span><small>GEOMETRI LOKAL · WGS84</small></div><MonitoringMap data={data} onLocation={() => {}} online={false} onTileError={() => {}} /></div><div className="field-map-foot"><span><i />{unit?.name} · {label(unit?.response_status || "standby")}</span><span>Posisi virtual {unit?.latitude.toFixed(5)}, {unit?.longitude.toFixed(5)}</span></div><div className="field-radio"><Radio size={18} /><div><strong>Koordinasi udara independen</strong><p>Operator menyetujui misi; drone memindai dan kembali otomatis. Regu tetap memperbarui status penanganannya sendiri.</p></div></div></section></div>
  </main>;
}
