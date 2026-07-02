/**
 * Hauska spatial map — light editorial basemap on deep brown canvas, rich GIS overlays.
 */

/** @type {import('maplibre-gl').StyleSpecification} */
export const HAUSKA_MAP_STYLE = {
  version: 8,
  name: "hauska-editorial-light",
  metadata: { "hauska:basemap": "editorial-light-brown-v1" },
  sources: {
    "hauska-carto-light": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "hauska-basemap",
      type: "raster",
      source: "hauska-carto-light",
      paint: {
        "raster-opacity": 0.88,
        "raster-saturation": -0.12,
        "raster-brightness-min": 0.08,
        "raster-brightness-max": 0.78,
        "raster-contrast": 0.08,
        "raster-hue-rotate": -6,
      },
    },
  ],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};

/** Deep warm-dark dataviz canvas — data glows on top. */
export const MAP_CANVAS_BROWN = "#16110c";

export const GIS_LAYER_PAINT = {
  "parcel-polygon": {
    fill: "rgba(35,74,120,0.28)",
    stroke: "#1e4a7a",
    strokeWidth: 2.5,
  },
  zoning: {
    fill: "rgba(116,110,98,0.22)",
    stroke: "#5c5348",
    strokeWidth: 1.5,
    subcodes: {
      "P-5": { fill: "rgba(147,51,234,0.42)", stroke: "#7c22c9" },
      "P-4": { fill: "rgba(59,130,246,0.38)", stroke: "#2563eb" },
      "P-2": { fill: "rgba(34,197,94,0.36)", stroke: "#16a34a" },
    },
  },
  etj: {
    fill: "rgba(74,122,181,0.18)",
    stroke: "#234a78",
    strokeWidth: 1.5,
    dash: [4, 3],
  },
  "flood-zone": {
    fill: "rgba(155,123,199,0.38)",
    stroke: "#7b5ea8",
    strokeWidth: 1.5,
    subcodes: {
      AE: { fill: "rgba(155,123,199,0.42)", stroke: "#7b5ea8" },
      X_500: { fill: "rgba(232,200,74,0.40)", stroke: "#c9a820" },
    },
  },
  floodway: {
    fill: "rgba(123,45,142,0.44)",
    stroke: "#5a1f68",
    strokeWidth: 2,
  },
  "opportunity-zone-tract": {
    fill: "rgba(63,114,86,0.36)",
    stroke: "#2d5a40",
    strokeWidth: 1.5,
  },
  dem: {
    fill: "rgba(163,156,143,0.16)",
    stroke: "#8a8278",
    strokeWidth: 1,
  },
  topography: {
    fill: "none",
    stroke: "#8a8278",
    strokeWidth: 1,
  },
};
