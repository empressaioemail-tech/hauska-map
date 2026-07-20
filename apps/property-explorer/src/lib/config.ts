// apps/property-explorer/src/lib/config.ts
//
// Central config for the same-origin spine proxy. The browser holds NO service
// keys — every data call goes to /api/spine/*, and the serverless api/spine.ts
// proxy attaches auth server-side (CORTEX_SERVICE_API_KEY etc.). Anonymous
// public browse works with the proxy configured for the public/anonymous path.

/** Cortex BFF base, through the same-origin proxy. */
export const CORTEX_PROXY_BASE = "/api/spine/cortex/api";

/**
 * DEFAULT_CENTER — Central Texas (Bastrop, the pioneer network city). The map
 * cold-opens here so the user sees a live, recognizable region before doing
 * anything. {latitude, longitude} per the renderer's Center contract.
 */
export const DEFAULT_CENTER = { latitude: 30.1105, longitude: -97.3184 };

/** Zoom the cold-open map settles at — close enough that live parcels load. */
export const DEFAULT_ZOOM = 15;

/**
 * PMTiles browse-parcel layer (R1) — the baked Central-TX parcel corpus served
 * as vector PMTiles. Source, sourceLayer, and promoteId are the values the
 * brief extension's spine-map wires today (verified in
 * hauska-brief-extension/src/lib/spine-map.js). The `pmtiles://` prefix is
 * optional; the renderer adds it and registers the protocol internally.
 *
 * SEAM (Track B): when the persistent-map API serves a baked-node tileset, this
 * URL rebinds to it. For the skeleton we read the same published archive the
 * extension reads.
 */
export const PARCEL_TILES = {
  url: "https://storage.googleapis.com/hauska-map-tiles/parcels.4af31e1901e2.pmtiles",
  sourceLayer: "parcels",
  promoteId: "parcel_node_id",
};
