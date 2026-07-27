// apps/property-explorer/src/lib/config.ts
//
// Central config for the same-origin spine proxy. The browser holds NO service
// keys — every data call goes to /api/spine/*, and the serverless api/spine.ts
// proxy attaches auth server-side (CORTEX_SERVICE_API_KEY etc.). Anonymous
// public browse works with the proxy configured for the public/anonymous path.
//
// DEFAULT_CENTER / PARCEL_TILES values MUST stay in lockstep with
// @hauska/map-renderer SHARED_DEFAULT_CENTER / SHARED_PARCEL_TILES (CC-A WDLL 7).
// Kept as local constants (not a package import) so PE vitest can resolve
// without a prior renderer build — the LiveMapTile/ExplorerMap chrome still
// imports the shared module from the package.

/** Cortex BFF base, through the same-origin proxy. */
export const CORTEX_PROXY_BASE = "/api/spine/cortex/api";

/**
 * Unified PE facets BFF (dual-serve). Browser always hits this path; the
 * serverless handler decides atom-chain vs cortex via PROPERTY_ATOM_PATH and
 * attaches retrieval/cortex keys server-side. Instant rollback: unset the flag.
 */
export const PE_FACETS_PROXY_BASE = "/api/spine/property-atoms";

/**
 * DEFAULT_CENTER — Central Texas (Bastrop). Same values as
 * SHARED_DEFAULT_CENTER in @hauska/map-renderer/src/chrome/sharedMapDefaults.
 */
export const DEFAULT_CENTER = { latitude: 30.1105, longitude: -97.3184 };

/** Zoom the cold-open map settles at — close enough that live parcels load. */
export const DEFAULT_ZOOM = 15;

/**
 * PMTiles browse-parcel layer — same archive as SHARED_PARCEL_TILES (CC-A WDLL 7).
 */
export const PARCEL_TILES = {
  url: "https://storage.googleapis.com/hauska-map-tiles/parcels.4af31e1901e2.pmtiles",
  sourceLayer: "parcels",
  promoteId: "parcel_node_id",
};
