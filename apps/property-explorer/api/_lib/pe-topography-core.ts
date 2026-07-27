// apps/property-explorer/api/_lib/pe-topography-core.ts
//
// Pure helpers for the Property Explorer topography (contours) BFF. Kept
// framework-free so the request-shape validation, gate-header construction, and
// engine-envelope -> map-layer response mapping are unit-testable without a
// serverless runtime.
//
// The contour LAYER is a FREE browse layer (peer to FEMA flood on the browse
// map), so this BFF does NOT gate on a paid PE session. It fetches the engine
// map-layers `topography-1ft` slot for the current viewport and returns the
// contour GeoJSON plus the HONEST per-viewport source tier.
//
// HONESTY — TIER FOLLOWS THE SERVED RESPONSE, NEVER A STATIC CLAIM:
//   The `topography-1ft` slot serves the AUTHORITATIVE 1-ft LiDAR contours
//   inside the Bastrop County footprint (`contourSource.tier ==="authoritative-1ft"`)
//   and an HONEST 3DEP-derived fallback everywhere else / on degrade
//   (`tier === "3dep-fallback"`, carrying a `fallbackReason`). This BFF reads
//   `payload.attributes.contourSource` per response and passes the TRUE tier +
//   source/vintage/interval to the client so a Bastrop viewport is labelled
//   1-ft and a non-Bastrop viewport is labelled 3DEP. It NEVER hardcodes either.

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
 * topography-1ft slot. Jurisdiction keys are left null — the slot self-detects
 * the Bastrop footprint from the bbox (it does not need a localKey to upgrade to
 * 1-ft; the county contour service is queried by bbox intersection).
 */
export function buildAssembleBody(req: TopoRequest): Record<string, unknown> {
  return {
    parcel: {
      latitude: req.centerLat,
      longitude: req.centerLng,
      parcelKey: 'pe-browse-viewport',
    },
    jurisdiction: { stateKey: null, localKey: null },
    layers: ['topography-1ft'],
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

/** The honest served-contour tier, straight from `contourSource.tier`. */
export type ContourTier = 'authoritative-1ft' | '3dep-fallback'

export interface TopoLayerResponse {
  /** Contour FeatureCollection (may be empty features on no-coverage). */
  geojson: { type: 'FeatureCollection'; features: unknown[] }
  /** Honest provider label from the engine slot. */
  provider: string | null
  /** Honest source tier for THIS viewport — 1-ft (Bastrop) or 3DEP fallback. */
  tier: ContourTier
  /** Honest interval label, e.g. "1 ft (Bastrop LiDAR)" or "1-m (3DEP-derived)". */
  intervalLabel: string
  /** Source string from the served contourSource (e.g. Bastrop GIS / usgs:3dep-dem). */
  source: string | null
  /** Data vintage of the served tier, when present. */
  vintage: string | null
  /** When tier is 3dep-fallback, WHY the authoritative tier was not served. */
  fallbackReason: string | null
  /** True when the engine flagged degraded coverage (nodata masking, etc.). */
  degraded: boolean
  /** Feature count for chip/telemetry. */
  featureCount: number
  /** Slot status from the engine (ok | pending | no-coverage | failed). */
  status: 'ok' | 'pending' | 'no-coverage' | 'empty'
  /** Present when status !== 'ok' — the honest reason. */
  detail?: string
}

/** The engine seals slot geometry under `envelope.payload` (see sealEnvelope);
 *  accept a legacy `data` key too so a fixture or older wire shape still maps. */
function envelopeBody(envelope: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!envelope) return undefined
  return (envelope.payload ?? envelope.data ?? envelope) as Record<string, unknown> | undefined
}

/**
 * Map the engine `/v1/map-layers/assemble` payload onto the browse-map contour
 * response. Reads the ONE `topography-1ft` slot and reports the TRUE served tier
 * (`contourSource.tier`). Never fabricates a source or a tier it did not get;
 * any non-ok slot returns an honest status the client can surface.
 */
export function mapAssemblePayload(payload: unknown): TopoLayerResponse {
  const empty: TopoLayerResponse = {
    geojson: { type: 'FeatureCollection', features: [] },
    provider: null,
    tier: '3dep-fallback',
    intervalLabel: 'contours unavailable',
    source: null,
    vintage: null,
    fallbackReason: 'engine returned no topography-1ft slot',
    degraded: true,
    featureCount: 0,
    status: 'empty',
    detail: 'engine returned no topography-1ft slot',
  }
  const p = payload as Record<string, unknown> | null
  // Outer envelope: the assemble body is sealed under `payload` (envelopeJson).
  // Support a bare payload, a `payload`-sealed one, and a legacy `data` one.
  const outer = (p?.payload ?? p?.data ?? p) as Record<string, unknown> | null
  const layers = outer?.layers as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(layers)) return empty
  const slot = layers.find((l) => l?.layerKey === 'topography-1ft')
  if (!slot) return empty

  const status = String(slot.status ?? 'empty')
  if (status !== 'ok') {
    const reason =
      (typeof slot.pendingReason === 'string' && slot.pendingReason) ||
      (typeof (slot.error as Record<string, unknown>)?.message === 'string'
        ? String((slot.error as Record<string, unknown>).message)
        : 'topography-1ft slot not ok')
    return {
      ...empty,
      status: status === 'pending' ? 'pending' : status === 'no-coverage' ? 'no-coverage' : 'empty',
      fallbackReason: reason,
      detail: reason,
    }
  }

  const envelope = slot.envelope as Record<string, unknown> | undefined
  const geomBody = envelopeBody(envelope)
  const geojson = normalizeFc(geomBody?.geojson)
  const attrs = geomBody?.attributes as Record<string, unknown> | undefined
  const cs = attrs?.contourSource as Record<string, unknown> | undefined

  // TRUE tier comes from the served contourSource. Default to the honest
  // 3dep-fallback if the block is somehow absent (never assume 1-ft).
  const rawTier = typeof cs?.tier === 'string' ? cs.tier : '3dep-fallback'
  const tier: ContourTier =
    rawTier === 'authoritative-1ft' ? 'authoritative-1ft' : '3dep-fallback'

  const source =
    (typeof cs?.source === 'string' && cs.source) ||
    (typeof geomBody?.provider === 'string' ? geomBody.provider : null)
  const vintage = typeof cs?.vintage === 'string' ? cs.vintage : null
  const fallbackReason =
    tier === '3dep-fallback' && typeof cs?.fallbackReason === 'string'
      ? cs.fallbackReason
      : null

  const provider =
    typeof geomBody?.provider === 'string' ? geomBody.provider : source

  const coverage = envelope?.coverage as Record<string, unknown> | undefined
  const degraded = coverage?.degraded === true

  return {
    geojson,
    provider,
    tier,
    intervalLabel: contourIntervalLabel(tier, cs),
    source,
    vintage,
    fallbackReason,
    degraded,
    featureCount: geojson.features.length,
    status: 'ok',
  }
}

/**
 * Build the honest interval/tier LABEL for the served response. 1-ft only when
 * the served tier IS authoritative-1ft; 3DEP-derived otherwise. Prefers the
 * served `intervalLabel` string and never upgrades a 3DEP response to "1-ft".
 */
export function contourIntervalLabel(
  tier: ContourTier,
  cs: Record<string, unknown> | undefined,
): string {
  const served = typeof cs?.intervalLabel === 'string' ? cs.intervalLabel : null
  if (tier === 'authoritative-1ft') {
    // e.g. served BASTROP_CONTOUR_INTERVAL_LABEL ("1-ft interval (…)") — trust it.
    return served ?? '1 ft (Bastrop LiDAR)'
  }
  // 3DEP fallback: never say 1-ft even if a served label were malformed.
  if (served && !/1\s*-?\s*ft|lidar/i.test(served)) return served
  return '1 m (3DEP-derived)'
}

function normalizeFc(gj: unknown): { type: 'FeatureCollection'; features: unknown[] } {
  const g = gj as Record<string, unknown> | null
  if (g && g.type === 'FeatureCollection' && Array.isArray(g.features)) {
    return { type: 'FeatureCollection', features: g.features }
  }
  return { type: 'FeatureCollection', features: [] }
}
