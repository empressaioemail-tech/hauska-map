// apps/property-explorer/api/_lib/pe-hydrology-core.ts
//
// Pure helpers for the Property Explorer hydrology (D8 flow) BFF. Kept
// framework-free so request validation, gate-header construction, and the
// engine-envelope -> map-layer response mapping are unit-testable without a
// serverless runtime. Mirrors pe-topography-core exactly.
//
// The hydrology-flow LAYER is a FREE browse layer, so this BFF does NOT gate on
// a paid PE session. It fetches the engine map-layers `hydrology-flow` slot for
// the current viewport and returns the LIVE D8 flow-channel GeoJSON.
//
// HONESTY — LIVE ONLY WHERE IT GENUINELY COMPUTES:
//   The `hydrology-flow` slot runs a real D8 flow-accumulation over the viewport
//   3DEP DEM and emits the flow CHANNELS above the accumulation threshold. On
//   flat terrain, a DEM void, or a worker failure it returns HONEST-EMPTY: an
//   empty FeatureCollection plus a real `honestEmptyReason`. This BFF surfaces
//   that reason verbatim and NEVER substitutes a synthetic meander.

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
export type HydroBbox = TopoBbox
export type HydroRequest = TopoRequest

/** Same viewport-body contract as the topography BFF (bbox + optional center). */
export function parseHydrologyRequest(
  body: unknown,
): { ok: true; request: HydroRequest } | { ok: false; message: string } {
  return parseViewportRequest(body)
}

/**
 * Build the map-layers assemble request body for a viewport, requesting ONLY the
 * hydrology-flow slot. Jurisdiction keys are left null — D8 flow is derived from
 * the national 3DEP DEM and does not need a jurisdiction key.
 */
export function buildHydrologyAssembleBody(req: HydroRequest): Record<string, unknown> {
  return {
    parcel: {
      latitude: req.centerLat,
      longitude: req.centerLng,
      parcelKey: 'pe-browse-viewport',
    },
    jurisdiction: { stateKey: null, localKey: null },
    layers: ['hydrology-flow'],
    bbox: req.bbox,
  }
}

/**
 * Gate-front headers engine-api requires on every non-health call. Product
 * `cortex`, package `map-layers`, access tier `public-free` (hydrology flow is a
 * free browse layer, peer to contours). Mirrors buildTopographyGateHeaders.
 */
export function buildHydrologyGateHeaders(opts?: {
  requestId?: string
  credentialId?: string
  tenantId?: string
}): Record<string, string> {
  const requestId =
    opts?.requestId?.trim() ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `pe-hydro-${Date.now()}`)
  return {
    'x-hauska-product': 'cortex',
    'x-hauska-tenant-id': opts?.tenantId?.trim() || 'public-catalog',
    'x-hauska-package-id': 'map-layers',
    'x-hauska-access-tier': 'public-free',
    'x-hauska-gate-credential-id':
      opts?.credentialId?.trim() || 'property-explorer-hydrology-bff',
    'x-hauska-request-id': requestId,
  }
}

export interface HydroLayerResponse {
  /** Flow-channel FeatureCollection (empty on honest-empty). */
  geojson: { type: 'FeatureCollection'; features: unknown[] }
  /** Honest provider label from the engine slot. */
  provider: string | null
  /** Number of flow channels above the accumulation threshold. */
  channelCount: number
  /** The accumulation threshold used (cells), when present. */
  accumulationThreshold: number | null
  /** D8 routing / library provenance, when present. */
  routing: string | null
  library: string | null
  /** True when the engine flagged degraded coverage (empty channels, fallback). */
  degraded: boolean
  /** Present on honest-empty (flat terrain / no channels / DEM void). */
  honestEmptyReason: string | null
  /** Feature count (== channelCount for the served FC). */
  featureCount: number
  /** Slot status from the engine (ok | pending | no-coverage | empty). */
  status: 'ok' | 'pending' | 'no-coverage' | 'empty'
  /** Present when status !== 'ok' — the honest reason. */
  detail?: string
}

/** The engine seals slot geometry under `envelope.payload`; accept a legacy
 *  `data` key too so a fixture or older wire shape still maps. */
function envelopeBody(envelope: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!envelope) return undefined
  return (envelope.payload ?? envelope.data ?? envelope) as Record<string, unknown> | undefined
}

/**
 * Map the engine `/v1/map-layers/assemble` payload onto the browse-map hydrology
 * response. Reads the ONE `hydrology-flow` slot. An ok slot with zero channels
 * is HONEST-EMPTY (empty FC + reason), NOT an error and NOT a fixture. Any
 * non-ok slot returns an honest status the client can surface.
 */
export function mapHydrologyPayload(payload: unknown): HydroLayerResponse {
  const empty: HydroLayerResponse = {
    geojson: { type: 'FeatureCollection', features: [] },
    provider: null,
    channelCount: 0,
    accumulationThreshold: null,
    routing: null,
    library: null,
    degraded: true,
    honestEmptyReason: 'engine returned no hydrology-flow slot',
    featureCount: 0,
    status: 'empty',
    detail: 'engine returned no hydrology-flow slot',
  }
  const p = payload as Record<string, unknown> | null
  const outer = (p?.payload ?? p?.data ?? p) as Record<string, unknown> | null
  const layers = outer?.layers as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(layers)) return empty
  const slot = layers.find((l) => l?.layerKey === 'hydrology-flow')
  if (!slot) return empty

  const status = String(slot.status ?? 'empty')
  if (status !== 'ok') {
    const reason =
      (typeof slot.pendingReason === 'string' && slot.pendingReason) ||
      (typeof (slot.error as Record<string, unknown>)?.message === 'string'
        ? String((slot.error as Record<string, unknown>).message)
        : 'hydrology-flow slot not ok')
    return {
      ...empty,
      status: status === 'pending' ? 'pending' : status === 'no-coverage' ? 'no-coverage' : 'empty',
      honestEmptyReason: reason,
      detail: reason,
    }
  }

  const envelope = slot.envelope as Record<string, unknown> | undefined
  const geomBody = envelopeBody(envelope)
  const geojson = normalizeFc(geomBody?.geojson)
  const attrs = geomBody?.attributes as Record<string, unknown> | undefined

  const channelCount =
    typeof attrs?.channelCount === 'number' ? attrs.channelCount : geojson.features.length
  const accumulationThreshold =
    typeof attrs?.accumulationThreshold === 'number' ? attrs.accumulationThreshold : null
  const routing = typeof attrs?.routing === 'string' ? attrs.routing : null
  const library = typeof attrs?.library === 'string' ? attrs.library : null
  const honestEmptyReason =
    typeof attrs?.honestEmptyReason === 'string' && attrs.honestEmptyReason
      ? attrs.honestEmptyReason
      : null
  const provider = typeof geomBody?.provider === 'string' ? geomBody.provider : null

  const coverage = envelope?.coverage as Record<string, unknown> | undefined
  const degraded = coverage?.degraded === true

  return {
    geojson,
    provider,
    channelCount,
    accumulationThreshold,
    routing,
    library,
    degraded,
    // Honest-empty: an ok slot with zero channels carries the real reason so the
    // client shows the honest-empty state, not a blank layer or a fake meander.
    honestEmptyReason:
      channelCount === 0
        ? honestEmptyReason ?? 'no flow channels above accumulation threshold in this bbox'
        : honestEmptyReason,
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
