/**
 * Live contour + hydrology overlay + toggle-binding + per-tier label tests —
 * qa/topo-panel-1ft-hydro.
 *
 * Locks the toggle wiring: the LAYERS-panel `topography-contours` and
 * `hydrology-flow` checkboxes control the REAL overlays' `visible` flags, an
 * empty/failed fetch draws nothing (never a synthetic line), the contour chip
 * label FOLLOWS the served tier (1-ft in Bastrop, 3DEP elsewhere), and hydrology
 * honest-empty surfaces the served reason.
 */

import { describe, expect, it } from 'vitest'
import {
  LIVE_TOPO_KEY,
  LIVE_HYDRO_KEY,
  toTopoOverlay,
  toHydroOverlay,
  contourTierLabel,
  contourLinesOnly,
  isHydrologyHonestEmpty,
  hydrologyHonestReason,
  type TopoLayerState,
  type HydroLayerState,
  type FeatureCollectionLike,
  type GeoJsonFeature,
} from './liveGis'

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

// --- Hydrology overlay + honest-empty --------------------------------------

const hydroState = (features: unknown[], attrs: Record<string, unknown> = {}, degraded = false): HydroLayerState => ({
  status: 'ok',
  response: {
    geojson: { type: 'FeatureCollection', features },
    provider: 'USGS 3DEP + D8 flow accumulation',
    channelCount: (attrs.channelCount as number) ?? features.length,
    accumulationThreshold: (attrs.accumulationThreshold as number) ?? null,
    routing: (attrs.routing as string) ?? null,
    library: (attrs.library as string) ?? null,
    degraded,
    honestEmptyReason: (attrs.honestEmptyReason as string) ?? null,
    featureCount: features.length,
    status: 'ok',
  },
})

const oneChannel = [
  { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { accumulation: 900 } },
]

describe('toHydroOverlay toggle binding', () => {
  it('emits a live flow overlay bound to the toggle', () => {
    const on = toHydroOverlay(hydroState(oneChannel, { channelCount: 1 }), true)
    expect(on).toHaveLength(1)
    expect(on[0].layerKey).toBe(LIVE_HYDRO_KEY)
    expect(on[0].visible).toBe(true)
    expect(toHydroOverlay(hydroState(oneChannel, { channelCount: 1 }), false)[0].visible).toBe(false)
  })

  it('draws NOTHING on honest-empty (no channels) — never a synthetic meander', () => {
    expect(
      toHydroOverlay(hydroState([], { channelCount: 0, honestEmptyReason: 'flat terrain' }, true), true),
    ).toHaveLength(0)
    expect(toHydroOverlay({ status: 'loading' }, true)).toHaveLength(0)
    expect(toHydroOverlay({ status: 'error', message: 'x' }, true)).toHaveLength(0)
    expect(toHydroOverlay({ status: 'no-coverage' }, true)).toHaveLength(0)
  })
})

describe('hydrology honest-empty helpers', () => {
  it('detects honest-empty and surfaces the served reason', () => {
    const empty = hydroState([], { channelCount: 0, honestEmptyReason: 'no flow channels above accumulation threshold in this bbox' }, true)
    expect(isHydrologyHonestEmpty(empty)).toBe(true)
    expect(hydrologyHonestReason(empty)).toContain('no flow channels')
  })

  it('is NOT honest-empty when channels exist', () => {
    const live = hydroState(oneChannel, { channelCount: 1 })
    expect(isHydrologyHonestEmpty(live)).toBe(false)
    expect(hydrologyHonestReason(live)).toBeNull()
  })

  it('falls back to a generic honest reason if the slot gave none', () => {
    const empty = hydroState([], { channelCount: 0 }, true)
    expect(isHydrologyHonestEmpty(empty)).toBe(true)
    expect(hydrologyHonestReason(empty)).toBeTruthy()
  })
})
