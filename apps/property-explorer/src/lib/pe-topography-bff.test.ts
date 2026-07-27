/**
 * Topography (contours) BFF core tests — qa/topo-panel-live.
 *
 * Guards the HONESTY contract: the map-layers `topography` slot is 3DEP-derived
 * (1 m interval) and must NEVER be labeled 1-ft (that authoritative Bastrop tier
 * is export-only). Also guards request validation, gate-header shape, and the
 * engine-envelope -> map-layer response mapping (ok / pending / no-slot).
 */

import { describe, expect, it } from 'vitest'
import {
  buildAssembleBody,
  buildTopographyGateHeaders,
  mapAssemblePayload,
  parseTopoRequest,
} from '../../api/_lib/pe-topography-core.js'

const BBOX = { westLng: -97.33, southLat: 30.09, eastLng: -97.31, northLat: 30.12 }

describe('topography BFF request parsing', () => {
  it('accepts a valid bbox and derives a center when omitted', () => {
    const parsed = parseTopoRequest({ bbox: BBOX })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.request.centerLat).toBeCloseTo((30.09 + 30.12) / 2, 6)
    expect(parsed.request.centerLng).toBeCloseTo((-97.33 + -97.31) / 2, 6)
  })

  it('honors an explicit center', () => {
    const parsed = parseTopoRequest({ bbox: BBOX, centerLat: 30.1, centerLng: -97.32 })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.request.centerLat).toBe(30.1)
    expect(parsed.request.centerLng).toBe(-97.32)
  })

  it('rejects a missing/degenerate bbox', () => {
    expect(parseTopoRequest({}).ok).toBe(false)
    expect(parseTopoRequest({ bbox: { westLng: -97.3, southLat: 30.1, eastLng: -97.4, northLat: 30.0 } }).ok).toBe(false)
    expect(parseTopoRequest('not json').ok).toBe(false)
  })
})

describe('topography BFF assemble body', () => {
  it('requests ONLY the topography slot with viewport bbox+center', () => {
    const body = buildAssembleBody({ bbox: BBOX, centerLat: 30.1, centerLng: -97.32 })
    expect(body.layers).toEqual(['topography'])
    expect(body.bbox).toEqual(BBOX)
    expect((body.parcel as Record<string, unknown>).latitude).toBe(30.1)
    // Jurisdiction keys stay null — the slot is 3DEP national, not 1-ft-upgradable here.
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

describe('topography BFF response mapping (honesty)', () => {
  it('maps an ok topography slot to 3DEP-derived contours, NEVER 1-ft', () => {
    const payload = {
      data: {
        layers: [
          {
            layerKey: 'topography',
            status: 'ok',
            envelope: {
              data: {
                kind: 'topography-contours',
                geojson: {
                  type: 'FeatureCollection',
                  features: [{ type: 'Feature', geometry: null, properties: {} }],
                },
                attributes: { intervalMeters: 1 },
                provider: 'USGS 3DEP + site-topography',
              },
              coverage: { degraded: false },
            },
          },
        ],
      },
    }
    const mapped = mapAssemblePayload(payload)
    expect(mapped.status).toBe('ok')
    expect(mapped.tier).toBe('derived-3dep')
    expect(mapped.intervalLabel).toBe('1 m (3DEP-derived)')
    expect(mapped.intervalLabel).not.toMatch(/ft|1-ft|LiDAR/i)
    expect(mapped.provider).toBe('USGS 3DEP + site-topography')
    expect(mapped.featureCount).toBe(1)
    expect(mapped.degraded).toBe(false)
  })

  it('carries a degraded flag through from the envelope coverage', () => {
    const mapped = mapAssemblePayload({
      data: {
        layers: [
          {
            layerKey: 'topography',
            status: 'ok',
            envelope: {
              data: { geojson: { type: 'FeatureCollection', features: [] }, attributes: { intervalMeters: 1 } },
              coverage: { degraded: true },
            },
          },
        ],
      },
    })
    expect(mapped.degraded).toBe(true)
  })

  it('reports a pending slot honestly (no fabricated geometry)', () => {
    const mapped = mapAssemblePayload({
      data: { layers: [{ layerKey: 'topography', status: 'pending', pendingReason: 'DEM fetch failed' }] },
    })
    expect(mapped.status).toBe('pending')
    expect(mapped.geojson.features).toHaveLength(0)
    expect(mapped.detail).toContain('DEM fetch failed')
  })

  it('reports empty when there is no topography slot', () => {
    const mapped = mapAssemblePayload({ data: { layers: [{ layerKey: 'flood-zone', status: 'ok' }] } })
    expect(mapped.status).toBe('empty')
    expect(mapped.geojson.features).toHaveLength(0)
  })
})
