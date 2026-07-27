/**
 * Live contour overlay + toggle-binding tests — qa/topo-panel-live.
 *
 * Locks the toggle wiring the operator reported broken: the LAYERS-panel
 * `topography-contours` checkbox must control the REAL contour overlay's
 * `visible` flag, and an empty/failed contour fetch must draw nothing (never a
 * synthetic meander).
 */

import { describe, expect, it } from 'vitest'
import {
  LIVE_TOPO_KEY,
  toTopoOverlay,
  type TopoLayerState,
} from './liveGis'

const okState = (features: unknown[]): TopoLayerState => ({
  status: 'ok',
  response: {
    geojson: { type: 'FeatureCollection', features },
    provider: 'USGS 3DEP + site-topography',
    tier: 'derived-3dep',
    intervalLabel: '1 m (3DEP-derived)',
    degraded: false,
    featureCount: features.length,
    status: 'ok',
  },
})

const oneContour = [
  { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { elevation: 152 } },
]

describe('toTopoOverlay toggle binding', () => {
  it('emits a live contour overlay bound visible=true when the toggle is ON', () => {
    const specs = toTopoOverlay(okState(oneContour), true)
    expect(specs).toHaveLength(1)
    expect(specs[0].layerKey).toBe(LIVE_TOPO_KEY)
    expect(specs[0].visible).toBe(true)
  })

  it('emits the overlay with visible=false when the toggle is OFF (hidden, not removed)', () => {
    const specs = toTopoOverlay(okState(oneContour), false)
    expect(specs).toHaveLength(1)
    expect(specs[0].visible).toBe(false)
  })

  it('draws NOTHING for an empty feature collection (no synthetic contours)', () => {
    expect(toTopoOverlay(okState([]), true)).toHaveLength(0)
  })

  it('draws NOTHING while loading / errored / no-coverage (honest — no fixture fallback)', () => {
    expect(toTopoOverlay({ status: 'loading' }, true)).toHaveLength(0)
    expect(toTopoOverlay({ status: 'error', message: 'x' }, true)).toHaveLength(0)
    expect(toTopoOverlay({ status: 'no-coverage' }, true)).toHaveLength(0)
    expect(toTopoOverlay({ status: 'idle' }, true)).toHaveLength(0)
  })
})
