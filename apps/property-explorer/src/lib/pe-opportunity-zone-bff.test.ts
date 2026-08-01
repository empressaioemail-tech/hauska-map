/**
 * Opportunity Zone tract BFF core tests — CDFI designation list joined to
 * Census TIGER/Line 2010 tract polygons. Public federal data only.
 */

import { describe, expect, it } from 'vitest'
import {
  CDFI_OZ_FEATURE_SERVER,
  CENSUS_TRACTS_2010_LAYER,
  assembleOpportunityZoneLayer,
  bboxToEnvelope,
  fetchCensusTractsInBbox,
  fetchDesignatedGeoidsInBbox,
  geoidsFromCdfiResponse,
  joinOpportunityZoneTracts,
  opportunityZoneProviderLabel,
  parseOpportunityZoneRequest,
} from '../../api/_lib/pe-opportunity-zone-core.js'

const BASTROP_BBOX = { westLng: -97.45, southLat: 29.95, eastLng: -97.15, northLat: 30.25 }

const BASTROP_OZ_GEoids = ['48021950600', '48021950801']

const censusFc = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { GEOID: '48021950600', NAME: 'Census Tract 9506' },
      geometry: { type: 'Polygon', coordinates: [[[-97.4, 30.0], [-97.3, 30.0], [-97.3, 30.1], [-97.4, 30.1], [-97.4, 30.0]]] },
    },
    {
      type: 'Feature',
      properties: { GEOID: '48021950801', NAME: 'Census Tract 9508.01' },
      geometry: { type: 'Polygon', coordinates: [[[-97.35, 30.05], [-97.25, 30.05], [-97.25, 30.15], [-97.35, 30.15], [-97.35, 30.05]]] },
    },
    {
      type: 'Feature',
      properties: { GEOID: '48021950700', NAME: 'Census Tract 9507' },
      geometry: { type: 'Polygon', coordinates: [[[-97.4, 30.05], [-97.35, 30.05], [-97.35, 30.1], [-97.4, 30.1], [-97.4, 30.05]]] },
    },
  ],
}

describe('opportunity zone BFF request parsing', () => {
  it('accepts a valid bbox', () => {
    const parsed = parseOpportunityZoneRequest({ bbox: BASTROP_BBOX })
    expect(parsed.ok).toBe(true)
  })
  it('rejects a missing bbox', () => {
    expect(parseOpportunityZoneRequest({}).ok).toBe(false)
  })
})

describe('opportunity zone join (CDFI GEOID10 × Census 2010 tracts)', () => {
  it('keeps only designated tracts and stamps provenance on every feature', () => {
    const mapped = joinOpportunityZoneTracts(BASTROP_OZ_GEoids, censusFc, '2026-08-01T12:00:00.000Z')
    expect(mapped.status).toBe('ok')
    expect(mapped.featureCount).toBe(2)
    expect(mapped.geojson.features).toHaveLength(2)
    expect(mapped.honestEmptyReason).toBeNull()
    expect(mapped.provider).toContain('CDFI Fund')
    expect(mapped.provider).toContain('TIGER/Line')
    const first = mapped.geojson.features[0] as { properties?: Record<string, unknown> }
    expect(first.properties?.opportunityZone).toBe(true)
    expect(first.properties?.designationSource).toContain('CDFI Fund')
    expect(first.properties?.geometrySource).toContain('TIGER/Line')
    expect(first.properties?.retrievedAt).toBe('2026-08-01T12:00:00.000Z')
  })

  it('honest-empty when no designated tracts intersect the viewport', () => {
    const mapped = joinOpportunityZoneTracts([], censusFc)
    expect(mapped.status).toBe('ok')
    expect(mapped.featureCount).toBe(0)
    expect(mapped.honestEmptyReason).toContain('no designated Opportunity Zone tracts')
  })

  it('extracts GEOID10 rows from CDFI ArcGIS JSON', () => {
    expect(
      geoidsFromCdfiResponse({
        features: [{ attributes: { GEOID10: '48021950200' } }, { attributes: { GEOID10: '48021950600' } }],
      }),
    ).toEqual(['48021950200', '48021950600'])
  })
})

describe('opportunity zone public source URLs (pinned for attribution)', () => {
  it('uses the CDFI Opportunity Zones FeatureServer and Census 2010 TIGER layer', () => {
    expect(CDFI_OZ_FEATURE_SERVER).toContain('Opportunity_Zones/FeatureServer/13')
    expect(CENSUS_TRACTS_2010_LAYER).toContain('tigerWMS_Census2010/MapServer/14')
  })

  it('provider label cites designation + geometry sources and vintages', () => {
    const label = opportunityZoneProviderLabel()
    expect(label).toContain('CDFI Fund')
    expect(label).toContain('TIGER/Line')
    expect(label).toContain('2018-12-14')
    expect(label).toContain('2010')
  })
})

describe('opportunity zone assemble (mocked ArcGIS fetch)', () => {
  it('queries CDFI then Census and joins on GEOID', async () => {
    const calls: string[] = []
    const fetchImpl = async (url: string) => {
      calls.push(url)
      if (url.includes('Opportunity_Zones')) {
        return new Response(
          JSON.stringify({
            features: BASTROP_OZ_GEoids.map((g) => ({ attributes: { GEOID10: g } })),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('tigerWMS_Census2010')) {
        return new Response(JSON.stringify(censusFc), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('not found', { status: 404 })
    }

    const mapped = await assembleOpportunityZoneLayer(
      { bbox: BASTROP_BBOX, centerLat: 30.1, centerLng: -97.3 },
      fetchImpl,
    )
    expect(mapped.featureCount).toBe(2)
    expect(calls.some((u) => u.includes('Opportunity_Zones'))).toBe(true)
    expect(calls.some((u) => u.includes('tigerWMS_Census2010'))).toBe(true)
    expect(bboxToEnvelope(BASTROP_BBOX)).toBe('-97.45,29.95,-97.15,30.25')
  })

  it('fetch helpers surface upstream failures', async () => {
    const fail = async () => new Response('bad', { status: 502 })
    await expect(fetchDesignatedGeoidsInBbox(BASTROP_BBOX, fail)).rejects.toThrow(/CDFI OZ query failed/)
    await expect(fetchCensusTractsInBbox(BASTROP_BBOX, fail)).rejects.toThrow(/Census TIGER tract query failed/)
  })
})
