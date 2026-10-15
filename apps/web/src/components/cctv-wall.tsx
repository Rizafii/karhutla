"use client";
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Video, Maximize2, Minimize2, MapPin, ScanLine, Pause, Play, TriangleAlert, X } from "lucide-react";
import type { Bootstrap } from "@/lib/types";
import { label, time } from "@/lib/api";
import { CameraStream } from "./camera-stream";
import { Button } from "./ui/button";
import "./cctv-wall.css";

export function CCTVWall({ data, busy, onStart, onPause, onMap, onIncident }: {
  data: Bootstrap;
  busy: boolean;
  onStart: () => void;
  onPause: () => void;
  onMap: () => void;
  onIncident: (id: string) => void;
}) {
  const wall = useRef<HTMLElement>(null);
  const [annotated, setAnnotated] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const focused = data.cameras.find(camera => camera.id === focusedId);
  const connected = data.cameras.filter(camera => camera.connection_status === "connected").length;
  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === wall.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  async function toggleFullscreen() {
    try {
      setFailure(null);
      if (document.fullscreenElement === wall.current) await document.exitFullscreen();
      else await wall.current?.requestFullscreen();
    } catch { setFailure("Layar penuh belum tersedia di browser ini. Gunakan tombol perbesar pada kamera."); }
  }

  return <section ref={wall} className="cctv-wall" aria-label="Panel penuh pemantauan CCTV">
    <div className="cctv-toolbar">
      <div className="cctv-wall-title"><Video size={18} /><div><strong>PEMANTAUAN CCTV <span>2 × 2</span></strong><small><i /> {connected}/{data.cameras.length} kamera terhubung</small></div></div>
      <div className="cctv-controls">
        <button className={annotated ? "active" : ""} onClick={() => setAnnotated(value => !value)} aria-pressed={annotated}><ScanLine size={15} /> Overlay AI</button>
        {data.demo_enabled && (data.demo.status === "running"
          ? <button disabled={busy} onClick={onPause}>{data.demo.paused ? <Play size={15} /> : <Pause size={15} />}{data.demo.paused ? "Lanjutkan" : "Jeda"}</button>
          : <button disabled={busy || !data.worker_fresh || !data.demo.worker.model_ready || !data.demo.worker.footage_ready} onClick={onStart}><Play size={15} /> Mulai AI</button>)}
        <button onClick={onMap}><MapPin size={15} /> Peta operasi</button>
        <button onClick={toggleFullscreen}>{fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{fullscreen ? "Keluar layar penuh" : "Layar penuh"}</button>
      </div>
    </div>
    {failure && <p className="cctv-failure" role="alert">{failure}</p>}
    <div className="cctv-grid">
      {data.cameras.map(camera => {
        const incident = data.incidents.find(item => item.camera_id === camera.id && !["closed", "resolved", "false_alarm"].includes(item.status));
        return <article className={`cctv-card ${incident ? "has-incident" : ""}`} key={camera.id} aria-label={`Monitor ${camera.id}`}>
          <header><div><Video size={15} /><strong>{camera.id}</strong><span>{camera.name}</span></div><button onClick={() => setFocusedId(camera.id)} aria-label={`Perbesar ${camera.id}`} title="Perbesar kamera"><Maximize2 size={15} /></button></header>
          <div className="cctv-video">
            <CameraStream camera={camera} annotated={annotated} />
            <div className={`cctv-connection ${camera.connection_status === "connected" ? "connected" : ""}`}><i />{label(camera.connection_status)}</div>
            <span className="cctv-source">{camera.source_type === "mp4" ? "FOOTAGE REPLAY" : "LIVE"}</span>
            {incident && <button className="cctv-incident" onClick={() => onIncident(incident.id)}><TriangleAlert size={15} /><span>{incident.category === "smoke" ? "ASAP TERDETEKSI" : "API TERDETEKSI"}</span><strong>Tinjau alarm →</strong></button>}
          </div>
          <footer><span><ScanLine size={13} />{annotated ? "Overlay AI" : "Preview kamera"} · {label(camera.ai_status)}</span><time>{time(camera.last_frame_at)} WIB</time></footer>
        </article>;
      })}
    </div>
    <div className="cctv-wall-foot"><span>AI mendeteksi asap dan api · alarm menunggu verifikasi operator</span><span>Footage referensi · koordinat demonstrasi</span></div>
    <Dialog.Root open={!!focused} onOpenChange={open => { if (!open) setFocusedId(null); }}>
      <Dialog.Portal container={wall.current ?? undefined}>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal modal-wide cctv-focus">
          <div className="modal-heading"><Dialog.Title>{focused?.id} · {focused?.name}</Dialog.Title><Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="Tutup kamera"><X size={18} /></Button></Dialog.Close></div>
          <Dialog.Description className="cctv-focus-description">{annotated ? "Hasil inference AI pada feed kamera" : "Pratinjau kamera diperbesar"}</Dialog.Description>
          {focused && <div className="cctv-focus-video"><CameraStream camera={focused} annotated={annotated} /></div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </section>;
}
