// apps/command-center/src/admin/workspace/tiles/liveGis.test.ts
//
// Unit tests for the live-GIS Map tile logic: viewport fetch policy, the
// gis-layer client's honest state mapping (404 → no-coverage, failures →
// named errors, never a fixture fallback), overlay composition/order, and the
// parcel-selection → info-card payload.

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  MIN_PARCEL_ZOOM,
  MIN_FEMA_ZOOM,
  LIVE_PARCELS_KEY,
  LIVE_FEMA_KEY,
  layersForZoom,
  fetchGisLayer,
  parcelFillColor,
  toLiveOverlays,
  selectionToCard,
  type FeatureCollectionLike,
  type LiveLayerState,
} from './liveGis'

const SAN_MARCOS_BBOX = { west: -97.934, south: 29.865, east: -97.92, north: 29.876 }

function fc(properties: Array<Record<string, unknown>>): FeatureCollectionLike {
  return {
    type: 'FeatureCollection',
    features: properties.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
      properties: p,
    })),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('layersForZoom (viewport fetch policy)', () => {
  it('fetches nothing at very wide zooms', () => {
    expect(layersForZoom(MIN_FEMA_ZOOM - 1)).toEqual([])
  })
  it('fetches fema but gates parcels between the thresholds', () => {
    expect(layersForZoom(MIN_PARCEL_ZOOM - 1)).toEqual(['fema'])
  })
  it('fetches both at parcel zoom', () => {
    expect(layersForZoom(MIN_PARCEL_ZOOM)).toEqual(['fema', 'parcels'])
    expect(layersForZoom(15.2)).toEqual(['fema', 'parcels'])
  })
})

describe('fetchGisLayer (bbox → proxy POST → honest states)', () => {
  it('POSTs the bbox to the gis-layer path and returns ok with the envelope', async () => {
    const envelope = {
      layer: 'parcels',
      provider: 'Hays County parcels (TxGIO/StratMap)',
      featureCount: 2,
      truncated: false,
      notSurveyGrade: true,
      geojson: fc([{ apn: '12311' }, { apn: '12312' }]),
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const state = await fetchGisLayer('/api/spine/cortex/api', 'parcels', SAN_MARCOS_BBOX)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/spine/cortex/api/brokerage/v1/map-data/gis-layer')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ layer: 'parcels', bbox: SAN_MARCOS_BBOX })

    expect(state.status).toBe('ok')
    if (state.status === 'ok') {
      expect(state.response.provider).toBe('Hays County parcels (TxGIO/StratMap)')
      expect(state.response.geojson?.features).toHaveLength(2)
    }
  })

  it('maps 404 to an honest no-coverage state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'not-found', message: 'no adapter for county' }), {
          status: 404,
        }),
      ),
    )
    const state = await fetchGisLayer('/api/spine/cortex/api', 'parcels', SAN_MARCOS_BBOX)
    expect(state).toEqual({ status: 'no-coverage', detail: 'no adapter for county' })
  })

  it('maps upstream failures to a NAMED error state (no silent fixture fallback)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'upstream-error', message: 'Cotality OAuth token responded HTTP 500' }),
          { status: 502 },
        ),
      ),
    )
    const state = await fetchGisLayer('/api/spine/cortex/api', 'parcels', SAN_MARCOS_BBOX)
    expect(state.status).toBe('error')
    if (state.status === 'error') {
      expect(state.message).toContain('parcels')
      expect(state.message).toContain('Cotality OAuth token responded HTTP 500')
    }
  })

  it('maps network failure to a named error carrying the layer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const state = await fetchGisLayer('/api/spine/cortex/api', 'fema', SAN_MARCOS_BBOX)
    expect(state).toEqual({ status: 'error', message: 'fema: Failed to fetch' })
  })
})

describe('parcelFillColor (color by landUseCode where present, neutral otherwise)', () => {
  it('returns a neutral constant when no landUseCode is present (e.g. Hays TxGIO)', () => {
    const color = parcelFillColor(fc([{ apn: '1' }, { apn: '2' }]))
    expect(typeof color).toBe('string')
  })
  it('returns a categorical match expression over the codes present', () => {
    const color = parcelFillColor(fc([{ landUseCode: 'COM' }, { landUseCode: 'MF' }])) as unknown[]
    expect(Array.isArray(color)).toBe(true)
    expect(color[0]).toBe('match')
    expect(color).toContain('COM')
    expect(color).toContain('MF')
  })
})

describe('toLiveOverlays (overlay composition)', () => {
  const okParcels: LiveLayerState = {
    status: 'ok',
    response: { layer: 'parcels', provider: 'p', geojson: fc([{ apn: '1' }]) },
  }
  const okFema: LiveLayerState = {
    status: 'ok',
    response: { layer: 'fema', provider: 'FEMA NFHL', geojson: fc([{ FLD_ZONE: 'AO' }]) },
  }

  it('orders FEMA below parcels and marks only parcels interactive', () => {
    const specs = toLiveOverlays(okParcels, okFema)
    expect(specs.map((s) => s.layerKey)).toEqual([LIVE_FEMA_KEY, LIVE_PARCELS_KEY])
    expect(specs[0].interactive).toBeUndefined()
    expect(specs[1].interactive).toBe(true)
  })

  it('renders nothing for error / no-coverage / zoom-gated states (honest empty, not fixtures)', () => {
    expect(toLiveOverlays({ status: 'error', message: 'x' }, { status: 'no-coverage' })).toEqual([])
    expect(toLiveOverlays({ status: 'zoom-gated' }, { status: 'idle' })).toEqual([])
  })
})

describe('selectionToCard (click payload)', () => {
  it('extracts the info-card fields from a live-parcel selection', () => {
    const card = selectionToCard({
      layerKey: LIVE_PARCELS_KEY,
      lat: 29.87019,
      lng: -97.92754,
      properties: {
        apn: '12311',
        situsAddress: '600 CAPE RD, SAN MARCOS, TX 78666',
        owner: 'TEXAS PARKS & WILDLIFE DEPT',
        countyName: 'Hays',
        countyFips: '48209',
        provider: 'txgio',
        notSurveyGrade: true,
        retrievedAt: '2026-07-14T11:22:11.251Z',
      },
    })
    expect(card).toEqual({
      apn: '12311',
      situsAddress: '600 CAPE RD, SAN MARCOS, TX 78666',
      owner: 'TEXAS PARKS & WILDLIFE DEPT',
      landUseDescription: null,
      county: 'Hays County (48209)',
      provider: 'txgio',
      notSurveyGrade: true,
      retrievedAt: '2026-07-14T11:22:11.251Z',
      lat: 29.87019,
      lng: -97.92754,
    })
  })

  it('prefers landUseDescription and falls back to landUseCode', () => {
    expect(
      selectionToCard({ properties: { landUseDescription: 'Commercial', landUseCode: 'COM' } })
        .landUseDescription,
    ).toBe('Commercial')
    expect(selectionToCard({ properties: { landUseCode: 'COM' } }).landUseDescription).toBe('COM')
  })
})
