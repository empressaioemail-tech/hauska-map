/**
 * Hydrography BFF core tests — real county-mapped streams.
 *
 * Guards the pinned engine contract read for the `hydrography` slot:
 * envelope.payload { kind, geojson (streams; name property when present),
 * provenance { source, layerName, vintage, kind }, honestEmptyReason? } — and
 * the honesty ladder: real streams where the county maps them, HONEST-EMPTY
 * with the served reason where it doesn't, honest-unavailable where the county
 * has no configured source, and the FEATURE-DETECT "unavailable" state (never
 * an error) while the engine leg is not yet deployed.
 */

import { describe, expect, it } from 'vitest'
import {
  HYDROGRAPHY_NOT_YET_AVAILABLE,
  buildHydrographyAssembleBody,
  buildHydrographyGateHeaders,
  hydrographyUnavailableResponse,
  isHydrographyUnknownToEngine,
  mapHydrographyPayload,
  parseHydrographyRequest,
} from '../../api/_lib/pe-hydrography-core.js'

const BBOX = { westLng: -97.33, southLat: 30.09, eastLng: -97.31, northLat: 30.12 }

const PROVENANCE = {
  source: 'Bastrop County GIS',
  layerName: 'Streams',
  vintage: '2023',
  kind: 'county-mapped-hydrography',
}

function slotOk(
  features: unknown[],
  opts?: { honestEmptyReason?: string; degraded?: boolean; provenance?: Record<string, unknown> },
) {
  return {
    payload: {
      layers: [
        {
          layerKey: 'hydrography',
          status: 'ok',
          envelope: {
            payload: {
              kind: 'hydrography',
              geojson: { type: 'FeatureCollection', features },
              provenance: opts?.provenance ?? PROVENANCE,
              ...(opts?.honestEmptyReason
                ? { honestEmptyReason: opts.honestEmptyReason }
                : {}),
            },
            coverage: { degraded: opts?.degraded === true },
          },
        },
      ],
    },
  }
}

const namedStream = {
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[-97.32, 30.1], [-97.31, 30.11]] },
  properties: { name: 'Piney Creek' },
}
const unnamedStream = {
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [[-97.33, 30.09], [-97.32, 30.1]] },
  properties: {},
}

describe('hydrography BFF request parsing', () => {
  it('accepts a valid bbox and derives a center when omitted', () => {
    const parsed = parseHydrographyRequest({ bbox: BBOX })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.request.centerLat).toBeCloseTo((30.09 + 30.12) / 2, 6)
  })
  it('rejects a degenerate bbox', () => {
    expect(parseHydrographyRequest({}).ok).toBe(false)
  })
})

describe('hydrography BFF assemble body + gate headers', () => {
  it('requests ONLY the hydrography slot', () => {
    const body = buildHydrographyAssembleBody({ bbox: BBOX, centerLat: 30.1, centerLng: -97.32 })
    expect(body.layers).toEqual(['hydrography'])
    expect(body.bbox).toEqual(BBOX)
  })
  it('sends map-layers package at the FREE tier', () => {
    const h = buildHydrographyGateHeaders()
    expect(h['x-hauska-package-id']).toBe('map-layers')
    expect(h['x-hauska-access-tier']).toBe('public-free')
    expect(h['x-hauska-product']).toBe('cortex')
    expect(h['x-hauska-gate-credential-id']).toBe('property-explorer-hydrography-bff')
  })
})

describe('hydrography BFF slot mapping (real streams + provenance)', () => {
  it('maps a served county stream set to ok with provenance', () => {
    const mapped = mapHydrographyPayload(slotOk([namedStream, unnamedStream]))
    expect(mapped.status).toBe('ok')
    expect(mapped.featureCount).toBe(2)
    expect(mapped.geojson.features).toHaveLength(2)
    expect(mapped.provenance).toEqual(PROVENANCE)
    expect(mapped.provider).toBe('Bastrop County GIS')
    expect(mapped.honestEmptyReason).toBeNull()
    // Stream names survive the mapping (the client may label at high zoom).
    const first = mapped.geojson.features[0] as { properties?: { name?: string } }
    expect(first.properties?.name).toBe('Piney Creek')
  })

  it('surfaces honest-empty (no streams in bbox) with the served reason, NOT an error', () => {
    const mapped = mapHydrographyPayload(
      slotOk([], { honestEmptyReason: 'no mapped streams in this bbox' }),
    )
    expect(mapped.status).toBe('ok')
    expect(mapped.featureCount).toBe(0)
    expect(mapped.geojson.features).toHaveLength(0)
    expect(mapped.honestEmptyReason).toBe('no mapped streams in this bbox')
  })

  it('synthesizes an honest-empty reason when the slot is empty but gave none', () => {
    const mapped = mapHydrographyPayload(slotOk([]))
    expect(mapped.status).toBe('ok')
    expect(mapped.honestEmptyReason).toBeTruthy()
  })

  it('passes honest-unavailable through when the county has no configured source', () => {
    const mapped = mapHydrographyPayload({
      payload: {
        layers: [
          {
            layerKey: 'hydrography',
            status: 'no-coverage',
            honestEmptyReason: 'no configured hydrography source for this county',
          },
        ],
      },
    })
    expect(mapped.status).toBe('no-coverage')
    expect(mapped.geojson.features).toHaveLength(0)
    expect(mapped.detail).toContain('no configured hydrography source')
  })
})

describe('hydrography FEATURE-DETECT (engine leg not deployed)', () => {
  it('maps a payload with NO hydrography slot to "unavailable", never an error', () => {
    const mapped = mapHydrographyPayload({
      payload: { layers: [{ layerKey: 'hydrology-flow', status: 'ok' }] },
    })
    expect(mapped.status).toBe('unavailable')
    expect(mapped.detail).toBe(HYDROGRAPHY_NOT_YET_AVAILABLE)
    expect(mapped.geojson.features).toHaveLength(0)
  })

  it('maps a malformed / slotless payload to "unavailable"', () => {
    expect(mapHydrographyPayload(null).status).toBe('unavailable')
    expect(mapHydrographyPayload({}).status).toBe('unavailable')
  })

  it('classifies upstream 404 as unknown-to-engine (honest not-yet-available)', () => {
    expect(isHydrographyUnknownToEngine(404, 'Not found')).toBe(true)
  })

  it('classifies a 400 rejecting the hydrography layer key as unknown-to-engine', () => {
    expect(
      isHydrographyUnknownToEngine(400, '{"error":"unknown layer key: hydrography"}'),
    ).toBe(true)
    expect(
      isHydrographyUnknownToEngine(422, 'hydrography is not a valid layer'),
    ).toBe(true)
  })

  it('does NOT swallow real failures as unavailable', () => {
    expect(isHydrographyUnknownToEngine(500, 'boom')).toBe(false)
    expect(isHydrographyUnknownToEngine(502, 'bad gateway')).toBe(false)
    // A 400 about something else stays a real request failure.
    expect(isHydrographyUnknownToEngine(400, 'invalid bbox')).toBe(false)
  })

  it('the canned unavailable response is empty + honest', () => {
    const r = hydrographyUnavailableResponse()
    expect(r.status).toBe('unavailable')
    expect(r.geojson.features).toHaveLength(0)
    expect(r.detail).toBe(HYDROGRAPHY_NOT_YET_AVAILABLE)
  })
})
