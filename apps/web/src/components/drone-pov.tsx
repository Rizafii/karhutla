"use client";
import { useEffect, useRef } from "react";
import type { Drone, Incident, Mission } from "@/lib/types";
import { worldPoint, projectPoint, bearing, terrainNoise, type WorldPoint, type Viewpoint } from "@/lib/pov";

export function DronePOV({ drone, mission, incident }: { drone: Drone; mission?: Mission; incident?: Incident }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ drone, mission, incident });
  latest.current = { drone, mission, incident };
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;
    let width = 1000, height = 600, handle = 0, lastPaint = 0;
    let position = worldPoint(latest.current.drone.latitude, latest.current.drone.longitude, Math.max(18, latest.current.drone.altitude_m));
    let heading = 0, pitch = 18;
    const resize = () => {
      const bounds = element.getBoundingClientRect();
      width = bounds.width; height = bounds.height;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      element.width = Math.max(1, Math.round(width * ratio)); element.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    function draw(now: number) {
      handle = requestAnimationFrame(draw);
      if (now - lastPaint < 40 || !context) return;
      const dt = Math.min(100, now - (lastPaint || now)); lastPaint = now;
      const { drone, mission, incident } = latest.current;
      const targetPosition = worldPoint(drone.latitude, drone.longitude, Math.max(18, drone.altitude_m));
      const blend = 1 - Math.exp(-dt / 230);
      position = { east: position.east + (targetPosition.east - position.east) * blend, north: position.north + (targetPosition.north - position.north) * blend, height: position.height + (targetPosition.height - position.height) * blend };
      const destination = mission?.status === "returning" ? worldPoint(drone.home_latitude, drone.home_longitude) : mission ? worldPoint(mission.target_latitude, mission.target_longitude) : worldPoint(drone.latitude + .01, drone.longitude);
      if (Math.hypot(destination.east - position.east, destination.north - position.north) > 15) {
        const next = bearing(position, destination), turn = ((next - heading + 540) % 360) - 180;
        heading += turn * Math.min(1, dt / 600);
      }
      const scanning = !!mission && ["on_site", "suppression_simulation"].includes(mission.status);
      pitch += ((scanning ? 70 : 18) - pitch) * blend;
      const camera: Viewpoint = { ...position, heading, pitch };
      const project = (point: WorldPoint) => projectPoint(point, camera, width, height);
      const horizon = height / 2 - Math.tan(pitch * Math.PI / 180) * width * .72;
      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, "#344d56"); sky.addColorStop(.55, "#9aab9c"); sky.addColorStop(1, "#3b5341");
      context.fillStyle = sky; context.fillRect(0, 0, width, height);
      context.fillStyle = "#334b32"; context.fillRect(0, Math.max(0, horizon), width, height);
      // Procedural terrain is a fixed world. Only the camera pose follows
      // authoritative backend telemetry; it never advances a mission locally.
      const cx = Math.floor(position.east / 150), cy = Math.floor(position.north / 150);
      const tiles: { points: NonNullable<ReturnType<typeof project>>[]; shade: number; depth: number }[] = [];
      for (let x = cx - 12; x <= cx + 12; x++) for (let y = cy - 12; y <= cy + 12; y++) {
        const points = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(([a, b]) => project({ east: a * 150, north: b * 150, height: 0 }));
        if (points.every(p => p !== null)) tiles.push({ points: points as NonNullable<ReturnType<typeof project>>[], shade: terrainNoise(x, y), depth: points[0]!.depth });
      }
      tiles.sort((a, b) => b.depth - a.depth).forEach(tile => {
        context.fillStyle = `rgb(${39 + tile.shade * 15},${61 + tile.shade * 18},${37 + tile.shade * 10})`;
        context.beginPath(); tile.points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)); context.closePath(); context.fill();
      });
      const trees: { point: WorldPoint; noise: number; depth: number }[] = [];
      const tx = Math.floor(position.east / 55), ty = Math.floor(position.north / 55);
      for (let x = tx - 29; x <= tx + 29; x++) for (let y = ty - 29; y <= ty + 29; y++) {
        const noise = terrainNoise(x, y);
        if (noise < .16) continue;
        const point = { east: (x + noise * .7) * 55, north: (y + terrainNoise(y, x) * .7) * 55, height: 0 };
        const base = project(point);
        if (!base || base.depth > 1800 || base.x < -150 || base.x > width + 150 || base.y < -100 || base.y > height + 200) continue;
        trees.push({ point, noise, depth: base.depth });
      }
      trees.sort((a, b) => b.depth - a.depth).forEach(({ point, noise }) => {
        const base = project(point), top = project({ ...point, height: 13 + noise * 14 });
        if (!base || !top) return;
        const radius = Math.min(65, base.scale * (4 + noise * 3));
        context.fillStyle = "#20332266"; context.beginPath(); context.ellipse(base.x + radius * .6, base.y + radius * .2, radius * 1.3, radius * .45, -.3, 0, Math.PI * 2); context.fill();
        context.strokeStyle = "#443b2b"; context.lineWidth = Math.max(1, base.scale); context.beginPath(); context.moveTo(base.x, base.y); context.lineTo(top.x, top.y); context.stroke();
        context.fillStyle = `rgb(${18 + noise * 13},${42 + noise * 26},${27 + noise * 10})`;
        context.beginPath(); context.moveTo(top.x, top.y); context.lineTo(base.x - radius, base.y - radius * .2); context.quadraticCurveTo(base.x, base.y + radius * .25, base.x + radius, base.y - radius * .2); context.closePath(); context.fill();
        context.fillStyle = "#73906430"; context.beginPath(); context.moveTo(top.x, top.y); context.lineTo(base.x + radius * .15, base.y - radius * .3); context.lineTo(base.x + radius, base.y - radius * .2); context.closePath(); context.fill();
      });
      if (mission && incident && !["false_alarm", "closed", "resolved"].includes(incident.status)) {
        const fire = worldPoint(incident.latitude ?? mission.target_latitude, incident.longitude ?? mission.target_longitude);
        const center = project({ ...fire, height: 3 });
        if (center) {
          context.strokeStyle = "#ffb84e"; context.lineWidth = 1.5;
          context.beginPath(); context.ellipse(center.x, center.y, Math.max(12, center.scale * 16), Math.max(6, center.scale * 7), 0, 0, Math.PI * 2); context.stroke();
          context.fillStyle = "#e77d3d"; context.beginPath(); context.ellipse(center.x, center.y, Math.max(4, center.scale * 5), Math.max(3, center.scale * 3), 0, 0, Math.PI * 2); context.fill();
          for (let i = 0; i < 20; i++) {
            const phase = (now / 1000 * .08 + i / 20) % 1;
            const smoke = project({ east: fire.east + phase * 24 + Math.sin(i * 2) * 9, north: fire.north + Math.cos(i) * 8, height: 8 + phase * 110 });
            if (!smoke) continue;
            context.fillStyle = `rgba(177,183,167,${(1 - phase) * .25})`; context.beginPath(); context.arc(smoke.x, smoke.y, Math.min(120, (7 + phase * 20) * smoke.scale), 0, Math.PI * 2); context.fill();
          }
          context.font = "11px monospace"; context.fillStyle = "#ffe0a6"; context.fillText("TARGET VIRTUAL", center.x + 18, center.y - 14);
        }
      }
      const vignette = context.createRadialGradient(width / 2, height / 2, width * .15, width / 2, height / 2, width * .65);
      vignette.addColorStop(0, "#00000000"); vignette.addColorStop(1, "#05100b99"); context.fillStyle = vignette; context.fillRect(0, 0, width, height);
    }
    handle = requestAnimationFrame(draw);
    return () => { observer.disconnect(); cancelAnimationFrame(handle); };
  }, []);
  return <canvas ref={canvas} className="drone-pov-canvas" aria-label="POV drone sintetis: hutan prosedural dan target virtual mengikuti telemetri backend" />;
}
