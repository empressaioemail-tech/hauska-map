// packages/map-renderer/src/chrome/sharedMapDefaults.ts
//
// Shared cold-open center + PMTiles browse config used by PE ExplorerMap and
// CC LiveMapTile (CC-A WDLL 7 — one layered shell, both surfaces).

import type { Center, ParcelTilesConfig } from "../postMessage";

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
