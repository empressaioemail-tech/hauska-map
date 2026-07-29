/**
 * Live contour + hydrography overlay + toggle-binding + per-tier label tests.
 *
 * Locks the toggle wiring: the LAYERS-panel `topography-contours` and
 * `hydrography` checkboxes control the REAL overlays' `visible` flags, an
 * empty/failed/unavailable fetch draws nothing (never a synthetic line), the
 * contour chip label FOLLOWS the served tier (1-ft in Bastrop, 3DEP elsewhere),
 * hydrography honest-empty surfaces the served reason, and the derived D8 flow
 * layer is RETIRED from the customer surface (registry row swap + no PE
 * consumer).
 */

import { describe, expect, it } from 'vitest'
import * as liveGis from './liveGis'
import {
  LIVE_TOPO_KEY,
  LIVE_HYDROGRAPHY_KEY,
  toTopoOverlay,
  toHydrographyOverlay,
  contourTierLabel,
  contourLinesOnly,
  isHydrographyHonestEmpty,
  hydrographyHonestReason,
  hydrographyProvenanceLabel,
  type TopoLayerState,
  type HydrographyLayerState,
  type FeatureCollectionLike,
  type GeoJsonFeature,
} from './liveGis'
import { CONSUMER_EXCLUDED_LAYERS, filterConsumerLayers } from './consumer-layers'
// The shared registry source (same module MapToolset reads labels from).
import {
  LAYER_REGISTRY,
  DEFAULT_VISIBLE_LAYERS,
} from '../../../../packages/map-renderer/src/layer-registry.js'

const topoState = (tier: 'authoritative-1ft' | '3dep-fallback', features: unknown[]): TopoLayerState => ({
  status: 'ok',
  response: {
    geojson: { type: 'FeatureCollection', features },
    provider: 'engine',
    tier,
    intervalLabel: tier === 'authoritative-1ft' ? '1-ft interval (Bastrop LiDAR)' : '1 m (3DEP-derived)',
    source: tier === 'authoritative-1ft' ? 'Bastrop County GIS' : 'usgs:3dep-dem',
    vintage: tier === 'authoritative-1ft' ? '2017 StratMap LiDAR' : 'USGS 3DEP',
    fallbackReason: tier === '3dep-fallback' ? 'bbox outside Bastrop County 1-ft footprint' : null,
    degraded: false,
    featureCount: features.length,
    status: 'ok',
  },
})

const oneLine = [
  { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { contour: 152 } },
]

describe('toTopoOverlay toggle binding', () => {
  it('emits a live contour overlay bound to the toggle', () => {
    const on = toTopoOverlay(topoState('authoritative-1ft', oneLine), true)
    expect(on).toHaveLength(1)
    expect(on[0].layerKey).toBe(LIVE_TOPO_KEY)
    expect(on[0].visible).toBe(true)
    const off = toTopoOverlay(topoState('authoritative-1ft', oneLine), false)
    expect(off[0].visible).toBe(false)
  })

  it('draws NOTHING for empty / loading / errored / no-coverage (no synthetic contours)', () => {
    expect(toTopoOverlay(topoState('3dep-fallback', []), true)).toHaveLength(0)
    expect(toTopoOverlay({ status: 'loading' }, true)).toHaveLength(0)
    expect(toTopoOverlay({ status: 'error', message: 'x' }, true)).toHaveLength(0)
    expect(toTopoOverlay({ status: 'no-coverage' }, true)).toHaveLength(0)
    expect(toTopoOverlay({ status: 'idle' }, true)).toHaveLength(0)
  })
})

// --- Contour line-only normalisation (the zoom-out blue-wash fix) -----------
//
// The coarse 3DEP tier is d3-contour-derived: each elevation threshold arrives
// as a FILLED-contour MultiPolygon band covering the DEM extent. Rendered raw,
// the overlay renderer's polygon family paints every band with its default
// translucent BLUE fill (the contour paint spec only carries line-*), washing
// the whole viewport blue at wide zoom. Contours must render as LINES at every
// zoom: polygon rings are converted to MultiLineString, never filled.

const ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
const ring2 = [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]

const multiPolygonBand: GeoJsonFeature = {
  type: 'Feature',
  geometry: { type: 'MultiPolygon', coordinates: [[ring], [ring2]] },
  properties: { elevationMeters: 150 },
}
const polygonBand: GeoJsonFeature = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [ring] },
  properties: { elevationMeters: 151 },
}

function geometryTypes(fc: FeatureCollectionLike): string[] {
  return fc.features.map((f) => (f.geometry as { type: string }).type)
}

describe('contourLinesOnly — filled-contour polygons become contour LINES', () => {
  it('converts Polygon / MultiPolygon elevation bands to MultiLineString rings', () => {
    const fc = contourLinesOnly({
      type: 'FeatureCollection',
      features: [multiPolygonBand, polygonBand],
    })
    expect(geometryTypes(fc)).toEqual(['MultiLineString', 'MultiLineString'])
    // Rings preserved as lines: the MultiPolygon's two rings flatten into one
    // MultiLineString; the Polygon's single ring carries over unchanged.
    expect((fc.features[0].geometry as { coordinates: unknown }).coordinates).toEqual([ring, ring2])
    expect((fc.features[1].geometry as { coordinates: unknown }).coordinates).toEqual([ring])
    // Elevation properties survive the conversion.
    expect(fc.features[0].properties).toEqual({ elevationMeters: 150 })
  })

  it('passes (Multi)LineString features through untouched and drops points', () => {
    const line = oneLine[0] as GeoJsonFeature
    const point: GeoJsonFeature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: null,
    }
    const fc = contourLinesOnly({ type: 'FeatureCollection', features: [line, point] })
    expect(fc.features).toEqual([line])
  })
})

describe('toTopoOverlay — no polygon family ever reaches the map (blue-wash fence)', () => {
  it('emits line-only geometry for a 3DEP filled-contour (MultiPolygon) response', () => {
    const overlays = toTopoOverlay(topoState('3dep-fallback', [multiPolygonBand, polygonBand]), true)
    expect(overlays).toHaveLength(1)
    const types = geometryTypes(overlays[0].geojson as FeatureCollectionLike)
    expect(types.every((t) => t === 'LineString' || t === 'MultiLineString')).toBe(true)
    // Line paint only — no fill-* keys that could re-introduce a wash.
    expect(Object.keys(overlays[0].paint ?? {}).every((k) => k.startsWith('line-'))).toBe(true)
  })

  it('draws nothing when normalisation leaves no line features (never a bare fill)', () => {
    const pointOnly: GeoJsonFeature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: null,
    }
    expect(toTopoOverlay(topoState('3dep-fallback', [pointOnly]), true)).toHaveLength(0)
  })
})

/** Pull the ok-state response for label assertions. */
function respOf(s: TopoLayerState) {
  return s.status === 'ok' ? s.response : undefined
}

describe('contourTierLabel — label follows the served tier (never static)', () => {
  it('labels a Bastrop viewport as 1-ft LiDAR naming the source', () => {
    const label = contourTierLabel(respOf(topoState('authoritative-1ft', oneLine)))
    expect(label).toMatch(/1\s*ft/i)
    expect(label).toMatch(/LiDAR/i)
    expect(label).toMatch(/Bastrop/i)
  })

  it('labels a non-Bastrop viewport as 3DEP with the fallback reason, NEVER 1-ft', () => {
    const label = contourTierLabel(respOf(topoState('3dep-fallback', oneLine)))
    expect(label).toMatch(/3DEP/i)
    expect(label).not.toMatch(/1\s*ft|LiDAR/i)
    expect(label).toMatch(/outside Bastrop/i)
  })
})

// --- Hydrography overlay (real county-mapped streams) ----------------------

const hydrographyState = (
  features: unknown[],
  opts: { honestEmptyReason?: string; degraded?: boolean; vintage?: string | null } = {},
): HydrographyLayerState => ({
  status: 'ok',
  response: {
    geojson: { type: 'FeatureCollection', features },
    provider: 'Bastrop County GIS',
    provenance: {
      source: 'Bastrop County GIS',
      layerName: 'Streams',
      vintage: opts.vintage === undefined ? '2023' : opts.vintage,
      kind: 'county-mapped-hydrography',
    },
    degraded: opts.degraded === true,
    honestEmptyReason: opts.honestEmptyReason ?? null,
    featureCount: features.length,
    status: 'ok',
  },
})

const oneStream = [
  { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { name: 'Piney Creek' } },
]

describe('toHydrographyOverlay toggle binding', () => {
  it('emits a live stream overlay bound to the toggle', () => {
    const on = toHydrographyOverlay(hydrographyState(oneStream), true)
    expect(on).toHaveLength(1)
    expect(on[0].layerKey).toBe(LIVE_HYDROGRAPHY_KEY)
    expect(on[0].visible).toBe(true)
    expect(toHydrographyOverlay(hydrographyState(oneStream), false)[0].visible).toBe(false)
  })

  it('paints a subtle line-only water style (no fill family)', () => {
    const [spec] = toHydrographyOverlay(hydrographyState(oneStream), true)
    const paintKeys = Object.keys(spec.paint ?? {})
    expect(paintKeys.length).toBeGreaterThan(0)
    expect(paintKeys.every((k) => k.startsWith('line-'))).toBe(true)
  })

  it('draws NOTHING on honest-empty / unavailable / failed states — never a squiggle', () => {
    expect(
      toHydrographyOverlay(hydrographyState([], { honestEmptyReason: 'no mapped streams in this bbox' }), true),
    ).toHaveLength(0)
    expect(toHydrographyOverlay({ status: 'loading' }, true)).toHaveLength(0)
    expect(toHydrographyOverlay({ status: 'error', message: 'x' }, true)).toHaveLength(0)
    expect(toHydrographyOverlay({ status: 'no-coverage' }, true)).toHaveLength(0)
    // FEATURE-DETECT: engine slot not deployed yet — nothing drawn, no error.
    expect(
      toHydrographyOverlay({ status: 'unavailable', detail: 'Hydrography not yet available' }, true),
    ).toHaveLength(0)
  })
})

describe('hydrography honest-empty + provenance helpers', () => {
  it('detects honest-empty and surfaces the served reason', () => {
    const empty = hydrographyState([], { honestEmptyReason: 'no mapped streams in this bbox' })
    expect(isHydrographyHonestEmpty(empty)).toBe(true)
    expect(hydrographyHonestReason(empty)).toContain('no mapped streams')
  })

  it('is NOT honest-empty when streams exist', () => {
    const live = hydrographyState(oneStream)
    expect(isHydrographyHonestEmpty(live)).toBe(false)
    expect(hydrographyHonestReason(live)).toBeNull()
  })

  it('falls back to a generic honest reason if the slot gave none', () => {
    const empty = hydrographyState([])
    expect(isHydrographyHonestEmpty(empty)).toBe(true)
    expect(hydrographyHonestReason(empty)).toBeTruthy()
  })

  it('provenance label names the county source + vintage, never fabricates', () => {
    const live = hydrographyState(oneStream)
    const resp = live.status === 'ok' ? live.response : undefined
    expect(hydrographyProvenanceLabel(resp)).toBe('Hydrography — Bastrop County GIS, 2023')
    const noVintage = hydrographyState(oneStream, { vintage: null })
    const nvResp = noVintage.status === 'ok' ? noVintage.response : undefined
    expect(hydrographyProvenanceLabel(nvResp)).toBe('Hydrography — Bastrop County GIS')
    expect(hydrographyProvenanceLabel(undefined)).toBe('Hydrography')
  })
})

// --- The D8 retirement + registry row swap ----------------------------------
//
// The map layer customers see is "Hydrography" (real county-mapped streams);
// the derived D8 flow squiggle is no longer a customer layer. The registry
// carries the new row; PE's consumer filter drops the D8 key from the panel;
// and PE's liveGis surface no longer exports the D8 layer helpers.

describe('Hydrography replaces the D8 customer layer', () => {
  it('registry carries a live "Hydrography" row in the hydrology group', () => {
    const row = (LAYER_REGISTRY as Array<{ key: string; label: string; group: string; live: boolean }>).find(
      (l) => l.key === 'hydrography',
    )
    expect(row).toBeTruthy()
    expect(row?.label).toBe('Hydrography')
    expect(row?.group).toBe('hydrology')
    expect(row?.live).toBe(true)
  })

  it('PE consumer filter drops the D8 row (and keeps Hydrography eligible)', () => {
    expect(CONSUMER_EXCLUDED_LAYERS.has('hydrology-flow')).toBe(true)
    const seed = new Set([...DEFAULT_VISIBLE_LAYERS, 'hydrography'] as string[])
    const filtered = filterConsumerLayers(seed as Set<string>)
    expect(filtered.has('hydrology-flow')).toBe(false)
    expect(filtered.has('hydrography')).toBe(true)
  })

  it('PE liveGis no longer exposes the D8 layer helpers (no customer consumer)', () => {
    const surface = liveGis as Record<string, unknown>
    expect(surface.toHydroOverlay).toBeUndefined()
    expect(surface.fetchHydrologyLayer).toBeUndefined()
    expect(surface.LIVE_HYDRO_KEY).toBeUndefined()
  })
})
