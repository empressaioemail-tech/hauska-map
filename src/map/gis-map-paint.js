/**
 * Hauska dataviz paints — dark editorial canvas, luminous land-use choropleth,
 * cool FEMA water overlay, and the fire-palette rent-heat surface.
 *
 * Tuned to read as award-winning dataviz (saturated, glowing, layered) on a
 * deep warm-dark canvas rather than a light utility GIS basemap.
 */

/** Deep warm-dark canvas — data glows on top, brown signature retained. */
export const MAP_CANVAS_BROWN = "#16110c";

/** Carto dark raster — streets/labels recede beneath the data so it glows. */
const HAUSKA_BASEMAP_SOURCE = {
  type: "raster",
  tiles: [
    "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
    "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
    "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  ],
  tileSize: 256,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  maxzoom: 19,
};

/** @type {import('maplibre-gl').StyleSpecification} */
export const HAUSKA_GIS_BASE_STYLE = {
  version: 8,
  name: "hauska-gis-dataviz-dark",
  metadata: { "hauska:basemap": "carto-dark-warm-v2" },
  sources: {
    "hauska-carto-light": HAUSKA_BASEMAP_SOURCE,
  },
  layers: [
    {
      id: "hauska-brown-canvas",
      type: "background",
      paint: { "background-color": MAP_CANVAS_BROWN },
    },
    {
      id: "hauska-basemap",
      type: "raster",
      source: "hauska-carto-light",
      paint: {
        "raster-opacity": 0.92,
        "raster-saturation": -0.08,
        "raster-brightness-min": 0.0,
        "raster-brightness-max": 0.48,
        "raster-contrast": 0.16,
        // warm the cool Carto dark toward the brown signature
        "raster-hue-rotate": 18,
      },
    },
  ],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};

/** Cotality Property site-location + assessor fields (joined on parcel features). */
export const LAND_USE_MATCH = [
  "coalesce",
  ["get", "landUseCode"],
  ["get", "zoningCode"],
  ["get", "landUseDescription"],
  ["get", "zoningDescription"],
  ["get", "PlaceTypeClass"],
  ["get", "PLACE_TYPE"],
  ["get", "ZONE_CODE"],
  ["get", "ZONING"],
  ["get", "ZN_CODE"],
  "",
];

const FLOOD_MATCH = [
  "coalesce",
  ["get", "FLD_ZONE"],
  ["get", "ZONE_SUBTY"],
  ["get", "FLOOD_ZONE"],
  "",
];

/**
 * Luminous land-use palette tuned for the dark canvas. Solid hex here; the
 * fill layer carries opacity separately so colors stay vivid and consistent.
 */
export const LAND_USE_COLORS = {
  singleFamily: { fill: "#2fd07a", stroke: "#7df0b0" },
  multiFamily: { fill: "#3f8efc", stroke: "#9cc4ff" },
  commercial: { fill: "#ff8c1a", stroke: "#ffc987" },
  industrial: { fill: "#f0562a", stroke: "#ff9d7a" },
  mixedCore: { fill: "#b15cff", stroke: "#d9a9ff" },
  agricultural: { fill: "#b6d24a", stroke: "#e1f08f" },
  other: { fill: "#c98f5e", stroke: "#e8bf99" },
};

/** Static legend keys for land-use choropleth (matches fill expression). */
export const LAND_USE_LEGEND = [
  { key: "Single-family", fill: LAND_USE_COLORS.singleFamily.fill, stroke: LAND_USE_COLORS.singleFamily.stroke },
  { key: "Multi-family", fill: LAND_USE_COLORS.multiFamily.fill, stroke: LAND_USE_COLORS.multiFamily.stroke },
  { key: "Commercial", fill: LAND_USE_COLORS.commercial.fill, stroke: LAND_USE_COLORS.commercial.stroke },
  { key: "Industrial", fill: LAND_USE_COLORS.industrial.fill, stroke: LAND_USE_COLORS.industrial.stroke },
  { key: "Mixed / core", fill: LAND_USE_COLORS.mixedCore.fill, stroke: LAND_USE_COLORS.mixedCore.stroke },
  { key: "Agricultural", fill: LAND_USE_COLORS.agricultural.fill, stroke: LAND_USE_COLORS.agricultural.stroke },
  { key: "Other / unknown", fill: LAND_USE_COLORS.other.fill, stroke: LAND_USE_COLORS.other.stroke },
];

export const FEMA_LEGEND = [
  { key: "FEMA AE / A (100-yr)", fill: "#2bb6d6", stroke: "#7fe0f2" },
  { key: "500-yr (X shaded)", fill: "#3a7fd9", stroke: "#8fb8f5" },
  { key: "Floodway", fill: "#1f5fa8", stroke: "#5fa0e0" },
];

/** Fire ramp for the rent-heat surface — indigo → magenta → orange → white. */
export const RENT_HEAT_GRADIENT =
  "linear-gradient(90deg," +
  "rgba(48,16,90,0) 0%," +
  "#3a1276 14%," +
  "#7a1f9e 32%," +
  "#c0317a 50%," +
  "#f0562a 66%," +
  "#ff9d1c 82%," +
  "#fff2cf 100%)";

export const RENT_HEAT_LEGEND = {
  key: "Rent heat (market AVM)",
  gradient: RENT_HEAT_GRADIENT,
  low: "Cooler",
  high: "Premium",
};

function landUseCodeExpr() {
  return [
    "upcase",
    ["coalesce", ["get", "landUseCode"], ["get", "zoningCode"], ""],
  ];
}

function landUseDescExpr() {
  return [
    "downcase",
    ["coalesce", ["get", "landUseDescription"], ["get", "zoningDescription"], ""],
  ];
}

export function landUseFillColorExpr() {
  const desc = landUseDescExpr();
  const code = landUseCodeExpr();
  const C = LAND_USE_COLORS;
  return [
    "case",
    ["==", code, "P-5"],
    C.mixedCore.fill,
    ["==", code, "P-4"],
    C.multiFamily.fill,
    ["==", code, "P-2"],
    C.singleFamily.fill,
    ["==", code, "SFR"],
    C.singleFamily.fill,
    ["==", code, "R-1"],
    C.singleFamily.fill,
    ["==", code, "MF"],
    C.multiFamily.fill,
    ["==", code, "COM"],
    C.commercial.fill,
    ["==", code, "AG"],
    C.agricultural.fill,
    ["!=", ["index-of", "commercial", desc], -1],
    C.commercial.fill,
    ["!=", ["index-of", "retail", desc], -1],
    C.commercial.fill,
    ["!=", ["index-of", "office", desc], -1],
    C.commercial.fill,
    ["!=", ["index-of", "industrial", desc], -1],
    C.industrial.fill,
    ["!=", ["index-of", "warehouse", desc], -1],
    C.industrial.fill,
    ["!=", ["index-of", "multi", desc], -1],
    C.multiFamily.fill,
    ["!=", ["index-of", "apartment", desc], -1],
    C.multiFamily.fill,
    ["!=", ["index-of", "single", desc], -1],
    C.singleFamily.fill,
    ["!=", ["index-of", "residential", desc], -1],
    C.singleFamily.fill,
    ["!=", ["index-of", "agric", desc], -1],
    C.agricultural.fill,
    ["!=", ["index-of", "farm", desc], -1],
    C.agricultural.fill,
    ["!=", ["index-of", "mixed", desc], -1],
    C.mixedCore.fill,
    C.other.fill,
  ];
}

export function landUseLineColorExpr() {
  const desc = landUseDescExpr();
  const code = landUseCodeExpr();
  const C = LAND_USE_COLORS;
  return [
    "case",
    ["==", code, "P-5"],
    C.mixedCore.stroke,
    ["==", code, "P-4"],
    C.multiFamily.stroke,
    ["==", code, "P-2"],
    C.singleFamily.stroke,
    ["==", code, "SFR"],
    C.singleFamily.stroke,
    ["==", code, "MF"],
    C.multiFamily.stroke,
    ["==", code, "COM"],
    C.commercial.stroke,
    ["==", code, "AG"],
    C.agricultural.stroke,
    ["!=", ["index-of", "commercial", desc], -1],
    C.commercial.stroke,
    ["!=", ["index-of", "industrial", desc], -1],
    C.industrial.stroke,
    ["!=", ["index-of", "multi", desc], -1],
    C.multiFamily.stroke,
    ["!=", ["index-of", "apartment", desc], -1],
    C.multiFamily.stroke,
    ["!=", ["index-of", "single", desc], -1],
    C.singleFamily.stroke,
    ["!=", ["index-of", "residential", desc], -1],
    C.singleFamily.stroke,
    ["!=", ["index-of", "agric", desc], -1],
    C.agricultural.stroke,
    ["!=", ["index-of", "mixed", desc], -1],
    C.mixedCore.stroke,
    C.other.stroke,
  ];
}

export function floodFillColorExpr() {
  return [
    "match",
    FLOOD_MATCH,
    "AE",
    "#2bb6d6",
    "A",
    "#2bb6d6",
    "AH",
    "#2bb6d6",
    "AO",
    "#33a8cc",
    "X",
    "#3a7fd9",
    "X500",
    "#3a7fd9",
    "FLOODWAY",
    "#1f5fa8",
    "#2bb6d6",
  ];
}

export function floodLineColorExpr() {
  return [
    "match",
    FLOOD_MATCH,
    "FLOODWAY",
    "#5fa0e0",
    "AE",
    "#7fe0f2",
    "#7fe0f2",
  ];
}

/**
 * Heatmap paint for the rent-heat surface. Expects point features carrying a
 * numeric `rent` weight (market rent index). Smooth fire ramp, glowing cores.
 */
export function rentHeatPaint(weightProperty = "rent") {
  return {
    // Low-rent parcels contribute almost no density so cold areas stay clear and
    // the land-use choropleth reads through; the glow concentrates on premium cores.
    "heatmap-weight": [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", weightProperty], 0],
      0,
      0,
      40,
      0.05,
      60,
      0.32,
      80,
      0.72,
      100,
      1,
    ],
    "heatmap-intensity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      11,
      0.7,
      14,
      1.2,
      16,
      1.7,
      18,
      2.3,
    ],
    // Alpha stays near-zero at low density (no veil), then ramps into the fire.
    "heatmap-color": [
      "interpolate",
      ["linear"],
      ["heatmap-density"],
      0,
      "rgba(33,12,80,0)",
      0.12,
      "rgba(74,20,130,0.3)",
      0.3,
      "rgba(150,34,150,0.62)",
      0.48,
      "rgba(208,52,110,0.8)",
      0.64,
      "rgba(244,96,44,0.9)",
      0.8,
      "rgba(255,168,40,0.94)",
      1,
      "rgba(255,244,214,0.98)",
    ],
    "heatmap-radius": [
      "interpolate",
      ["linear"],
      ["zoom"],
      11,
      12,
      14,
      28,
      16,
      46,
      18,
      64,
    ],
    "heatmap-opacity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      11,
      0.85,
      17,
      0.82,
      19,
      0.7,
    ],
  };
}

export const LAYER_PAINT = {
  "dem-hillshade": {
    hillshade: true,
    stroke: "#9a8f7e",
  },
  "topography-contours": {
    stroke: "#9a8f7e",
    strokeWidth: 0.65,
    dash: [2, 3],
  },
  "hydrology-flow": {
    stroke: "#3db8ff",
    strokeWidth: 3,
    glow: true,
  },
  "parcel-extrusion": {
    extrusion: true,
    fill: "#4a8fd4",
    stroke: "#7ec8ff",
  },
  "buildable-envelope": {
    fillExpr: () => "#3fd97a",
    lineExpr: () => "#b8ffd4",
    strokeWidth: 1.2,
  },
  "constraint-density": {
    heatmap: true,
    heatProperty: "constraintCount",
  },
  "oz-deal-crossfilter": {
    fillExpr: () => "#b15cff",
    lineExpr: () => "#e0b8ff",
    strokeWidth: 1,
  },
  "motivated-seller": {
    heatmap: true,
    heatProperty: "leadHeat",
  },
  "ssurgo-soils": {
    fillExpr: [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "foundationRiskScore"], 0],
      0,
      "#2a4a2a",
      0.5,
      "#c9a020",
      1,
      "#e04040",
    ],
    lineExpr: () => "#ff9d7a",
    strokeWidth: 0.8,
  },
  groundwater: {
    fill: "#1a6fd4",
    stroke: "#b8ecff",
    strokeWidth: 1.2,
  },
  "mud-pid": {
    fill: "#8a5cff",
    stroke: "#d4b8ff",
    strokeWidth: 1,
    dash: [3, 2],
  },
  "edwards-aquifer": {
    fill: "#2bb6a0",
    stroke: "#7fe8d8",
    strokeWidth: 1,
  },
  "texas-rrc": {
    fill: "#f0562a",
    stroke: "#ffc987",
    strokeWidth: 1,
  },
  "parcel-polygon": {
    fillExpr: landUseFillColorExpr,
    lineExpr: landUseLineColorExpr,
    strokeWidth: 0.7,
  },
  zoning: {
    fillExpr: landUseFillColorExpr,
    lineExpr: landUseLineColorExpr,
    strokeWidth: 0.7,
  },
  "flood-zone": {
    fillExpr: floodFillColorExpr,
    lineExpr: floodLineColorExpr,
    strokeWidth: 1.1,
  },
  floodway: {
    fill: "#1f5fa8",
    stroke: "#5fa0e0",
    strokeWidth: 1.4,
  },
  "rent-heat": {
    heatmap: true,
  },
};

/** Bloom / saturation boost for heat and glow layers (CSS + paint companions). */
export const BLOOM_LAYER_CLASS = "hp-map-layer--bloom";

export function bloomHeatmapPaint(base = rentHeatPaint()) {
  return {
    ...base,
    "heatmap-intensity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      11,
      0.85,
      14,
      1.35,
      16,
      1.85,
      18,
      2.5,
    ],
    "heatmap-opacity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      11,
      0.88,
      17,
      0.86,
      19,
      0.74,
    ],
  };
}

export const TERRAIN_LEGEND = {
  key: "Terrain hillshade",
  fill: "#6a5f52",
  stroke: "#c4b8a4",
};

export const CONTOUR_LEGEND = {
  key: "5 m contours",
  fill: "transparent",
  stroke: "#9a8f7e",
};

export const FLOW_LEGEND = {
  key: "Hydrology flow (D8)",
  fill: "#1a6fd4",
  stroke: "#b8ecff",
};

export const EXTRUSION_LEGEND = {
  key: "Allowed height (ft)",
  gradient:
    "linear-gradient(180deg, #7ec8ff 0%, #4a8fd4 40%, #2a5080 100%)",
  low: "28 ft",
  high: "85 ft",
};

/** Render stack bottom → top. Hillshade under parcels; heat glows on top. */
export const GIS_LAYER_STACK = [
  "dem-hillshade",
  "topography-contours",
  "hydrology-flow",
  "flood-zone",
  "floodway",
  "buildable-envelope",
  "constraint-density",
  "oz-deal-crossfilter",
  "motivated-seller",
  "ssurgo-soils",
  "groundwater",
  "mud-pid",
  "edwards-aquifer",
  "texas-rrc",
  "parcel-polygon",
  "parcel-extrusion",
  "zoning",
  "rent-heat",
];

export function fillOpacityExpr(layerKey, meshMode = false) {
  if (layerKey === "parcel-polygon" || layerKey === "zoning") {
    const base = meshMode ? 0.84 : 0.8;
    return [
      "case",
      ["boolean", ["feature-state", "highlight"], false],
      0.96,
      ["boolean", ["feature-state", "dim"], false],
      0.18,
      ["boolean", ["feature-state", "selected"], false],
      0.95,
      base,
    ];
  }
  if (layerKey === "flood-zone") {
    return [
      "case",
      ["boolean", ["feature-state", "dim"], false],
      0.1,
      0.42,
    ];
  }
  if (layerKey === "buildable-envelope") {
    return 0.38;
  }
  return 0.85;
}

/** Standard MapLibre paint transition for layer toggles. */
export const LAYER_TOGGLE_TRANSITION = { duration: 420, delay: 0 };
