"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import maplibrePackage from "maplibre-gl/package.json";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Bootstrap } from "@/lib/types";
import { onlineBasemap } from "@/lib/basemap";
import { useWorkspace } from "@/lib/store";

const feature = (
  geometry: GeoJSON.Geometry,
  properties: Record<string, unknown> = {},
) => ({ type: "Feature" as const, geometry, properties });
const polygon = (coordinates: number[][]) =>
  feature({ type: "Polygon", coordinates: [coordinates] });
const collection = (
  features: GeoJSON.Feature[],
): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
function sector(
  lat: number,
  lon: number,
  heading: number,
  fov: number,
  range: number,
) {
  const points = [[lon, lat]];
  for (let i = 0; i <= 24; i++) {
    const angle = ((heading - fov / 2 + (fov * i) / 24) * Math.PI) / 180;
    points.push([
      lon +
        (Math.sin(angle) * range) / (111320 * Math.cos((lat * Math.PI) / 180)),
      lat + (Math.cos(angle) * range) / 111320,
    ]);
  }
  return polygon([...points, [lon, lat]]);
}
function uncertaintyArea(lat: number, lon: number, radius: number) {
  return polygon(Array.from({ length: 49 }, (_, i) => {
    const angle = i / 48 * Math.PI * 2;
    return [lon + Math.sin(angle) * radius / (111320 * Math.cos(lat * Math.PI / 180)), lat + Math.cos(angle) * radius / 110540];
  }));
}
export default function MonitoringMap({
  data,
  onLocation,
}: {
  data: Bootstrap;
  onLocation: (lat: number, lon: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    markers = useRef<maplibregl.Marker[]>([]),
    droneMarkers = useRef<Record<string, maplibregl.Marker>>({});
  const latest = useRef({ data, onLocation });
  latest.current = { data, onLocation };
  const workspace = useWorkspace();
  const [mapError, setMapError] = useState<string | null>(null);
  const placing = useRef(workspace.placing);
  placing.current = workspace.placing;
  useEffect(() => {
    if (!container.current) return;
    // v6 workers are separate ES modules. Next.js does not publish these
    // alongside its generated chunks, so serve the matching package locally.
    maplibregl.setWorkerUrl(
      new URL(
        `/maplibre/${maplibrePackage.version}/maplibre-gl-worker.mjs`,
        window.location.origin,
      ).href,
    );
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: container.current,
        style: onlineBasemap,
        center: [113.9, -2.301],
        zoom: 13.7,
        minZoom: 10,
        maxZoom: 18,
        pitch: 0,
        attributionControl: { compact: true },
      });
    } catch (error) {
      setMapError(error instanceof Error ? error.message : "WebGL tidak tersedia");
      return;
    }
    map.current = m;
    m.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-left",
    );
    m.addControl(
      new maplibregl.ScaleControl({ unit: "metric" }),
      "bottom-left",
    );
    m.on("click", (event) => {
      if (placing.current)
        latest.current.onLocation(event.lngLat.lat, event.lngLat.lng);
    });
    m.on("error", (event) => {
      setMapError("sourceId" in event && event.sourceId === "osm"
        ? "Basemap online gagal dimuat. Periksa koneksi internet lalu coba kembali."
        : event.error.message);
    });
    m.on("load", () => {
      m.addSource("coverage", { type: "geojson", data: collection([]) });
      m.addLayer({
        id: "coverage-fill",
        type: "fill",
        source: "coverage",
        paint: {
          "fill-color": "#55b58a",
          "fill-opacity": [
            "case",
            ["==", ["get", "selected"], true],
            0.28,
            0.11,
          ],
        },
      });
      m.addLayer({
        id: "coverage-line",
        type: "line",
        source: "coverage",
        paint: {
          "line-color": "#6bbd91",
          "line-width": ["case", ["==", ["get", "selected"], true], 2.2, 1],
          "line-opacity": 0.65,
          "line-dasharray": [3, 2],
        },
      });
      m.addSource("route", { type: "geojson", data: collection([]) });
      m.addSource("uncertainty", { type: "geojson", data: collection([]) });
      m.addLayer({ id: "uncertainty-fill", type: "fill", source: "uncertainty", paint: { "fill-color": "#e9a953", "fill-opacity": .09 } });
      m.addLayer({ id: "uncertainty-line", type: "line", source: "uncertainty", paint: { "line-color": "#e9b563", "line-opacity": .75, "line-width": 1.5, "line-dasharray": [3, 3] } });
      m.addLayer({
        id: "route-planned",
        type: "line",
        source: "route",
        filter: ["==", ["get", "kind"], "planned"],
        paint: {
          "line-color": "#7bacd4",
          "line-width": 2,
          "line-dasharray": [3, 3],
        },
      });
      m.addLayer({
        id: "route-done",
        type: "line",
        source: "route",
        filter: ["==", ["get", "kind"], "done"],
        paint: { "line-color": "#8ec9ff", "line-width": 3 },
      });
      update();
    });
    function update() {
      if (!m.getSource("coverage")) return;
      (m.getSource("coverage") as GeoJSONSource).setData(
        collection(
          latest.current.data.cameras.map((c) =>
            sector(c.latitude, c.longitude, c.heading, c.fov, c.range_m),
          ),
        ),
      );
    }
    const resize = new ResizeObserver(() => m.resize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      Object.values(droneMarkers.current).forEach((marker) => marker.remove());
      droneMarkers.current = {};
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const update = () => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      const add = (
        lat: number,
        lon: number,
        text: string,
        className: string,
        click?: () => void,
      ) => {
        const element = document.createElement("button");
        element.className = `map-marker ${className}`;
        element.textContent = text;
        element.setAttribute("aria-label", text);
        if (click)
          element.onclick = (e) => {
            e.stopPropagation();
            click();
          };
        const marker = new maplibregl.Marker({ element })
          .setLngLat([lon, lat])
          .addTo(m);
        markers.current.push(marker);
      };
      data.cameras.forEach((c) =>
        add(
          c.latitude,
          c.longitude,
          c.id,
          `camera-marker ${workspace.cameraId === c.id ? "selected" : ""}`,
          () => workspace.selectCamera(c.id),
        ),
      );
      data.response_units.forEach((u) =>
        add(u.latitude, u.longitude, "▣", `team-marker`, undefined),
      );
      data.drones.forEach((d) =>
        add(d.home_latitude, d.home_longitude, "H", `home-marker`),
      );
      data.incidents
        .filter((i) => !["closed", "false_alarm"].includes(i.status))
        .forEach((i) => {
          const c = data.cameras.find((c) => c.id === i.camera_id);
          if (c)
            add(
              i.latitude ?? c.latitude,
              i.longitude ?? c.longitude,
              i.category === "fire" ? "F" : "S",
              `incident-marker ${i.status === "pending_review" ? "pending" : ""}`,
              () => workspace.selectIncident(i.id),
            );
        });
      (m.getSource("coverage") as GeoJSONSource)?.setData(
        collection(
          data.cameras.map((c) => ({
            ...sector(c.latitude, c.longitude, c.heading, c.fov, c.range_m),
            properties: { selected: workspace.cameraId === c.id },
          })),
        ),
      );
      const routes: GeoJSON.Feature[] = [];
      data.missions
        .filter((mission) => !["cancelled", "failed"].includes(mission.status))
        .forEach((mission) => {
          const drone = data.drones.find((d) => d.id === mission.drone_id);
          if (!drone) return;
          routes.push(
            feature(
              {
                type: "LineString",
                coordinates: [
                  [drone.home_longitude, drone.home_latitude],
                  [mission.target_longitude, mission.target_latitude],
                ],
              },
              { kind: "planned" },
            ),
          );
          if (mission.route.length > 1)
            routes.push(
              feature(
                { type: "LineString", coordinates: mission.route },
                { kind: "done" },
              ),
            );
        });
      (m.getSource("route") as GeoJSONSource)?.setData(collection(routes));
      (m.getSource("uncertainty") as GeoJSONSource)?.setData(collection(data.incidents
        .filter(i => !["closed", "false_alarm", "resolved"].includes(i.status) && i.latitude !== null && i.longitude !== null && i.location_uncertainty_m !== null)
        .map(i => uncertaintyArea(i.latitude!, i.longitude!, i.location_uncertainty_m!))));
    };
    if (m.isStyleLoaded()) update();
    else m.once("load", update);
  }, [data, workspace.cameraId, workspace.incidentId]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const animations: number[] = [];
    data.drones.forEach((drone) => {
      let marker = droneMarkers.current[drone.id];
      if (!marker) {
        const element = document.createElement("div");
        element.className = "drone-marker";
        element.innerHTML =
          '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 10L22 22M10 22L22 10"/><circle cx="8" cy="8" r="5"/><circle cx="24" cy="8" r="5"/><circle cx="8" cy="24" r="5"/><circle cx="24" cy="24" r="5"/><rect x="12" y="12" width="8" height="8" rx="2"/></svg><small>DRONE-01 · VIRTUAL</small>';
        marker = new maplibregl.Marker({ element })
          .setLngLat([drone.longitude, drone.latitude])
          .addTo(m);
        droneMarkers.current[drone.id] = marker;
      }
      const from = marker.getLngLat(),
        started = performance.now();
      const animate = (now: number) => {
        const t = Math.min(1, (now - started) / 850);
        marker.setLngLat([
          from.lng + (drone.longitude - from.lng) * t,
          from.lat + (drone.latitude - from.lat) * t,
        ]);
        if (t < 1) animations.push(requestAnimationFrame(animate));
      };
      animations.push(requestAnimationFrame(animate));
    });
    return () => animations.forEach(cancelAnimationFrame);
  }, [data.drones]);
  useEffect(() => {
    if (map.current)
      map.current.getCanvas().style.cursor = workspace.placing
        ? "crosshair"
        : "";
  }, [workspace.placing]);
  return (
    <>
      <div
        ref={container}
        className="monitoring-map"
        aria-label="Peta jaringan pemantauan Kalimantan Tengah"
      />
      {mapError && (
        <div className="map-error" role="alert">
          <strong>Peta gagal dimuat</strong>
          <span>{mapError}</span>
          <button onClick={() => { setMapError(null); (map.current?.getSource("osm") as maplibregl.RasterTileSource | undefined)?.setTiles(onlineBasemap.sources.osm.type === "raster" ? onlineBasemap.sources.osm.tiles! : []); }}>Coba kembali</button>
        </div>
      )}
    </>
  );
}
