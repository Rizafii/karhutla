"use client";
import { useEffect, useRef, useState } from "react";
import { API } from "@/lib/api";
import type { Drone, Mission } from "@/lib/types";
import { worldPoint } from "@/lib/pov";

export function DronePOV({ drone, mission, paused, speed }: { drone: Drone; mission?: Mission; paused: boolean; speed: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const scanning = !!mission && ["on_site", "suppression_simulation"].includes(mission.status);
  const releasing = mission?.status === "suppression_simulation";
  const travelling = mission?.status === "en_route";
  const returning = mission?.status === "returning";
  const clip = releasing ? "payload-drop" : scanning ? "drone-fire" : travelling ? "drone-approach" : "forest";

  useEffect(() => { setFailed(false); }, [clip]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const sync = () => {
      if (travelling && mission && Number.isFinite(element.duration)) {
        const home = worldPoint(drone.home_latitude, drone.home_longitude);
        const target = worldPoint(mission.target_latitude, mission.target_longitude);
        const total = Math.hypot(target.east - home.east, target.north - home.north);
        const progress = Math.max(0, Math.min(1, 1 - mission.distance_m / Math.max(1, total)));
        // Reference footage follows route progress; it is labelled as a replay.
        const desired = progress * Math.max(0, element.duration - .1);
        if (Math.abs(element.currentTime - desired) > .75) element.currentTime = desired;
        element.playbackRate = Math.max(.1, Math.min(4, element.duration * drone.speed_mps * speed / Math.max(1, total)));
        if (paused) element.pause();
        else void element.play().catch(() => setFailed(true));
      } else if (paused || (!scanning && !returning)) {
        element.pause();
      } else {
        if (releasing && element.ended) return;
        void element.play().catch(() => setFailed(true));
      }
    };
    sync();
    element.addEventListener("loadedmetadata", sync);
    return () => element.removeEventListener("loadedmetadata", sync);
  }, [clip, paused, scanning, releasing, travelling, returning, speed, mission, drone.home_latitude, drone.home_longitude, drone.speed_mps]);

  return <>
    <video key={clip} ref={video} className="drone-pov-canvas" src={`${API}/api/footage/${clip}`} muted playsInline loop={!releasing} preload="auto" onError={() => setFailed(true)} aria-label={releasing ? "Footage helikopter melepas air ke kebakaran hutan" : scanning ? "Footage udara kebakaran hutan" : "Footage drone mendekati area asap di hutan"} />
    {failed && <div className="pov-footage-error" role="alert">Footage drone gagal dimuat. Periksa persiapan aset dan koneksi API.</div>}
  </>;
}
