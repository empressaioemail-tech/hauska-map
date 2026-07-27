// apps/property-explorer/api/_lib/pe-topography-core.ts
//
// Pure helpers for the Property Explorer topography (contours) BFF. Kept
// framework-free so the request-shape validation, gate-header construction, and
// engine-envelope -> map-layer response mapping are unit-testable without a
// serverless runtime.
//
// The contour LAYER is a FREE browse layer (peer to FEMA flood on the browse
// map), so this BFF does NOT gate on a paid PE session. It fetches the engine
// map-layers `topography` slot for the current viewport and returns the contour
// GeoJSON plus HONEST source/interval provenance.
//
// HONESTY: the engine map-layers `topography` slot derives contours from the
// USGS 3DEP national DEM at a 1-METRE vertical interval. It is NOT the Bastrop
// 1-ft LiDAR (that authoritative tier flows only through the DXF/site-plan
// EXPORT path via resolveContourSource, not this live map slot). This BFF
// therefore labels contours as 3DEP-derived and never claims 1-ft.

import {
  engineApiBaseUrl,
  engineApiGateToken,
} from './pe-site-plan-export-core.js'

export { engineApiBaseUrl, engineApiGateToken }

export interface TopoBbox {
  westLng: number
  southLat: number
  eastLng: number
  northLat: number
}

export interface TopoRequest {
  bbox: TopoBbox
  /** Viewport centre — the map-layers assemble request is parcel-anchored. */
  centerLat: number
  centerLng: number
}

/** Longitude/latitude sanity bounds for a viewport bbox. */
function isFiniteLngLat(n: unknown, kind: 'lng' | 'lat'): n is number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return false
  return kind === 'lng' ? n >= -180 && n <= 180 : n >= -90 && n <= 90
}

/** Validate + normalise the client body into a TopoRequest, or return an error. */
export function parseTopoRequest(
  body: unknown,
): { ok: true; request: TopoRequest } | { ok: false; message: string } {
  const b = (typeof body === 'string' ? safeJson(body) : body) as
    | Record<string, unknown>
    | null
  if (!b || typeof b !== 'object') {
    return { ok: false, message: 'body must be a JSON object with bbox + center' }
  }
  const bbox = b.bbox as Record<string, unknown> | undefined
  if (!bbox || typeof bbox !== 'object') {
    return { ok: false, message: 'bbox is required' }
  }
  const { westLng, southLat, eastLng, northLat } = bbox
  if (
    !isFiniteLngLat(westLng, 'lng') ||
    !isFiniteLngLat(eastLng, 'lng') ||
    !isFiniteLngLat(southLat, 'lat') ||
    !isFiniteLngLat(northLat, 'lat')
  ) {
    return { ok: false, message: 'bbox must have finite westLng/southLat/eastLng/northLat' }
  }
  if ((westLng as number) >= (eastLng as number) || (southLat as number) >= (northLat as number)) {
    return { ok: false, message: 'bbox must have west<east and south<north' }
  }
  const centerLat = pickCenter(b.centerLat, southLat as number, northLat as number)
  const centerLng = pickCenter(b.centerLng, westLng as number, eastLng as number)
  return {
    ok: true,
    request: {
      bbox: {
        westLng: westLng as number,
        southLat: southLat as number,
        eastLng: eastLng as number,
        northLat: northLat as number,
      },
      centerLat,
      centerLng,
    },
  }
}

function pickCenter(v: unknown, lo: number, hi: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return (lo + hi) / 2
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/**
 * Build the map-layers assemble request body for a viewport, requesting ONLY the
 * topography slot. Jurisdiction keys are left null — the topography slot is
 * jurisdiction-agnostic (3DEP national DEM); passing a wrong localKey would not
 * upgrade it to 1-ft anyway (that tier is export-only).
 */
export function buildAssembleBody(req: TopoRequest): Record<string, unknown> {
  return {
    parcel: {
      latitude: req.centerLat,
      longitude: req.centerLng,
      parcelKey: 'pe-browse-viewport',
    },
    jurisdiction: { stateKey: null, localKey: null },
    layers: ['topography'],
    bbox: req.bbox,
  }
}

/**
 * Gate-front headers engine-api requires on every non-health call. Product
 * `cortex`, package `map-layers`, access tier `public-free` (contours are a free
 * browse layer). Mirrors buildTerrainEngineGateHeaders but at the free tier.
 */
export function buildTopographyGateHeaders(opts?: {
  requestId?: string
  credentialId?: string
  tenantId?: string
}): Record<string, string> {
  const requestId =
    opts?.requestId?.trim() ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pe-topo-${Date.now()}`)
  return {
    'x-hauska-product': 'cortex',
    'x-hauska-tenant-id': opts?.tenantId?.trim() || 'public-catalog',
    'x-hauska-package-id': 'map-layers',
    'x-hauska-access-tier': 'public-free',
    'x-hauska-gate-credential-id':
      opts?.credentialId?.trim() || 'property-explorer-topography-bff',
    'x-hauska-request-id': requestId,
  }
}

export interface TopoLayerResponse {
  /** Contour FeatureCollection (may be empty features on no-coverage). */
  geojson: { type: 'FeatureCollection'; features: unknown[] }
  /** Honest provider label from the engine slot. */
  provider: string | null
  /** Honest source tier — 3DEP-derived contours for this map slot. */
  tier: 'derived-3dep'
  /** Honest interval label, e.g. "1 m (3DEP-derived)". */
  intervalLabel: string
  /** True when the engine flagged degraded coverage (nodata masking, etc.). */
  degraded: boolean
  /** Feature count for chip/telemetry. */
  featureCount: number
  /** Slot status from the engine (ok | pending | no-coverage | failed). */
  status: 'ok' | 'pending' | 'no-coverage' | 'empty'
  /** Present when status !== 'ok' — the honest reason. */
  detail?: string
}

/**
 * Map the engine `/v1/map-layers/assemble` payload onto the browse-map contour
 * response. Reads the ONE `topography` slot; never fabricates a source it did
 * not get. Any non-ok slot returns an honest status the client can surface.
 */
export function mapAssemblePayload(payload: unknown): TopoLayerResponse {
  const empty: TopoLayerResponse = {
    geojson: { type: 'FeatureCollection', features: [] },
    provider: null,
    tier: 'derived-3dep',
    intervalLabel: '1 m (3DEP-derived)',
    degraded: true,
    featureCount: 0,
    status: 'empty',
    detail: 'engine returned no topography slot',
  }
  const p = payload as Record<string, unknown> | null
  // The engine seals the assemble body under `data` (envelopeJson). Support both
  // a bare payload and an enveloped one.
  const data = (p?.data ?? p) as Record<string, unknown> | null
  const layers = data?.layers as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(layers)) return empty
  const slot = layers.find((l) => l?.layerKey === 'topography')
  if (!slot) return empty

  const status = String(slot.status ?? 'empty')
  if (status !== 'ok') {
    return {
      ...empty,
      status: status === 'pending' ? 'pending' : status === 'no-coverage' ? 'no-coverage' : 'empty',
      detail:
        (typeof slot.pendingReason === 'string' && slot.pendingReason) ||
        (typeof (slot.error as Record<string, unknown>)?.message === 'string'
          ? String((slot.error as Record<string, unknown>).message)
          : 'topography slot not ok'),
    }
  }

  // slot.envelope.data holds the sealed MapLayerGeometryPayload.
  const envelope = slot.envelope as Record<string, unknown> | undefined
  const geomBody = (envelope?.data ?? envelope) as Record<string, unknown> | undefined
  const geojson = normalizeFc(geomBody?.geojson)
  const provider =
    typeof geomBody?.provider === 'string' ? geomBody.provider : 'USGS 3DEP + site-topography'
  const attrs = geomBody?.attributes as Record<string, unknown> | undefined
  const intervalMeters =
    typeof attrs?.intervalMeters === 'number' ? attrs.intervalMeters : 1
  const coverage = envelope?.coverage as Record<string, unknown> | undefined
  const degraded = coverage?.degraded === true

  return {
    geojson,
    provider,
    tier: 'derived-3dep',
    intervalLabel: `${intervalMeters} m (3DEP-derived)`,
    degraded,
    featureCount: geojson.features.length,
    status: 'ok',
  }
}

function normalizeFc(gj: unknown): { type: 'FeatureCollection'; features: unknown[] } {
  const g = gj as Record<string, unknown> | null
  if (g && g.type === 'FeatureCollection' && Array.isArray(g.features)) {
    return { type: 'FeatureCollection', features: g.features }
  }
  return { type: 'FeatureCollection', features: [] }
}
