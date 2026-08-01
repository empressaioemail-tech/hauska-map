/**
 * Opportunity Zone tract BFF core tests — CDFI designation list joined to
 * Census TIGER/Line 2010 tract polygons, plus Texas statewide LOD.
 * Public federal data only.
 */

import { describe, expect, it } from 'vitest'
import {
  CDFI_OZ_FEATURE_SERVER,
  CENSUS_TRACTS_2010_LAYER,
  TEXAS_OZ_STATE_FIPS,
  TEXAS_OZ_STATEWIDE_MAX_OFFSET,
  assembleOpportunityZoneLayer,
  assembleTexasOpportunityZoneLayer,
  bboxToEnvelope,
  fetchCensusTractsInBbox,
  fetchDesignatedGeoidsInBbox,
  fetchTexasCdfiOzGeoJson,
  geoidsFromCdfiResponse,
  joinOpportunityZoneTracts,
  opportunityZoneProviderLabel,
  parseOpportunityZoneRequest,
  stampCdfiOpportunityZoneFeatures,
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
    if (!parsed.ok) return
    expect(parsed.request.scope).toBe('viewport')
  })
  it('accepts scope=texas without a bbox', () => {
    const parsed = parseOpportunityZoneRequest({ scope: 'texas' })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.request).toMatchObject({ scope: 'texas', simplify: true })
  })
  it('rejects a missing bbox when not statewide', () => {
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
      { bbox: BASTROP_BBOX, centerLat: 30.1, centerLng: -97.3, scope: 'viewport' },
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

describe('opportunity zone Texas statewide LOD', () => {
  const texasCdfiFc = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { GEOID10: '48021950600', STATE: '48', STATE_NAME: 'Texas' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-97.4, 30.0], [-97.3, 30.0], [-97.3, 30.1], [-97.4, 30.1], [-97.4, 30.0]]],
        },
      },
      {
        type: 'Feature',
        properties: { GEOID10: '48113018505', STATE: '48', STATE_NAME: 'Texas' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[-96.8, 32.7], [-96.7, 32.7], [-96.7, 32.8], [-96.8, 32.8], [-96.8, 32.7]]],
        },
      },
    ],
  }

  it('pins Texas FIPS and a measured statewide simplification offset', () => {
    expect(TEXAS_OZ_STATE_FIPS).toBe('48')
    expect(TEXAS_OZ_STATEWIDE_MAX_OFFSET).toBe(0.001)
  })

  it('stamps CDFI statewide features with designation + geometry provenance', () => {
    const mapped = stampCdfiOpportunityZoneFeatures(texasCdfiFc, '2026-08-01T12:00:00.000Z', {
      simplified: true,
    })
    expect(mapped.status).toBe('ok')
    expect(mapped.featureCount).toBe(2)
    expect(mapped.provenance.scope).toBe('texas')
    expect(mapped.provenance.simplified).toBe(true)
    expect(mapped.provider).toContain('Texas statewide')
    const first = mapped.geojson.features[0] as { properties?: Record<string, unknown> }
    expect(first.properties?.opportunityZone).toBe(true)
    expect(first.properties?.designationSource).toContain('CDFI Fund')
    expect(first.properties?.geometrySource).toContain('CDFI Fund')
    expect(first.properties?.geometryVintage).toContain('2010')
    expect(first.properties?.lod).toBe('statewide-simplified')
  })

  it('honest-empty when Texas CDFI returns no tracts', () => {
    const mapped = stampCdfiOpportunityZoneFeatures({ type: 'FeatureCollection', features: [] })
    expect(mapped.featureCount).toBe(0)
    expect(mapped.honestEmptyReason).toContain('Texas')
  })

  it('assembleTexas queries CDFI STATE=48 with maxAllowableOffset when simplified', async () => {
    const calls: string[] = []
    const fetchImpl = async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify(texasCdfiFc), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const mapped = await assembleTexasOpportunityZoneLayer({ simplify: true }, fetchImpl)
    expect(mapped.featureCount).toBe(2)
    expect(calls).toHaveLength(1)
    expect(decodeURIComponent(calls[0]!)).toContain(`STATE='${TEXAS_OZ_STATE_FIPS}'`)
    expect(calls[0]).toContain(`maxAllowableOffset=${TEXAS_OZ_STATEWIDE_MAX_OFFSET}`)
    expect(calls[0]).not.toContain('tigerWMS')
  })

  it('assemble scope=texas routes to the statewide path', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify(texasCdfiFc), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    const mapped = await assembleOpportunityZoneLayer({ scope: 'texas', simplify: true }, fetchImpl)
    expect(mapped.provenance.scope).toBe('texas')
    expect(mapped.featureCount).toBe(2)
  })

  it('fetchTexasCdfiOzGeoJson surfaces upstream failures', async () => {
    const fail = async () => new Response('bad', { status: 502 })
    await expect(fetchTexasCdfiOzGeoJson(fail)).rejects.toThrow(/CDFI Texas OZ query failed/)
  })
})
