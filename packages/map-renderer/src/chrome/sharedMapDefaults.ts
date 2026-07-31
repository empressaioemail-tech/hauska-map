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

/**
 * PMTiles browse-parcel layer — Central-TX parcel corpus. Same archive both
 * surfaces mount so attribution / parcel click / feature-state stay aligned.
 */
export const SHARED_PARCEL_TILES: ParcelTilesConfig = {
  url: "https://storage.googleapis.com/hauska-map-tiles/parcels.4af31e1901e2.pmtiles",
  sourceLayer: "parcels",
  promoteId: "parcel_node_id",
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
