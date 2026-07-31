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
import {
  CONTEXT_FEMA,
  CONTEXT_PARCEL_LINE,
  ROLE_BUDGET,
  contextFillOpacity,
} from './map/layer-role-taxonomy.js'

export type LiveLayerKey = 'parcels' | 'fema'

/** Overlay layerKeys the live loader owns on the map. */
export const LIVE_PARCELS_KEY = 'live-parcels'
export const LIVE_FEMA_KEY = 'live-fema'
/** Live contour overlay key (topography). Distinct from the FIXTURE
 *  `topography-contours` layer — this one is drawn from real engine data. */
export const LIVE_TOPO_KEY = 'live-topography'
/** Live D8 hydrology flow-channel overlay key. Distinct from the FIXTURE
 *  `hydrology-flow` registry key — this one is drawn from real engine D8 data.
 *  INTERNAL/DEBUG only since the hydrography swap: no customer surface renders
 *  it (PE ships `hydrography` instead); CC may keep it for D8 debug views. */
export const LIVE_HYDRO_KEY = 'live-hydrology-flow'
/** Live county-mapped HYDROGRAPHY overlay key (real streams, engine
 *  `hydrography` slot) — the customer water layer that replaced the D8 flow
 *  squiggle on browse surfaces. */
export const LIVE_HYDROGRAPHY_KEY = 'live-hydrography'

/** Parcels are bbox-capped (~200 features upstream); below this zoom we show
 *  a "zoom in" hint instead of hammering the API with huge viewports. */
export const MIN_PARCEL_ZOOM = 14
/** FEMA flood polygons are coarser; fetchable a bit wider out. */
export const MIN_FEMA_ZOOM = 11
/** Contours derive from a per-viewport DEM fetch; keep them at parcel altitude
 *  so the DEM extent stays small and the contour lines stay legible. */
export const MIN_TOPO_ZOOM = 14
/** D8 hydrology runs a per-viewport DEM fetch + flow accumulation; keep it at
 *  parcel altitude so the compute grid stays bounded and channels stay legible. */
export const MIN_HYDRO_ZOOM = 14
/** County-mapped hydrography is real (coarse-fetchable) vector data like FEMA
 *  polygons — fetchable wider out than the DEM-derived layers. */
export const MIN_HYDROGRAPHY_ZOOM = 11

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
// which proxies the engine map-layers `topography-1ft` slot. HONEST — TIER
// FOLLOWS THE SERVED RESPONSE: inside the Bastrop footprint the slot serves the
// AUTHORITATIVE 1-ft LiDAR contours (`tier === 'authoritative-1ft'`); everywhere
// else / on degrade it serves an HONEST 3DEP-derived fallback
// (`tier === '3dep-fallback'`, with a `fallbackReason`). The response carries the
// TRUE per-viewport tier + source/vintage so the map labels 1-ft in Bastrop and
// 3DEP elsewhere and never over-claims fidelity.

/** The honest served-contour tier, from the engine `contourSource.tier`. */
export type ContourTier = 'authoritative-1ft' | '3dep-fallback'

export interface TopoLayerResponse {
  geojson?: FeatureCollectionLike
  provider?: string
  /** TRUE served tier for this viewport (1-ft in Bastrop, 3DEP elsewhere). */
  tier?: ContourTier | string
  intervalLabel?: string
  /** Served source string (e.g. Bastrop County GIS / usgs:3dep-dem). */
  source?: string | null
  /** Served vintage of the contour tier, when present. */
  vintage?: string | null
  /** When tier is 3dep-fallback, WHY the authoritative tier was not served. */
  fallbackReason?: string | null
  degraded?: boolean
  featureCount?: number
  status?: string
  detail?: string
}

/**
 * The HONEST chip label for the served contour tier — the single source of the
 * per-viewport truth the map surfaces. 1-ft ONLY when the served tier is
 * authoritative-1ft (names the Bastrop LiDAR source); a clearly-3DEP label
 * otherwise (names the fallback reason). NEVER a static claim: a Bastrop
 * viewport reads "1 ft", a non-Bastrop viewport reads "3DEP".
 */
export function contourTierLabel(resp: TopoLayerResponse | undefined): string {
  if (!resp) return 'Contours'
  if (resp.tier === 'authoritative-1ft') {
    const src = resp.source || resp.provider || 'Bastrop County LiDAR'
    // e.g. "Contours — 1 ft LiDAR (Bastrop County GIS, 2017 StratMap)"
    const vint = resp.vintage ? `, ${resp.vintage}` : ''
    return `Contours — 1 ft LiDAR (${src}${vint})`
  }
  // 3DEP fallback — honest, names the interval and (when present) why not 1-ft.
  const interval = resp.intervalLabel || '3DEP-derived'
  const why = resp.fallbackReason ? ` · ${resp.fallbackReason}` : ''
  return `Contours (3DEP) — ${interval}${why}`
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
 * Normalise a served contour FeatureCollection to LINE geometry only.
 *
 * WHY (the zoom-out blue-wash defect): the coarse `3dep-fallback` tier is
 * derived with d3-contour, which emits FILLED-contour MultiPolygon features —
 * each elevation threshold is a polygon band covering the whole DEM extent at
 * or above that elevation. The overlay renderer paints every polygon family
 * with a fill layer, and since the contour paint spec carries only `line-*`
 * keys the fill falls back to the renderer default (translucent blue) —
 * dozens of stacked elevation-band fills wash the entire viewport blue. The
 * authoritative 1-ft tier serves LineStrings, so the wash appeared only on
 * the coarse tier (zoomed out past the 1-ft threshold).
 *
 * Contours are LINES by definition, so: keep (Multi)LineString features as-is
 * and convert Polygon/MultiPolygon features to MultiLineString of their rings
 * (the ring boundaries ARE the contour lines — no geometry is lost, only the
 * fill family). Anything else (points, null geometry) is dropped.
 */
export function contourLinesOnly(fc: FeatureCollectionLike): FeatureCollectionLike {
  const features: GeoJsonFeature[] = []
  for (const f of fc.features ?? []) {
    const geom = f?.geometry as { type?: string; coordinates?: unknown } | null
    const t = geom?.type
    if (t === 'LineString' || t === 'MultiLineString') {
      features.push(f)
      continue
    }
    if (t === 'Polygon' && Array.isArray(geom?.coordinates)) {
      features.push({
        ...f,
        geometry: { type: 'MultiLineString', coordinates: geom.coordinates },
      })
      continue
    }
    if (t === 'MultiPolygon' && Array.isArray(geom?.coordinates)) {
      const rings = (geom.coordinates as unknown[][]).flatMap((poly) =>
        Array.isArray(poly) ? poly : [],
      )
      features.push({
        ...f,
        geometry: { type: 'MultiLineString', coordinates: rings },
      })
    }
    // Points / null geometry: dropped — never a contour.
  }
  return { type: 'FeatureCollection', features }
}

/**
 * Compose the live contour OverlaySpec (or none). `visible` binds the overlay to
 * the LAYERS-panel toggle for the FIXTURE registry key `topography-contours`, so
 * unchecking that row hides the real contour overlay (the toggle now controls a
 * real layer). Empty feature collections draw nothing but keep the state honest.
 *
 * The served FC is normalised to LINES ONLY (contourLinesOnly) so the coarse
 * 3DEP filled-contour MultiPolygons render as contour lines over the basemap at
 * every zoom — never as the renderer's default polygon fill (the full-viewport
 * blue-wash defect).
 */
export function toTopoOverlay(
  topo: TopoLayerState,
  visible: boolean,
): OverlaySpec[] {
  if (topo.status !== 'ok' || !topo.response.geojson) return []
  const fc = contourLinesOnly(topo.response.geojson)
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

// --- Live hydrology (D8 flow) ---------------------------------------------
//
// Flow channels are fetched from the PE hydrology BFF (POST /api/pe-hydrology),
// which proxies the engine map-layers `hydrology-flow` slot (LIVE D8 flow
// accumulation over the viewport 3DEP DEM). HONEST: an ok slot with zero
// channels is honest-empty (empty FeatureCollection + a real reason like "no
// flow channels above accumulation threshold in this bbox") — the map shows the
// honest-empty state, NEVER a synthetic meander.

export interface HydroLayerResponse {
  geojson?: FeatureCollectionLike
  provider?: string
  channelCount?: number
  accumulationThreshold?: number | null
  routing?: string | null
  library?: string | null
  degraded?: boolean
  /** Present on honest-empty (flat terrain / no channels / DEM void). */
  honestEmptyReason?: string | null
  featureCount?: number
  status?: string
  detail?: string
}

export type HydroLayerState =
  | { status: 'idle' }
  | { status: 'zoom-gated' }
  | { status: 'loading' }
  | { status: 'ok'; response: HydroLayerResponse }
  | { status: 'no-coverage'; detail?: string }
  | { status: 'error'; message: string }

/**
 * POST the viewport bbox+center to the hydrology BFF. Maps HTTP + envelope
 * outcomes onto honest tile states — NEVER a silent fixture fallback. A 503
 * (engine key missing on a preview deploy) surfaces as a named error the chip
 * layer can render as DEGRADED. An ok honest-empty response is `status:'ok'`
 * with zero features and a `honestEmptyReason` the chip surfaces.
 */
export async function fetchHydrologyLayer(
  bboxUrl: string,
  bbox: GisBBox,
  center: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<HydroLayerState> {
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
    return { status: 'error', message: `hydrology: ${(err as Error)?.message || 'network error'}` }
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
    return { status: 'error', message: `hydrology: ${detail}` }
  }
  const response = rec as unknown as HydroLayerResponse
  // A non-ok engine slot status (pending/no-coverage) surfaces honestly. NOTE:
  // an ok slot with zero channels is NOT an error — it is honest-empty and
  // stays status:'ok' so the chip shows the reason, not a failure.
  if (response.status && response.status !== 'ok') {
    if (response.status === 'no-coverage') {
      return { status: 'no-coverage', detail: response.detail }
    }
    return { status: 'error', message: `hydrology: ${response.detail || response.status}` }
  }
  return { status: 'ok', response }
}

/** True when the served hydrology slot is ok but has NO flow channels — the
 *  honest-empty case (flat terrain / no channels above threshold / DEM void). */
export function isHydrologyHonestEmpty(state: HydroLayerState): boolean {
  return (
    state.status === 'ok' &&
    (state.response.channelCount ?? state.response.geojson?.features?.length ?? 0) === 0
  )
}

/** The honest reason text for an empty/degraded hydrology response, or null. */
export function hydrologyHonestReason(state: HydroLayerState): string | null {
  if (state.status !== 'ok') return null
  const r = state.response
  if ((r.channelCount ?? r.geojson?.features?.length ?? 0) > 0) return null
  return r.honestEmptyReason || 'no flow channels in this view'
}

/**
 * Compose the live D8 flow-channel OverlaySpec (or none). `visible` binds the
 * overlay to the LAYERS-panel `hydrology-flow` toggle. An empty (honest-empty)
 * or non-ok response draws NOTHING — never a synthetic meander. Channels paint
 * as a blue flow line, thicker where accumulation is higher when the property
 * is present.
 */
export function toHydroOverlay(
  hydro: HydroLayerState,
  visible: boolean,
): OverlaySpec[] {
  if (hydro.status !== 'ok' || !hydro.response.geojson) return []
  const fc = hydro.response.geojson
  if (!fc.features || fc.features.length === 0) return []
  return [
    {
      layerKey: LIVE_HYDRO_KEY,
      provider: hydro.response.provider,
      geojson: fc,
      visible,
      paint: {
        'line-color': 'rgba(56,140,220,0.82)',
        'line-width': [
          'interpolate',
          ['linear'],
          ['coalesce', ['to-number', ['get', 'accumulation']], 0],
          0, 0.6,
          5000, 2.4,
        ],
        'line-opacity': 0.9,
      },
    },
  ]
}

// --- Live hydrography (county-mapped streams) ------------------------------
//
// REAL water. Streams are fetched from the PE hydrography BFF
// (POST /api/pe-hydrography), which proxies the engine map-layers `hydrography`
// slot: county-mapped stream geometry from the county's own GIS source, with
// provenance (source, layerName, vintage) attached. This layer REPLACED the
// derived D8 flow squiggle as the customer water layer.
//
// HONESTY: an ok slot with zero streams is honest-empty (reason attached); a
// county with no configured source is honest-unavailable; and an engine build
// that does not serve the slot yet is the FEATURE-DETECT `unavailable` state
// ("Hydrography not yet available") — none of these are errors, and nothing is
// ever drawn from a non-ok state.

export interface HydrographyProvenance {
  source?: string | null
  layerName?: string | null
  vintage?: string | null
  kind?: string | null
}

export interface HydrographyLayerResponse {
  geojson?: FeatureCollectionLike
  provider?: string | null
  provenance?: HydrographyProvenance
  degraded?: boolean
  /** Present on honest-empty / honest-unavailable — the real reason. */
  honestEmptyReason?: string | null
  featureCount?: number
  status?: string
  detail?: string
}

export type HydrographyLayerState =
  | { status: 'idle' }
  | { status: 'zoom-gated' }
  | { status: 'loading' }
  | { status: 'ok'; response: HydrographyLayerResponse }
  | { status: 'no-coverage'; detail?: string }
  /** FEATURE-DETECT: the hydrography slot is not served yet (engine leg
   *  deploys separately) — an honest "not yet available", NEVER an error. */
  | { status: 'unavailable'; detail?: string }
  | { status: 'error'; message: string }

/**
 * POST the viewport bbox+center to the hydrography BFF. Maps HTTP + envelope
 * outcomes onto honest tile states — NEVER a silent fixture fallback:
 *   - HTTP 404 (BFF route absent on an older deploy) → `unavailable`;
 *   - response status "unavailable" (engine slot not deployed / county has no
 *     configured source per the served detail) → `unavailable`;
 *   - response status "no-coverage" → `no-coverage`;
 *   - ok honest-empty stays `ok` with zero features + `honestEmptyReason`.
 */
export async function fetchHydrographyLayer(
  bboxUrl: string,
  bbox: GisBBox,
  center: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<HydrographyLayerState> {
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
    return { status: 'error', message: `hydrography: ${(err as Error)?.message || 'network error'}` }
  }

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON — handled by status below */
  }
  const rec = (body ?? {}) as Record<string, unknown>

  if (res.status === 404) {
    // Feature-detect at the HTTP level too: no BFF route → not yet available.
    return {
      status: 'unavailable',
      detail: typeof rec.message === 'string' ? rec.message : 'Hydrography not yet available',
    }
  }
  if (!res.ok) {
    const detail =
      (typeof rec.message === 'string' && rec.message) ||
      (typeof rec.error === 'string' && rec.error) ||
      `HTTP ${res.status}`
    return { status: 'error', message: `hydrography: ${detail}` }
  }
  const response = rec as unknown as HydrographyLayerResponse
  if (response.status && response.status !== 'ok') {
    if (response.status === 'unavailable') {
      return { status: 'unavailable', detail: response.detail ?? 'Hydrography not yet available' }
    }
    if (response.status === 'no-coverage') {
      return { status: 'no-coverage', detail: response.detail }
    }
    return { status: 'error', message: `hydrography: ${response.detail || response.status}` }
  }
  return { status: 'ok', response }
}

/** True when the served hydrography slot is ok but has NO streams — the
 *  honest-empty case (county source configured, nothing mapped in this bbox). */
export function isHydrographyHonestEmpty(state: HydrographyLayerState): boolean {
  return (
    state.status === 'ok' &&
    (state.response.featureCount ?? state.response.geojson?.features?.length ?? 0) === 0
  )
}

/** The honest reason text for an empty hydrography response, or null. */
export function hydrographyHonestReason(state: HydrographyLayerState): string | null {
  if (state.status !== 'ok') return null
  const r = state.response
  if ((r.featureCount ?? r.geojson?.features?.length ?? 0) > 0) return null
  return r.honestEmptyReason || 'no mapped streams in this view'
}

/**
 * The honest provenance label for served hydrography — names the county source
 * and vintage (e.g. "Hydrography — Bastrop County GIS, 2023"). Falls back to
 * the provider string, then a bare "Hydrography". Never fabricates a source.
 */
export function hydrographyProvenanceLabel(
  resp: HydrographyLayerResponse | undefined,
): string {
  if (!resp) return 'Hydrography'
  const src = resp.provenance?.source || resp.provider
  if (!src) return 'Hydrography'
  const vint = resp.provenance?.vintage ? `, ${resp.provenance.vintage}` : ''
  return `Hydrography — ${src}${vint}`
}

/**
 * Compose the live hydrography OverlaySpec (or none). `visible` binds the
 * overlay to the LAYERS-panel `hydrography` toggle. An empty (honest-empty),
 * unavailable, or non-ok response draws NOTHING. Streams paint as thin, subtle
 * water-blue lines (PE dark theme), slightly wider at parcel zoom so they stay
 * legible without shouting. Stream `name` properties ride the features for
 * future labeling (the overlay contract renders fill/line/circle only — no
 * symbol layer — so name labels are not drawn here).
 */
export function toHydrographyOverlay(
  state: HydrographyLayerState,
  visible: boolean,
): OverlaySpec[] {
  if (state.status !== 'ok' || !state.response.geojson) return []
  const fc = state.response.geojson
  if (!fc.features || fc.features.length === 0) return []
  return [
    {
      layerKey: LIVE_HYDROGRAPHY_KEY,
      provider: state.response.provider ?? undefined,
      geojson: fc,
      visible,
      paint: {
        'line-color': 'rgba(96,165,250,0.72)',
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, 0.7,
          13, 1.1,
          16, 1.8,
        ],
        'line-opacity': 0.85,
        // Soft water feather — line-blur is the SAFE channel (crash-guard).
        'line-blur': 0.4,
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
          'X', CONTEXT_FEMA.fillX,
          CONTEXT_FEMA.fillAe,
        ],
        // CONTEXT role: boundary-dominant, fill capped to taxonomy budget.
        'fill-opacity': contextFillOpacity(ROLE_BUDGET.CONTEXT.fillOpacityMax),
        'line-color': CONTEXT_FEMA.line,
        'line-width': 1.6,
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
        'fill-opacity': 0.08,
        // CONTEXT parcel line — never INTERACTION cyan (Phase 0A T-H02).
        'line-color': CONTEXT_PARCEL_LINE,
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
