/**
 * Topography (contours) BFF core tests — qa/topo-panel-1ft-hydro.
 *
 * Guards the HONESTY contract for the `topography-1ft` slot: the served tier is
 * read PER RESPONSE from `contourSource.tier`. An authoritative-1ft response is
 * labelled 1-ft (Bastrop); a 3dep-fallback response is labelled 3DEP with its
 * fallbackReason — NEVER 1-ft. Also guards request validation, gate-header
 * shape, and the real `envelope.payload` wire read (sealEnvelope shape).
 */

import { describe, expect, it } from 'vitest'
import {
  buildAssembleBody,
  buildTopographyGateHeaders,
  contourIntervalLabel,
  mapAssemblePayload,
  parseTopoRequest,
} from '../../api/_lib/pe-topography-core.js'

const BBOX = { westLng: -97.33, southLat: 30.09, eastLng: -97.31, northLat: 30.12 }

/** Real sealed-envelope wire shape: slot.envelope.payload holds geometry. */
function slotOk(attributes: Record<string, unknown>, features: unknown[], degraded = false) {
  return {
    payload: {
      layers: [
        {
          layerKey: 'topography-1ft',
          status: 'ok',
          adapterKey: 'x',
          envelope: {
            payload: {
              kind: 'topography-contours',
              geojson: { type: 'FeatureCollection', features },
              attributes,
              provider: 'engine',
            },
            coverage: { degraded },
          },
        },
      ],
    },
  }
}

describe('topography BFF request parsing', () => {
  it('accepts a valid bbox and derives a center when omitted', () => {
    const parsed = parseTopoRequest({ bbox: BBOX })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.request.centerLat).toBeCloseTo((30.09 + 30.12) / 2, 6)
    expect(parsed.request.centerLng).toBeCloseTo((-97.33 + -97.31) / 2, 6)
  })

  it('rejects a missing/degenerate bbox', () => {
    expect(parseTopoRequest({}).ok).toBe(false)
    expect(parseTopoRequest({ bbox: { westLng: -97.3, southLat: 30.1, eastLng: -97.4, northLat: 30.0 } }).ok).toBe(false)
    expect(parseTopoRequest('not json').ok).toBe(false)
  })
})

describe('topography BFF assemble body', () => {
  it('requests ONLY the topography-1ft slot with viewport bbox+center', () => {
    const body = buildAssembleBody({ bbox: BBOX, centerLat: 30.1, centerLng: -97.32 })
    expect(body.layers).toEqual(['topography-1ft'])
    expect(body.bbox).toEqual(BBOX)
    expect((body.parcel as Record<string, unknown>).latitude).toBe(30.1)
    expect(body.jurisdiction).toEqual({ stateKey: null, localKey: null })
  })
})

describe('topography BFF gate headers', () => {
  it('sends map-layers package at the FREE tier (browse layer, not paid)', () => {
    const h = buildTopographyGateHeaders()
    expect(h['x-hauska-package-id']).toBe('map-layers')
    expect(h['x-hauska-access-tier']).toBe('public-free')
    expect(h['x-hauska-product']).toBe('cortex')
    expect(h['x-hauska-request-id']).toBeTruthy()
  })
})

describe('topography BFF per-tier honesty (1-ft vs 3DEP)', () => {
  it('labels an authoritative-1ft (Bastrop) response as 1-ft LiDAR', () => {
    const mapped = mapAssemblePayload(
      slotOk(
        {
          contourSource: {
            tier: 'authoritative-1ft',
            source: 'Bastrop County GIS (Contour1Ft2017)',
            vintage: '2017 StratMap LiDAR',
            intervalLabel: '1-ft interval (Bastrop County LiDAR)',
            unit: 'metres NAVD88 (converted from US survey feet)',
            contourCount: 2,
          },
        },
        [{}, {}],
      ),
    )
    expect(mapped.status).toBe('ok')
    expect(mapped.tier).toBe('authoritative-1ft')
    expect(mapped.intervalLabel).toMatch(/1-?\s*ft/i)
    expect(mapped.source).toContain('Bastrop')
    expect(mapped.vintage).toBe('2017 StratMap LiDAR')
    expect(mapped.fallbackReason).toBeNull()
    expect(mapped.featureCount).toBe(2)
  })

  it('labels a 3dep-fallback (non-Bastrop) response as 3DEP, NEVER 1-ft, with the reason', () => {
    const mapped = mapAssemblePayload(
      slotOk(
        {
          contourSource: {
            tier: '3dep-fallback',
            source: 'usgs:3dep-dem',
            vintage: 'USGS 3DEP (national mosaic)',
            intervalLabel: '1-m interval (3DEP-derived)',
            intervalMeters: 1,
            unit: 'metres NAVD88 (3DEP-derived contour lines)',
            contourCount: 3,
            fallbackReason: 'bbox outside Bastrop County 1-ft footprint',
          },
        },
        [{}, {}, {}],
      ),
    )
    expect(mapped.tier).toBe('3dep-fallback')
    expect(mapped.intervalLabel).not.toMatch(/1-?\s*ft|lidar/i)
    expect(mapped.intervalLabel).toMatch(/3DEP/i)
    expect(mapped.fallbackReason).toBe('bbox outside Bastrop County 1-ft footprint')
    expect(mapped.featureCount).toBe(3)
  })

  it('defaults to the honest 3dep-fallback tier when contourSource is absent (never assumes 1-ft)', () => {
    const mapped = mapAssemblePayload(slotOk({}, [{}]))
    expect(mapped.tier).toBe('3dep-fallback')
    expect(mapped.intervalLabel).not.toMatch(/1-?\s*ft/i)
  })

  it('carries the degraded flag from envelope.coverage', () => {
    const mapped = mapAssemblePayload(
      slotOk({ contourSource: { tier: '3dep-fallback', fallbackReason: 'x' } }, [], true),
    )
    expect(mapped.degraded).toBe(true)
  })

  it('reports a pending slot honestly (no fabricated geometry)', () => {
    const mapped = mapAssemblePayload({
      payload: { layers: [{ layerKey: 'topography-1ft', status: 'pending', pendingReason: 'DEM fetch failed' }] },
    })
    expect(mapped.status).toBe('pending')
    expect(mapped.geojson.features).toHaveLength(0)
    expect(mapped.fallbackReason).toContain('DEM fetch failed')
  })

  it('reports empty when there is no topography-1ft slot', () => {
    const mapped = mapAssemblePayload({ payload: { layers: [{ layerKey: 'flood-zone', status: 'ok' }] } })
    expect(mapped.status).toBe('empty')
    expect(mapped.geojson.features).toHaveLength(0)
  })
})

describe('contourIntervalLabel guard', () => {
  it('never emits 1-ft for a 3DEP tier even with a malformed served label', () => {
    const l = contourIntervalLabel('3dep-fallback', { intervalLabel: '1-ft interval (bogus)' })
    expect(l).not.toMatch(/1-?\s*ft/i)
    expect(l).toMatch(/3DEP/i)
  })
  it('trusts the served 1-ft label for the authoritative tier', () => {
    const l = contourIntervalLabel('authoritative-1ft', { intervalLabel: '1-ft interval (Bastrop LiDAR)' })
    expect(l).toMatch(/1-?\s*ft/i)
  })
})
