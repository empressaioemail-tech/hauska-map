// packages/map-renderer/src/chrome/sharedMapDefaults.ts
//
// Shared cold-open center + PMTiles browse config used by PE ExplorerMap and
// CC LiveMapTile (CC-A WDLL 7 — one layered shell, both surfaces).
// Phase 0A: progressive-disclosure presets + cold-open seed live here too.

import type { Center, ParcelTilesConfig, LayerKey } from "../postMessage";
import {
  COLD_OPEN_VISIBLE_LAYERS,
  MAP_LAYER_PRESETS,
  enforceDataLayerMutex,
} from "../map/layer-role-taxonomy.js";

/** Central Texas (Bastrop) cold-open center — renderer Center contract. */
export const SHARED_DEFAULT_CENTER: Center = {
  latitude: 30.1105,
  longitude: -97.3184,
};

/** Rollback: set VITE_PARCEL_PMTILES_HASH=3431529a2e8d (Central-TX 19-county). */
const PARCEL_PMTILES_HASH =
  (typeof import.meta !== "undefined" &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env
      ?.VITE_PARCEL_PMTILES_HASH) ||
  "b692c6534d26";

const PARCEL_PMTILES_BASE =
  "https://storage.googleapis.com/hauska-map-tiles/parcels";

/**
 * PMTiles browse-parcel layer — statewide TX parcel corpus (2026-08-09).
 * Same archive both surfaces mount so attribution / parcel click / feature-state stay aligned.
 */
export const SHARED_PARCEL_TILES: ParcelTilesConfig = {
  url: `${PARCEL_PMTILES_BASE}.${PARCEL_PMTILES_HASH}.pmtiles`,
  sourceLayer: "parcels",
  promoteId: "parcel_node_id",
};

/** TxGIO terrain-RGB (T-009/T-010) — additive 3D viz; lockstep with map-production-terrain.js */
export type TerrainRgbConfig = {
  urlTemplate: string;
  encoding: "mapbox";
  hash: string;
  maxZoom: number;
  tileSize: number;
  /** AOI coverage bbox [west, south, east, north] (WGS84); clips raster-dem requests. */
  bounds: [number, number, number, number];
};

export const SHARED_TERRAIN_RGB: TerrainRgbConfig = {
  urlTemplate:
    "https://storage.googleapis.com/hauska-map-tiles/terrain-rgb.bac36819c719/{z}/{x}/{y}.png",
  encoding: "mapbox",
  hash: "bac36819c719",
  maxZoom: 16,
  tileSize: 256,
  bounds: [-97.409, 30.006, -97.231, 30.224],
};

/** Re-export taxonomy cold-open + presets for PE/CC chrome. */
export { COLD_OPEN_VISIBLE_LAYERS, MAP_LAYER_PRESETS };

/** Cold-open visible set as a Set<LayerKey>. */
export function coldOpenVisibleLayers(): Set<LayerKey> {
  return new Set(COLD_OPEN_VISIBLE_LAYERS as readonly LayerKey[]);
}

/** Apply a named preset; enforces DATA mutex. */
export function visibleLayersForPreset(
  name: keyof typeof MAP_LAYER_PRESETS,
): Set<LayerKey> {
  const layers = MAP_LAYER_PRESETS[name] ?? MAP_LAYER_PRESETS.Default;
  return enforceDataLayerMutex(layers as readonly string[]) as Set<LayerKey>;
}
