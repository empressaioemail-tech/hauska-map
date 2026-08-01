/**
 * Opportunity Zone overlay composition — live-gis client helpers.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  LIVE_OPPORTUNITY_ZONE_KEY,
  MIN_OPPORTUNITY_ZONE_ZOOM,
  DETAIL_OPPORTUNITY_ZONE_ZOOM,
  clearTexasOpportunityZoneCache,
  fetchOpportunityZoneLayer,
  fetchTexasOpportunityZoneLayer,
  isOpportunityZoneHonestEmpty,
  opportunityZoneHonestReason,
  opportunityZoneProvenanceLabel,
  toOpportunityZoneOverlay,
} from './liveGis'

const BBOX = { west: -97.45, south: 29.95, east: -97.15, north: 30.25 }

beforeEach(() => {
  clearTexasOpportunityZoneCache()
})

describe('toOpportunityZoneOverlay', () => {
  it('returns a styled fill overlay when ok tracts are present', () => {
    const specs = toOpportunityZoneOverlay(
      {
        status: 'ok',
        response: {
          geojson: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { geoid: '48021950600', opportunityZone: true },
                geometry: { type: 'Polygon', coordinates: [] },
              },
            ],
          },
          provider: 'Opportunity Zone — CDFI; geometry: Census TIGER/Line',
          featureCount: 1,
        },
      },
      true,
    )
    expect(specs).toHaveLength(1)
    expect(specs[0].layerKey).toBe(LIVE_OPPORTUNITY_ZONE_KEY)
    expect(specs[0].visible).toBe(true)
    expect(specs[0].paint?.['fill-color']).toContain('63,114,86')
  })

  it('draws nothing on honest-empty or non-ok states', () => {
    expect(
      toOpportunityZoneOverlay(
        { status: 'ok', response: { geojson: { type: 'FeatureCollection', features: [] } } },
        true,
      ),
    ).toEqual([])
    expect(toOpportunityZoneOverlay({ status: 'error', message: 'x' }, true)).toEqual([])
    expect(toOpportunityZoneOverlay({ status: 'zoom-gated' }, true)).toEqual([])
  })
})

describe('fetchOpportunityZoneLayer (mocked BFF)', () => {
  it('POSTs the viewport bbox and maps ok responses', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          status: 'ok',
          featureCount: 2,
          geojson: { type: 'FeatureCollection', features: [{}, {}] },
          provider: 'Opportunity Zone — test',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const state = await fetchOpportunityZoneLayer('/api/pe-opportunity-zone', BBOX, {
      lat: 30.1,
      lng: -97.3,
    })
    vi.unstubAllGlobals()
    expect(state.status).toBe('ok')
    if (state.status !== 'ok') return
    expect(state.response.featureCount).toBe(2)
    expect(fetchMock).toHaveBeenCalled()
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({
      scope: 'viewport',
      bbox: { westLng: -97.45, southLat: 29.95, eastLng: -97.15, northLat: 30.25 },
    })
  })
})

describe('fetchTexasOpportunityZoneLayer (mocked BFF)', () => {
  it('POSTs scope=texas once and caches the statewide response', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          status: 'ok',
          featureCount: 628,
          geojson: { type: 'FeatureCollection', features: [{}, {}] },
          provider: 'Opportunity Zone — Texas statewide',
          provenance: { scope: 'texas', simplified: true },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const first = await fetchTexasOpportunityZoneLayer('/api/pe-opportunity-zone')
    const second = await fetchTexasOpportunityZoneLayer('/api/pe-opportunity-zone')
    vi.unstubAllGlobals()
    expect(first.status).toBe('ok')
    expect(second.status).toBe('ok')
    if (first.status !== 'ok') return
    expect(first.response.featureCount).toBe(628)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toMatchObject({
      scope: 'texas',
      simplify: true,
    })
  })
})

describe('opportunity zone honesty helpers', () => {
  it('surfaces honest-empty when zero tracts are served', () => {
    const state = {
      status: 'ok' as const,
      response: {
        geojson: { type: 'FeatureCollection' as const, features: [] },
        featureCount: 0,
        honestEmptyReason: 'no designated Opportunity Zone tracts in this view',
      },
    }
    expect(isOpportunityZoneHonestEmpty(state)).toBe(true)
    expect(opportunityZoneHonestReason(state)).toContain('no designated')
  })

  it('labels provenance from provider or structured provenance', () => {
    expect(
      opportunityZoneProvenanceLabel({
        provider: 'Opportunity Zone — CDFI (2018); geometry: TIGER/Line (2010)',
      }),
    ).toContain('CDFI')
    expect(
      opportunityZoneProvenanceLabel({
        provenance: {
          designationSource: 'CDFI Fund Opportunity Zones FeatureServer',
          designationVintage: '2018-12-14',
          geometrySource: 'U.S. Census Bureau TIGER/Line',
          geometryVintage: '2010',
        },
      }),
    ).toContain('TIGER/Line')
  })

  it('has no zoom floor; detail LOD threshold stays at regional altitude', () => {
    expect(MIN_OPPORTUNITY_ZONE_ZOOM).toBe(0)
    expect(DETAIL_OPPORTUNITY_ZONE_ZOOM).toBe(11)
  })
})
