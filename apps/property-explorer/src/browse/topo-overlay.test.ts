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
  isHydrologyHonestEmpty,
  hydrologyHonestReason,
  type TopoLayerState,
  type HydroLayerState,
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
