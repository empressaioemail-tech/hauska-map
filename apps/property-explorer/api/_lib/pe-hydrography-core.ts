// apps/property-explorer/api/_lib/pe-hydrography-core.ts
//
// Pure helpers for the Property Explorer HYDROGRAPHY BFF. Kept framework-free
// so request validation, gate-header construction, and the engine-envelope ->
// map-layer response mapping are unit-testable without a serverless runtime.
// Mirrors pe-hydrology-core / pe-topography-core exactly.
//
// The `hydrography` LAYER is a FREE browse layer (peer to contours + FEMA
// flood), so this BFF does NOT gate on a paid PE session. It fetches the engine
// map-layers `hydrography` slot for the current viewport and returns REAL
// county-mapped stream geometry (named where the source names them).
//
// HONESTY — REAL STREAMS OR AN HONEST ABSENCE, NEVER A DERIVED SQUIGGLE:
//   The `hydrography` slot serves county-mapped hydrography (streams/creeks
//   from the county's own GIS source, provenance attached: source, layerName,
//   vintage). Three honest non-data states, all NON-errors:
//     - honest-empty: the county source is configured but has no streams in
//       this bbox (empty FeatureCollection + a real `honestEmptyReason`);
//     - honest-unavailable: the county has NO configured hydrography source
//       (the engine says so; we pass the reason through);
//     - not-yet-deployed (FEATURE-DETECT): the engine build serving this
//       request does not know the `hydrography` layer yet (404 / unknown-layer
//       / missing slot). Surfaced as status "unavailable" with an honest
//       "Hydrography not yet available" — NEVER an error while the engine leg
//       deploys separately.

import {
  engineApiBaseUrl,
  engineApiGateToken,
} from './pe-site-plan-export-core.js'
import {
  parseTopoRequest as parseViewportRequest,
  type TopoBbox,
  type TopoRequest,
} from './pe-topography-core.js'

export { engineApiBaseUrl, engineApiGateToken }
export type HydrographyBbox = TopoBbox
export type HydrographyRequest = TopoRequest

/** Honest copy for the feature-detect state (engine slot not deployed yet). */
export const HYDROGRAPHY_NOT_YET_AVAILABLE =
  'Hydrography not yet available'

/** Same viewport-body contract as the topography/hydrology BFFs. */
export function parseHydrographyRequest(
  body: unknown,
): { ok: true; request: HydrographyRequest } | { ok: false; message: string } {
  return parseViewportRequest(body)
}

/**
 * Build the map-layers assemble request body for a viewport, requesting ONLY
 * the `hydrography` slot. Jurisdiction keys are left null — the engine resolves
 * the county-mapped source from the viewport itself.
 */
export function buildHydrographyAssembleBody(
  req: HydrographyRequest,
): Record<string, unknown> {
  return {
    parcel: {
      latitude: req.centerLat,
      longitude: req.centerLng,
      parcelKey: 'pe-browse-viewport',
    },
    jurisdiction: { stateKey: null, localKey: null },
    layers: ['hydrography'],
    bbox: req.bbox,
  }
}

/**
 * Gate-front headers engine-api requires on every non-health call. Product
 * `cortex`, package `map-layers`, access tier `public-free` (hydrography is a
 * free browse layer, peer to contours). Mirrors buildHydrologyGateHeaders.
 */
export function buildHydrographyGateHeaders(opts?: {
  requestId?: string
  credentialId?: string
  tenantId?: string
}): Record<string, string> {
  const requestId =
    opts?.requestId?.trim() ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pe-hydrography-${Date.now()}`)
  return {
    'x-hauska-product': 'cortex',
    'x-hauska-tenant-id': opts?.tenantId?.trim() || 'public-catalog',
    'x-hauska-package-id': 'map-layers',
    'x-hauska-access-tier': 'public-free',
    'x-hauska-gate-credential-id':
      opts?.credentialId?.trim() || 'property-explorer-hydrography-bff',
    'x-hauska-request-id': requestId,
  }
}

/** County-source provenance for the served streams (rides the layer tooltip). */
export interface HydrographyProvenance {
  /** The county GIS source (e.g. "Bastrop County GIS"). */
  source: string | null
  /** The source layer name (e.g. "Streams"). */
  layerName: string | null
  /** Source vintage, when the county publishes one. */
  vintage: string | null
  /** Provenance kind from the engine (expected: "county-mapped-hydrography"). */
  kind: string | null
}

export interface HydrographyLayerResponse {
  /** Stream FeatureCollection (empty on honest-empty; `name` property when the
   *  county source names the stream). */
  geojson: { type: 'FeatureCollection'; features: unknown[] }
  /** Honest provider label from the engine slot (falls back to provenance.source). */
  provider: string | null
  /** County-source provenance for the served streams. */
  provenance: HydrographyProvenance
  /** True when the engine flagged degraded coverage. */
  degraded: boolean
  /** Present on honest-empty / honest-unavailable — the real reason. */
  honestEmptyReason: string | null
  /** Feature count of the served FC. */
  featureCount: number
  /** Slot status. `unavailable` = the engine has no hydrography slot for this
   *  request (not-yet-deployed OR the county has no configured source). */
  status: 'ok' | 'pending' | 'no-coverage' | 'empty' | 'unavailable'
  /** Present when status !== 'ok' — the honest reason. */
  detail?: string
}

/** The engine seals slot geometry under `envelope.payload`; accept a legacy
 *  `data` key too so a fixture or older wire shape still maps. */
function envelopeBody(
  envelope: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!envelope) return undefined
  return (envelope.payload ?? envelope.data ?? envelope) as
    | Record<string, unknown>
    | undefined
}

/** The honest FEATURE-DETECT response: the engine build serving this request
 *  does not know the `hydrography` layer yet (or returned no slot for it). */
export function hydrographyUnavailableResponse(
  detail?: string,
): HydrographyLayerResponse {
  const reason = detail || HYDROGRAPHY_NOT_YET_AVAILABLE
  return {
    geojson: { type: 'FeatureCollection', features: [] },
    provider: null,
    provenance: { source: null, layerName: null, vintage: null, kind: null },
    degraded: false,
    honestEmptyReason: reason,
    featureCount: 0,
    status: 'unavailable',
    detail: reason,
  }
}

/**
 * Map the engine `/v1/map-layers/assemble` payload onto the browse-map
 * hydrography response. Reads the ONE `hydrography` slot.
 *   - ok slot with streams -> ok + provenance;
 *   - ok slot with zero streams -> HONEST-EMPTY (ok + reason, NOT an error);
 *   - no-coverage slot -> honest-unavailable for the county (reason passed
 *     through — "county has no configured hydrography source");
 *   - NO hydrography slot at all -> `unavailable` (feature-detect: the engine
 *     leg is not deployed yet), NEVER an error.
 */
export function mapHydrographyPayload(payload: unknown): HydrographyLayerResponse {
  const p = payload as Record<string, unknown> | null
  const outer = (p?.payload ?? p?.data ?? p) as Record<string, unknown> | null
  const layers = outer?.layers as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(layers)) return hydrographyUnavailableResponse()
  const slot = layers.find((l) => l?.layerKey === 'hydrography')
  if (!slot) return hydrographyUnavailableResponse()

  const status = String(slot.status ?? 'empty')
  if (status !== 'ok') {
    const reason =
      (typeof slot.honestEmptyReason === 'string' && slot.honestEmptyReason) ||
      (typeof slot.pendingReason === 'string' && slot.pendingReason) ||
      (typeof (slot.error as Record<string, unknown>)?.message === 'string'
        ? String((slot.error as Record<string, unknown>).message)
        : 'hydrography slot not ok')
    return {
      ...hydrographyUnavailableResponse(reason),
      status:
        status === 'pending'
          ? 'pending'
          : status === 'no-coverage'
            ? 'no-coverage'
            : status === 'unavailable'
              ? 'unavailable'
              : 'empty',
    }
  }

  const envelope = slot.envelope as Record<string, unknown> | undefined
  const geomBody = envelopeBody(envelope)
  const geojson = normalizeFc(geomBody?.geojson)

  const provRaw = geomBody?.provenance as Record<string, unknown> | undefined
  const provenance: HydrographyProvenance = {
    source: typeof provRaw?.source === 'string' ? provRaw.source : null,
    layerName: typeof provRaw?.layerName === 'string' ? provRaw.layerName : null,
    vintage: typeof provRaw?.vintage === 'string' ? provRaw.vintage : null,
    kind: typeof provRaw?.kind === 'string' ? provRaw.kind : null,
  }

  const honestEmptyReason =
    (typeof geomBody?.honestEmptyReason === 'string' && geomBody.honestEmptyReason) ||
    null
  const provider =
    (typeof geomBody?.provider === 'string' && geomBody.provider) ||
    provenance.source

  const coverage = envelope?.coverage as Record<string, unknown> | undefined
  const degraded = coverage?.degraded === true

  const featureCount = geojson.features.length
  return {
    geojson,
    provider,
    provenance,
    degraded,
    // Honest-empty: an ok slot with zero streams carries the real reason so the
    // client shows the honest-empty state, not a blank layer.
    honestEmptyReason:
      featureCount === 0
        ? honestEmptyReason ?? 'no mapped streams in this view'
        : honestEmptyReason,
    featureCount,
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

/**
 * FEATURE-DETECT classifier for a failed upstream assemble call: a 404 (route
 * or layer unknown) or a 4xx explicitly rejecting the `hydrography` layer key
 * means the engine leg is NOT DEPLOYED yet — an honest "not yet available"
 * state, never an error. Anything else stays a real upstream failure.
 */
export function isHydrographyUnknownToEngine(
  status: number,
  bodyText: string,
): boolean {
  if (status === 404) return true
  if (status >= 400 && status < 500) {
    const t = (bodyText || '').toLowerCase()
    return (
      t.includes('hydrography') &&
      (t.includes('unknown') ||
        t.includes('unsupported') ||
        t.includes('invalid') ||
        t.includes('not a valid') ||
        t.includes('unrecognized'))
    )
  }
  return false
}
