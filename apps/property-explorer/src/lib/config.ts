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
 * Retrieval-API proxy base (anonymous browse allowlist: health,
 * property-nodes/:id/atom-chain, atoms/:did, attaching-roads, near-bbox).
 * Used by the chat citation accordion for fetch-on-tap atom enrichment and
 * the client-composed lineage walk. The proxy attaches the Bearer key
 * server-side; the browser never holds it.
 */
export const PE_RETRIEVAL_PROXY_BASE = "/api/spine/retrieval";

/**
 * DEFAULT_CENTER — Central Texas (Bastrop). Same values as
 * SHARED_DEFAULT_CENTER in @hauska/map-renderer/src/chrome/sharedMapDefaults.
 */
export const DEFAULT_CENTER = { latitude: 30.1105, longitude: -97.3184 };

/** Zoom the cold-open map settles at — close enough that live parcels load. */
export const DEFAULT_ZOOM = 15;

/** Rollback: set VITE_PARCEL_PMTILES_HASH=3431529a2e8d (Central-TX 19-county). */
const env =
  typeof import.meta !== "undefined"
    ? (import.meta as ImportMeta & { env?: Record<string, string> }).env
    : undefined;

const PARCEL_PMTILES_HASH = env?.VITE_PARCEL_PMTILES_HASH ?? "b692c6534d26";

const PARCEL_PMTILES_BASE =
  "https://storage.googleapis.com/hauska-map-tiles/parcels";

/** F-06: optional tiles.json manifest URL (data pointer, not a code deploy). */
export const TILES_MANIFEST_URL =
  env?.VITE_TILES_MANIFEST_URL ?? "/tiles.json";

export type TilesManifest = {
  hash: string;
  url: string;
  sourceLayer?: string;
  promoteId?: string;
};

let cachedManifest: TilesManifest | null = null;

export async function loadTilesManifest(): Promise<TilesManifest | null> {
  if (cachedManifest) return cachedManifest;
  try {
    const res = await fetch(TILES_MANIFEST_URL);
    if (!res.ok) return null;
    cachedManifest = (await res.json()) as TilesManifest;
    return cachedManifest;
  } catch {
    return null;
  }
}

/**
 * PMTiles browse-parcel layer — hash pin or tiles.json manifest (F-06).
 */
export const PARCEL_TILES = {
  url: `${PARCEL_PMTILES_BASE}.${PARCEL_PMTILES_HASH}.pmtiles`,
  sourceLayer: "parcels",
  promoteId: "parcel_node_id",
};

/** Resolve parcel tiles URL, preferring tiles.json when loaded. */
export async function resolveParcelTiles(): Promise<typeof PARCEL_TILES> {
  const manifest = await loadTilesManifest();
  if (manifest?.url) {
    return {
      url: manifest.url,
      sourceLayer: manifest.sourceLayer ?? PARCEL_TILES.sourceLayer,
      promoteId: manifest.promoteId ?? PARCEL_TILES.promoteId,
    };
  }
  return PARCEL_TILES;
}

/**
 * TxGIO terrain-RGB — same values as SHARED_TERRAIN_RGB (T-010).
 */
export const TERRAIN_RGB = {
  urlTemplate:
    "https://storage.googleapis.com/hauska-map-tiles/terrain-rgb.09ee4eaa72ca/{z}/{x}/{y}.png",
  encoding: "mapbox" as const,
  hash: "09ee4eaa72ca",
  maxZoom: 16,
  tileSize: 256,
};
