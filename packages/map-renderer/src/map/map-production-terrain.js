/**
 * TxGIO terrain-RGB tile set (T-009) — additive 3D viz only.
 * Lockstep with legacy-design-tools bake hash; update after re-bake + GCS publish.
 */
export const PRODUCTION_TERRAIN_RGB = {
  urlTemplate:
    "https://storage.googleapis.com/hauska-map-tiles/terrain-rgb.09ee4eaa72ca/{z}/{x}/{y}.png",
  encoding: "mapbox",
  hash: "09ee4eaa72ca",
  maxZoom: 16,
  tileSize: 256,
};

/** Regulatory-claim credibility — do not exceed 1.0 in production (doc 40). */
export const PRODUCTION_TERRAIN_EXAGGERATION = 1.0;
