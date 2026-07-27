// apps/property-explorer/src/lib/config.ts
//
// Central config for the same-origin spine proxy. The browser holds NO service
// keys — every data call goes to /api/spine/*, and the serverless api/spine.ts
// proxy attaches auth server-side (CORTEX_SERVICE_API_KEY etc.). Anonymous
// public browse works with the proxy configured for the public/anonymous path.

import {
  SHARED_DEFAULT_CENTER,
  SHARED_PARCEL_TILES,
} from "@hauska/map-renderer";

/** Cortex BFF base, through the same-origin proxy. */
export const CORTEX_PROXY_BASE = "/api/spine/cortex/api";

/**
 * Unified PE facets BFF (dual-serve). Browser always hits this path; the
 * serverless handler decides atom-chain vs cortex via PROPERTY_ATOM_PATH and
 * attaches retrieval/cortex keys server-side. Instant rollback: unset the flag.
 */
export const PE_FACETS_PROXY_BASE = "/api/spine/property-atoms";

/**
 * DEFAULT_CENTER — shared with CC LiveMapTile (CC-A WDLL 7).
 */
export const DEFAULT_CENTER = SHARED_DEFAULT_CENTER;

/** Zoom the cold-open map settles at — close enough that live parcels load. */
export const DEFAULT_ZOOM = 15;

/**
 * PMTiles browse-parcel layer — shared with CC LiveMapTile (CC-A WDLL 7).
 */
export const PARCEL_TILES = SHARED_PARCEL_TILES;
