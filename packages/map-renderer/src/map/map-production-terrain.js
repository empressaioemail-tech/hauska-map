/**
 * TxGIO terrain-RGB tile set (T-009) — additive 3D viz only.
 * Lockstep with legacy-design-tools bake hash; update after re-bake + GCS publish.
 */
export const PRODUCTION_TERRAIN_RGB = {
  urlTemplate:
    "https://storage.googleapis.com/hauska-map-tiles/terrain-rgb.bac36819c719/{z}/{x}/{y}.png",
  encoding: "mapbox",
  hash: "bac36819c719",
  maxZoom: 16,
  tileSize: 256,
  /**
   * AOI coverage bbox [west, south, east, north] (WGS84), from the bake
   * metadata (aoi_bbox_wgs84, bastrop-city-2mi). Clips the raster-dem source
   * so MapLibre never requests terrain beyond coverage — without it the pitched
   * far field 404s past the AOI and explodes into the sky as a white band.
   */
  bounds: [-97.409, 30.006, -97.231, 30.224],
};

/** Regulatory-claim credibility — do not exceed 1.0 in production (doc 40). */
export const PRODUCTION_TERRAIN_EXAGGERATION = 1.0;
