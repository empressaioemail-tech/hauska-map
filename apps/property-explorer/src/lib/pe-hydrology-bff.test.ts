/**
 * Hydrology (D8 flow) BFF core tests — qa/topo-panel-1ft-hydro.
 *
 * Guards the HONESTY contract for the `hydrology-flow` slot: LIVE D8 channels
 * where they compute, HONEST-EMPTY (empty FeatureCollection + real reason) where
 * they don't — NEVER a synthetic meander and NEVER an error masquerading as
 * empty. Also guards request validation, gate-header shape, and the real
 * `envelope.payload` wire read.
 */

import { describe, expect, it } from 'vitest'
import {
  buildHydrologyAssembleBody,
  buildHydrologyGateHeaders,
  mapHydrologyPayload,
  parseHydrologyRequest,
} from '../../api/_lib/pe-hydrology-core.js'

const BBOX = { westLng: -97.33, southLat: 30.09, eastLng: -97.31, northLat: 30.12 }

function slotOk(attributes: Record<string, unknown>, features: unknown[], degraded = false) {
  return {
    payload: {
      layers: [
        {
          layerKey: 'hydrology-flow',
          status: 'ok',
          adapterKey: 'hydrology:pysheds',
          envelope: {
            payload: {
              kind: 'hydrology-flow',
              geojson: { type: 'FeatureCollection', features },
              attributes,
              provider: 'USGS 3DEP + D8 flow accumulation',
            },
            coverage: { degraded },
          },
        },
      ],
    },
  }
}

describe('hydrology BFF request parsing', () => {
  it('accepts a valid bbox and derives a center when omitted', () => {
    const parsed = parseHydrologyRequest({ bbox: BBOX })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.request.centerLat).toBeCloseTo((30.09 + 30.12) / 2, 6)
  })
  it('rejects a degenerate bbox', () => {
    expect(parseHydrologyRequest({}).ok).toBe(false)
  })
})

describe('hydrology BFF assemble body + gate headers', () => {
  it('requests ONLY the hydrology-flow slot', () => {
    const body = buildHydrologyAssembleBody({ bbox: BBOX, centerLat: 30.1, centerLng: -97.32 })
    expect(body.layers).toEqual(['hydrology-flow'])
    expect(body.bbox).toEqual(BBOX)
  })
  it('sends map-layers package at the FREE tier', () => {
    const h = buildHydrologyGateHeaders()
    expect(h['x-hauska-package-id']).toBe('map-layers')
    expect(h['x-hauska-access-tier']).toBe('public-free')
    expect(h['x-hauska-product']).toBe('cortex')
  })
})

describe('hydrology BFF honesty (live vs honest-empty)', () => {
  it('maps a live D8 result with channels to ok + channelCount', () => {
    const mapped = mapHydrologyPayload(
      slotOk(
        {
          channelCount: 2,
          accumulationThreshold: 500,
          routing: 'd8',
          library: 'pysheds',
          honestEmptyReason: null,
        },
        [
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { accumulation: 900 } },
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { accumulation: 1200 } },
        ],
      ),
    )
    expect(mapped.status).toBe('ok')
    expect(mapped.channelCount).toBe(2)
    expect(mapped.featureCount).toBe(2)
    expect(mapped.routing).toBe('d8')
    expect(mapped.library).toBe('pysheds')
    expect(mapped.honestEmptyReason).toBeNull()
  })

  it('surfaces honest-empty (no channels) with the real reason, NOT an error and NOT a fixture', () => {
    const mapped = mapHydrologyPayload(
      slotOk(
        {
          channelCount: 0,
          honestEmptyReason: 'no flow channels above accumulation threshold in this bbox',
        },
        [],
        true,
      ),
    )
    // Honest-empty stays status 'ok' — the client shows the reason, not a failure.
    expect(mapped.status).toBe('ok')
    expect(mapped.channelCount).toBe(0)
    expect(mapped.featureCount).toBe(0)
    expect(mapped.geojson.features).toHaveLength(0)
    expect(mapped.honestEmptyReason).toContain('no flow channels')
    expect(mapped.degraded).toBe(true)
  })

  it('synthesizes an honest-empty reason when the slot is empty but gave none', () => {
    const mapped = mapHydrologyPayload(slotOk({ channelCount: 0 }, []))
    expect(mapped.status).toBe('ok')
    expect(mapped.channelCount).toBe(0)
    expect(mapped.honestEmptyReason).toBeTruthy()
  })

  it('surfaces a flat-terrain honest-empty reason verbatim (D8 worker error path)', () => {
    const mapped = mapHydrologyPayload(
      slotOk(
        { channelCount: 0, honestEmptyReason: 'flat terrain: no D8 flow directions resolved' },
        [],
        true,
      ),
    )
    expect(mapped.honestEmptyReason).toBe('flat terrain: no D8 flow directions resolved')
  })

  it('reports a pending slot honestly (no fabricated geometry)', () => {
    const mapped = mapHydrologyPayload({
      payload: { layers: [{ layerKey: 'hydrology-flow', status: 'pending', pendingReason: 'DEM void' }] },
    })
    expect(mapped.status).toBe('pending')
    expect(mapped.geojson.features).toHaveLength(0)
    expect(mapped.honestEmptyReason).toContain('DEM void')
  })

  it('reports empty when there is no hydrology-flow slot', () => {
    const mapped = mapHydrologyPayload({ payload: { layers: [{ layerKey: 'topography-1ft', status: 'ok' }] } })
    expect(mapped.status).toBe('empty')
    expect(mapped.geojson.features).toHaveLength(0)
  })
})
