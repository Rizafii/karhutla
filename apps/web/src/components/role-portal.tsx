"use client";
import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Bell, Flame, Plane, Shield, Radio, Volume2, VolumeX, ArrowLeft, Check } from "lucide-react";
import { CommandCenter } from "./command-center";
import { FieldPanel } from "./field-panel";
import { DronePanel } from "./drone-panel";
import { request } from "@/lib/api";
import type { Bootstrap } from "@/lib/types";
import { useWorkspace } from "@/lib/store";
import { Button } from "./ui/button";

type Role = "operator" | "firefighter" | "drone";
const roles = [
  { id: "operator" as const, number: "01", icon: Radio, name: "Operator", sub: "COMMAND CENTER", description: "Pantau kamera, verifikasi alarm, dan izinkan respons drone dalam satu tindakan.", tags: "Deteksi AI / GIS / Dispatch" },
  { id: "firefighter" as const, number: "02", icon: Shield, name: "Petugas Damkar", sub: "FIELD RESPONSE", description: "Terima penugasan regu, lihat koordinat perkiraan, dan laporkan progres penanganan.", tags: "Penugasan / Navigasi virtual / Status regu" },
  { id: "drone" as const, number: "03", icon: Plane, name: "POV Drone", sub: "AUTONOMOUS RECON", description: "Ikuti penerbangan virtual dari sudut pandang drone. Pemindaian dan kepulangan berjalan otomatis.", tags: "Footage drone / Telemetri / Pemindaian virtual" },
];

export function RolePortal() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  const [role, setRole] = useState<Role | null>(null);
  function choose(next: Role) {
    useWorkspace.setState({ view: next === "operator" ? "cameras" : "overview", cameraId: null, incidentId: null, placing: false, reportId: null });
    setRole(next);
  }
  return <QueryClientProvider client={client}>
    {role ? <div className="role-app">
      <div className="role-session-bar">
        <button className="role-switch" onClick={() => setRole(null)}><ArrowLeft size={14} /> Ganti role</button>
        <span className="role-current">{roles.find(r => r.id === role)?.sub}</span>
        <AlarmPanel onOpen={(id) => { choose("operator"); useWorkspace.getState().setView("incidents"); useWorkspace.getState().selectIncident(id); }} />
      </div>
      {role === "operator" ? <CommandCenter /> : role === "firefighter" ? <FieldPanel /> : <DronePanel />}
    </div> : <main className="role-landing">
      <header className="role-brand"><span className="brand-mark"><Flame size={26} /></span><strong>KARHUTLA<span>.AI</span></strong><span className="role-local"><i /> LOCAL OPERATIONS</span></header>
      <div className="role-intro"><div className="eyebrow">WILDFIRE EARLY DETECTION & RESPONSE</div><h1>Satu situasi.<br />Tiga sudut pandang.</h1><p>Pilih ruang kerja untuk memantau, merespons, atau mengikuti misi udara di sektor demonstrasi Kalimantan Tengah.</p></div>
      <div className="role-options">{roles.map(r => <button key={r.id} className={`role-option role-${r.id}`} onClick={() => choose(r.id)}>
        <div className="role-option-top"><r.icon size={27} /><span>{r.number}</span></div>
        <small>{r.sub}</small><h2>{r.name}<ArrowUpRight size={23} /></h2><p>{r.description}</p><footer>{r.tags}</footer>
      </button>)}</div>
      <footer className="role-landing-footer"><span><VolumeX size={15} /> Mode senyap aktif · suara alarm mati saat membuka aplikasi</span><span>Role demo lokal · tanpa login akun</span></footer>
      <div className="role-flow"><span>Kamera mendeteksi</span><i /><span>Operator memverifikasi & mengizinkan</span><i /><span>Drone memindai otomatis</span><i /><span>Damkar menangani</span></div>
    </main>}
  </QueryClientProvider>;
}

function AlarmPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: () => request<Bootstrap>("/api/bootstrap"), refetchInterval: 2000 });
  const [sound, setSound] = useState(false);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const audio = useRef<AudioContext | null>(null);
  const pending = data?.incidents.filter(i => i.status === "pending_review" && !acknowledged.includes(i.id)) || [];
  const ids = pending.map(i => i.id).sort().join(",");
  // Audio is lazy: page load, role choice and detection cannot enable sound.
  // A user gesture AND an explicit confirmation are required first.
  useEffect(() => {
    if (!sound || !ids || !audio.current) return;
    const context = audio.current;
    const nodes: OscillatorNode[] = [];
    function pulse() {
      if (context.state !== "running") return;
      const oscillator = context.createOscillator(), gain = context.createGain(), at = context.currentTime;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(740, at);
      oscillator.frequency.setValueAtTime(540, at + .35);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(.045, at + .04);
      gain.gain.setValueAtTime(.045, at + .6);
      gain.gain.linearRampToValueAtTime(0, at + .75);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(at); oscillator.stop(at + .8);
      nodes.push(oscillator);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); const index = nodes.indexOf(oscillator); if (index >= 0) nodes.splice(index, 1); };
    }
    pulse();
    const timer = setInterval(pulse, 2400);
    return () => { clearInterval(timer); nodes.forEach(node => { try { node.stop(); } catch {} }); };
  }, [sound, ids]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  async function toggleSound() {
    if (sound) { setSound(false); return; }
    if (!window.confirm("Aktifkan suara alarm? Jika ada kandidat insiden, alarm akan berbunyi. Biarkan nonaktif di ruang publik.")) return;
    try {
      audio.current ||= new AudioContext();
      await audio.current.resume();
      setSound(true);
    } catch { setSound(false); }
  }
  return <>
    <button className={`alarm-sound ${sound ? "enabled" : ""}`} onClick={toggleSound} title={sound ? "Matikan suara alarm" : "Suara mati; klik untuk mengaktifkan dengan konfirmasi"}>{sound ? <Volume2 size={15} /> : <VolumeX size={15} />}<span>{sound ? "Suara aktif" : "Mode senyap"}</span></button>
    {pending.length > 0 && <div className="role-alarm" role="alert" aria-live="assertive"><Bell size={19} /><div><strong>{pending[0].category === "smoke" ? "PERINGATAN ASAP TERDETEKSI" : "PERINGATAN API TERDETEKSI"} / {pending.length} insiden perlu verifikasi</strong><span>{pending[0].camera_id} · {pending[0].provenance === "ai" ? "Deteksi AI nyata" : "Simulasi manual"} · {sound ? "Alarm suara aktif" : "Alarm visual · suara mati"}</span></div><Button size="sm" onClick={() => onOpen(pending[0].id)}>Buka insiden <ArrowUpRight size={13} /></Button><button className="alarm-ack" onClick={() => setAcknowledged(previous => [...previous, ...pending.map(i => i.id)])}><Check size={14} /> Akui alarm</button></div>}
  </>;
}
