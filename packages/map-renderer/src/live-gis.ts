// packages/map-renderer/src/live-gis.ts
//
// ONE shared live-GIS client for Command Center + Property Explorer (WDLL 6 /
// F1b). Pure logic: viewport → fetch policy, map-data/gis-layer client,
// response → OverlaySpec conversion, parcel-selection → info-card mapping.
// Kept free of React/MapLibre so the loader, labeling, and error rules are
// unit-testable. Do not re-fork into apps/* — import from @hauska/map-renderer.
//
// Data plane: POST {cortex proxy}/brokerage/v1/map-data/gis-layer with
// { layer, bbox } (see PROXY_CONTRACT.md — the exact-match POST allowlist from
// PR #21). Response envelope (verified live 2026-07-14):
//   { layer, provider, adapterKey, serviceUrl, featureCount, queryMode,
//     truncated, geojson: FeatureCollection, packageTier,
//     notSurveyGrade?, disclaimer? }
// Parcel feature properties: apn, situsAddress, owner, landUseCode?,
// landUseDescription?, countyFips, countyName, provider, retrievedAt,
// notSurveyGrade. FEMA feature properties: FLD_ZONE, SFHA_TF, …

import type { OverlaySpec, ParcelSelection, GisBBox } from './postMessage'

export type LiveLayerKey = 'parcels' | 'fema'

/** Overlay layerKeys the live loader owns on the map. */
export const LIVE_PARCELS_KEY = 'live-parcels'
export const LIVE_FEMA_KEY = 'live-fema'
/** Live contour overlay key (topography). Distinct from the FIXTURE
 *  `topography-contours` layer — this one is drawn from real engine data. */
export const LIVE_TOPO_KEY = 'live-topography'

/** Parcels are bbox-capped (~200 features upstream); below this zoom we show
 *  a "zoom in" hint instead of hammering the API with huge viewports. */
export const MIN_PARCEL_ZOOM = 14
/** FEMA flood polygons are coarser; fetchable a bit wider out. */
export const MIN_FEMA_ZOOM = 11
/** Contours derive from a per-viewport DEM fetch; keep them at parcel altitude
 *  so the DEM extent stays small and the contour lines stay legible. */
export const MIN_TOPO_ZOOM = 14

export interface GeoJsonFeature {
  type: 'Feature'
  geometry: unknown
  properties: Record<string, unknown> | null
}

export interface FeatureCollectionLike {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

export interface GisLayerResponse {
  layer: string
  provider?: string
  adapterKey?: string
  featureCount?: number
  truncated?: boolean
  notSurveyGrade?: boolean
  disclaimer?: string
  geojson?: FeatureCollectionLike
}

export type LiveLayerState =
  | { status: 'idle' }
  | { status: 'zoom-gated' }
  | { status: 'loading' }
  | { status: 'ok'; response: GisLayerResponse }
  | { status: 'no-coverage'; detail?: string }
  | { status: 'error'; message: string }

/** Which live layers to fetch at this zoom. */
export function layersForZoom(zoom: number): LiveLayerKey[] {
  const layers: LiveLayerKey[] = []
  if (zoom >= MIN_FEMA_ZOOM) layers.push('fema')
  if (zoom >= MIN_PARCEL_ZOOM) layers.push('parcels')
  return layers
}

/**
 * POST one bbox gis-layer query through the cortex proxy.
 * Maps HTTP outcomes onto honest tile states:
 *   200 → ok, 404 → no-coverage, anything else → named error (NEVER a silent
 *   fixture fallback).
 */
export async function fetchGisLayer(
  baseUrl: string,
  layer: LiveLayerKey,
  bbox: GisBBox,
  signal?: AbortSignal,
): Promise<LiveLayerState> {
  let res: Response
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, '')}/brokerage/v1/map-data/gis-layer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layer, bbox }),
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return { status: 'error', message: `${layer}: ${(err as Error)?.message || 'network error'}` }
  }

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON body — handled by status below */
  }
  const rec = (body ?? {}) as Record<string, unknown>

  if (res.status === 404) {
    return {
      status: 'no-coverage',
      detail: typeof rec.message === 'string' ? rec.message : undefined,
    }
  }
  if (!res.ok) {
    const detail =
      (typeof rec.message === 'string' && rec.message) ||
      (typeof rec.error === 'string' && rec.error) ||
      `HTTP ${res.status}`
    return { status: 'error', message: `${layer}: ${detail}` }
  }
  return { status: 'ok', response: rec as unknown as GisLayerResponse }
}

// --- Live topography (contours) -------------------------------------------
//
// Contours are fetched from the PE topography BFF (POST /api/pe-topography),
// which proxies the engine map-layers `topography` slot (3DEP-derived, 1 m
// interval). HONEST: this is NOT the Bastrop 1-ft LiDAR (that tier is
// export-only). The response carries the true provider/interval so the map
// never over-claims fidelity.

export interface TopoLayerResponse {
  geojson?: FeatureCollectionLike
  provider?: string
  tier?: string
  intervalLabel?: string
  degraded?: boolean
  featureCount?: number
  status?: string
  detail?: string
}

export type TopoLayerState =
  | { status: 'idle' }
  | { status: 'zoom-gated' }
  | { status: 'loading' }
  | { status: 'ok'; response: TopoLayerResponse }
  | { status: 'no-coverage'; detail?: string }
  | { status: 'error'; message: string }

/**
 * POST the viewport bbox+center to the topography BFF. Maps HTTP + envelope
 * outcomes onto honest tile states — NEVER a silent fixture fallback. A 503
 * (engine key missing on a preview deploy) surfaces as a named error the chip
 * layer can render as DEGRADED.
 */
export async function fetchTopographyLayer(
  bboxUrl: string,
  bbox: GisBBox,
  center: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<TopoLayerState> {
  let res: Response
  try {
    res = await fetch(bboxUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bbox: {
          westLng: bbox.west,
          southLat: bbox.south,
          eastLng: bbox.east,
          northLat: bbox.north,
        },
        centerLat: center.lat,
        centerLng: center.lng,
      }),
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return { status: 'error', message: `topography: ${(err as Error)?.message || 'network error'}` }
  }

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON — handled by status below */
  }
  const rec = (body ?? {}) as Record<string, unknown>

  if (res.status === 404) {
    return { status: 'no-coverage', detail: typeof rec.message === 'string' ? rec.message : undefined }
  }
  if (!res.ok) {
    const detail =
      (typeof rec.message === 'string' && rec.message) ||
      (typeof rec.error === 'string' && rec.error) ||
      `HTTP ${res.status}`
    return { status: 'error', message: `topography: ${detail}` }
  }
  const response = rec as unknown as TopoLayerResponse
  if (response.status && response.status !== 'ok') {
    if (response.status === 'no-coverage') {
      return { status: 'no-coverage', detail: response.detail }
    }
    return { status: 'error', message: `topography: ${response.detail || response.status}` }
  }
  return { status: 'ok', response }
}

/**
 * Compose the live contour OverlaySpec (or none). `visible` binds the overlay to
 * the LAYERS-panel toggle for the FIXTURE registry key `topography-contours`, so
 * unchecking that row hides the real contour overlay (the toggle now controls a
 * real layer). Empty feature collections draw nothing but keep the state honest.
 */
export function toTopoOverlay(
  topo: TopoLayerState,
  visible: boolean,
): OverlaySpec[] {
  if (topo.status !== 'ok' || !topo.response.geojson) return []
  const fc = topo.response.geojson
  if (!fc.features || fc.features.length === 0) return []
  return [
    {
      layerKey: LIVE_TOPO_KEY,
      provider: topo.response.provider,
      geojson: fc,
      visible,
      paint: {
        'line-color': 'rgba(180,120,60,0.72)',
        'line-width': 0.8,
        'line-opacity': 0.85,
      },
    },
  ]
}

/** Neutral parcel fill when no landUseCode is present in the viewport. */
const NEUTRAL_PARCEL_FILL = '#8aa2b8'

/** Categorical palette for landUseCode classes (cycled). */
const LAND_USE_PALETTE = [
  '#5b8dd6',
  '#5fb88a',
  '#d6a75b',
  '#b57bd6',
  '#d66f6f',
  '#5bc4d6',
  '#c9d65b',
  '#d65ba8',
]

/**
 * Data-driven parcel fill color: categorical by landUseCode where present in
 * the fetched collection, neutral otherwise.
 */
export function parcelFillColor(fc: FeatureCollectionLike | undefined): unknown {
  const codes: string[] = []
  for (const f of fc?.features ?? []) {
    const code = f.properties?.landUseCode
    if (typeof code === 'string' && code && !codes.includes(code)) codes.push(code)
    if (codes.length >= 24) break
  }
  if (!codes.length) return NEUTRAL_PARCEL_FILL
  const expr: unknown[] = ['match', ['to-string', ['get', 'landUseCode']]]
  codes.forEach((code, i) => {
    expr.push(code, LAND_USE_PALETTE[i % LAND_USE_PALETTE.length])
  })
  expr.push(NEUTRAL_PARCEL_FILL)
  return expr
}

/**
 * Compose the live OverlaySpec[] for the renderer. FEMA first so its fill
 * draws BELOW the parcel lines (reconcileOverlays adds layers in array
 * order); parcels are the interactive click/hover surface.
 *
 * `visibility` binds each live overlay to its LAYERS-panel registry toggle
 * (`flood-zone` -> FEMA, `parcel-polygon` -> parcels). Omitted flags default to
 * visible=true (backward-compatible for callers that do not thread the toggle
 * set, e.g. the Command Center LiveMapTile).
 */
export function toLiveOverlays(
  parcels: LiveLayerState,
  fema: LiveLayerState,
  visibility?: { parcels?: boolean; fema?: boolean },
): OverlaySpec[] {
  const specs: OverlaySpec[] = []
  if (fema.status === 'ok' && fema.response.geojson) {
    specs.push({
      layerKey: LIVE_FEMA_KEY,
      provider: fema.response.provider,
      geojson: fema.response.geojson,
      visible: visibility?.fema !== false,
      paint: {
        'fill-color': [
          'match',
          ['get', 'FLD_ZONE'],
          'X', 'rgba(96,165,250,0.18)',
          'rgba(59,130,246,0.6)',
        ],
        'fill-opacity': 0.4,
        'line-color': 'rgba(59,130,246,0.55)',
        'line-width': 0.8,
      },
    })
  }
  if (parcels.status === 'ok' && parcels.response.geojson) {
    specs.push({
      layerKey: LIVE_PARCELS_KEY,
      provider: parcels.response.provider,
      geojson: parcels.response.geojson,
      interactive: true,
      visible: visibility?.parcels !== false,
      paint: {
        'fill-color': parcelFillColor(parcels.response.geojson),
        'fill-opacity': 0.14,
        'line-color': '#7dd3fc',
        'line-width': 1.1,
      },
    })
  }
  return specs
}

/** What the parcel info card renders, extracted from a map click selection. */
export interface ParcelCardData {
  apn: string | null
  situsAddress: string | null
  owner: string | null
  landUseDescription: string | null
  county: string | null
  provider: string | null
  notSurveyGrade: boolean
  retrievedAt: string | null
  lat: number | null
  lng: number | null
}

/**
 * Best-effort baked `parcel_node_id` for a live-GIS selection. The PMTiles
 * browse layer keys feature-state on the stable `parcel_node_id`
 * ("{county_fips}:{normalizeCadPropId(prop_id)}"); a live-GIS overlay click
 * only carries it if the upstream response folds it into feature properties.
 * Returns null when absent — the caller then has no reliable feature-state key
 * for that selection (the PMTiles `onParcelClick` path carries the real id).
 */
export function parcelNodeIdFromSelection(sel: ParcelSelection): string | null {
  const p = (sel.properties ?? {}) as Record<string, unknown>
  const raw = p.parcel_node_id ?? p.parcelNodeId
  if (typeof raw === 'string' && raw.trim()) return raw
  if (typeof raw === 'number') return String(raw)
  return null
}

/** Map a live-parcel ParcelSelection onto the info-card payload. */
export function selectionToCard(sel: ParcelSelection): ParcelCardData {
  const p = (sel.properties ?? {}) as Record<string, unknown>
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v : v != null && typeof v === 'number' ? String(v) : null
  const countyName = str(p.countyName)
  const countyFips = str(p.countyFips)
  return {
    apn: str(p.apn),
    situsAddress: str(p.situsAddress) ?? (sel.address ?? null),
    owner: str(p.owner),
    landUseDescription: str(p.landUseDescription) ?? str(p.landUseCode),
    county: countyName ? (countyFips ? `${countyName} County (${countyFips})` : `${countyName} County`) : countyFips,
    provider: str(p.provider),
    notSurveyGrade: p.notSurveyGrade === true || p.notSurveyGrade === 'true',
    retrievedAt: str(p.retrievedAt),
    lat: typeof sel.lat === 'number' ? sel.lat : null,
    lng: typeof sel.lng === 'number' ? sel.lng : null,
  }
}
