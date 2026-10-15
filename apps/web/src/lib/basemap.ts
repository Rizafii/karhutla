import type { StyleSpecification } from "maplibre-gl";

// Every map starts with online tiles. Operational GeoJSON is an overlay only.
export const onlineBasemap: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#14231f" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.35 } },
  ],
};
