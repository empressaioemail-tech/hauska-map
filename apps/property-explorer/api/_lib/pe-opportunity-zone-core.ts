// apps/property-explorer/api/_lib/pe-opportunity-zone-core.ts
//
// Pure helpers for the Property Explorer Opportunity Zone tract BFF. Public
// federal data only — no engine gate, no tenant data, no proprietary sources.
//
// Pipeline (honest join):
//   1. CDFI Fund Opportunity Zones FeatureServer — designated tract GEOID10 list
//      for the viewport (IRS §1400Z designated tracts, ~8,700 nationally).
//   2. U.S. Census Bureau TIGER/Line 2010 census tract polygons for the same
//      viewport (GEOID matches CDFI GEOID10 — OZ designations are frozen on 2010
//      census tract definitions).
//   3. Join: render Census geometry ONLY where GEOID is CDFI-designated.
//
// Every emitted feature carries designation + geometry source strings and
// vintages on its properties for map attribution.

import {
  parseTopoRequest,
  type TopoBbox,
  type TopoRequest,
} from './pe-topography-core.js'

export type OpportunityZoneBbox = TopoBbox
export type OpportunityZoneRequest = TopoRequest

/** CDFI/HUD ArcGIS — designated QOZ census tracts (GEOID10 + metadata). */
export const CDFI_OZ_FEATURE_SERVER =
  'https://services.arcgis.com/VTyQ9soqVukalItT/ArcGIS/rest/services/Opportunity_Zones/FeatureServer/13'

/** Census TIGERweb — 2010 census tract boundaries (matches CDFI GEOID10). */
export const CENSUS_TRACTS_2010_LAYER =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2010/MapServer/14'

/** Official designated-tract list (Excel) cited on CDFI Opportunity Zones page. */
export const CDFI_OZ_LIST_URL =
  'https://www.cdfifund.gov/sites/cdfi/files/documents/designated-qozs.12.14.18.xlsx'

export const OZ_DESIGNATION_SOURCE =
  'CDFI Fund Opportunity Zones FeatureServer (IRS §1400Z designated tracts)'

export const OZ_GEOMETRY_SOURCE =
  'U.S. Census Bureau TIGER/Line (tigerWMS_Census2010 census tracts)'

export const OZ_DESIGNATION_VINTAGE =
  '2018-12-14 designated list (IRS Notices 2018-48, 2019-42; FeatureServer coverage 12/2019)'

export const OZ_GEOMETRY_VINTAGE = 'TIGER/Line 2010 census tracts'

export function parseOpportunityZoneRequest(
  body: unknown,
): { ok: true; request: OpportunityZoneRequest } | { ok: false; message: string } {
  return parseTopoRequest(body)
}

export function bboxToEnvelope(bbox: OpportunityZoneBbox): string {
  return `${bbox.westLng},${bbox.southLat},${bbox.eastLng},${bbox.northLat}`
}

export interface OpportunityZoneProvenance {
  designationSource: string
  designationVintage: string
  designationListUrl: string
  geometrySource: string
  geometryVintage: string
  retrievedAt: string
}

export interface OpportunityZoneLayerResponse {
  geojson: { type: 'FeatureCollection'; features: unknown[] }
  provider: string
  provenance: OpportunityZoneProvenance
  /** Present on honest-empty — no designated tracts intersect this viewport. */
  honestEmptyReason: string | null
  featureCount: number
  status: 'ok' | 'error'
  detail?: string
}

export function opportunityZoneProvenance(retrievedAt = new Date().toISOString()): OpportunityZoneProvenance {
  return {
    designationSource: OZ_DESIGNATION_SOURCE,
    designationVintage: OZ_DESIGNATION_VINTAGE,
    designationListUrl: CDFI_OZ_LIST_URL,
    geometrySource: OZ_GEOMETRY_SOURCE,
    geometryVintage: OZ_GEOMETRY_VINTAGE,
    retrievedAt,
  }
}

export function opportunityZoneProviderLabel(prov?: OpportunityZoneProvenance): string {
  const p = prov ?? opportunityZoneProvenance()
  return `Opportunity Zone — ${p.designationSource} (${p.designationVintage}); geometry: ${p.geometrySource} (${p.geometryVintage})`
}

/** Extract GEOID10 values from a CDFI ArcGIS query response. */
export function geoidsFromCdfiResponse(payload: unknown): string[] {
  const p = payload as { features?: Array<{ attributes?: Record<string, unknown> }> } | null
  const out: string[] = []
  for (const f of p?.features ?? []) {
    const raw = f?.attributes?.GEOID10 ?? f?.attributes?.geoid10
    if (typeof raw === 'string' && raw.trim()) out.push(raw.trim())
  }
  return out
}

/** Join Census tract FC to the CDFI-designated GEOID set; stamp provenance. */
export function joinOpportunityZoneTracts(
  designatedGeoids: string[],
  censusGeoJson: unknown,
  retrievedAt = new Date().toISOString(),
): OpportunityZoneLayerResponse {
  const prov = opportunityZoneProvenance(retrievedAt)
  const oz = new Set(designatedGeoids)
  const g = censusGeoJson as { type?: string; features?: Array<Record<string, unknown>> } | null
  const features: unknown[] = []
  for (const f of g?.features ?? []) {
    const props = (f?.properties ?? {}) as Record<string, unknown>
    const geoidRaw = props.GEOID ?? props.geoid ?? props.GEOID10 ?? props.geoid10
    const geoid = typeof geoidRaw === 'string' ? geoidRaw.trim() : null
    if (!geoid || !oz.has(geoid)) continue
    features.push({
      ...f,
      properties: {
        ...props,
        geoid,
        opportunityZone: true,
        designationSource: prov.designationSource,
        designationVintage: prov.designationVintage,
        designationListUrl: prov.designationListUrl,
        geometrySource: prov.geometrySource,
        geometryVintage: prov.geometryVintage,
        retrievedAt: prov.retrievedAt,
      },
    })
  }
  const honestEmptyReason =
    features.length === 0
      ? designatedGeoids.length === 0
        ? 'no designated Opportunity Zone tracts in this view'
        : 'designated tracts present nationally but no 2010 tract geometry matched in this view'
      : null
  return {
    geojson: { type: 'FeatureCollection', features },
    provider: opportunityZoneProviderLabel(prov),
    provenance: prov,
    honestEmptyReason,
    featureCount: features.length,
    status: 'ok',
  }
}

export type ArcGisFetch = (url: string, init?: RequestInit) => Promise<Response>

function arcGisQueryUrl(baseLayerUrl: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params)
  return `${baseLayerUrl.replace(/\/$/, '')}/query?${q.toString()}`
}

/** Fetch CDFI-designated tract GEOID10 values intersecting the viewport envelope. */
export async function fetchDesignatedGeoidsInBbox(
  bbox: OpportunityZoneBbox,
  fetchImpl: ArcGisFetch = fetch,
  signal?: AbortSignal,
): Promise<string[]> {
  const url = arcGisQueryUrl(CDFI_OZ_FEATURE_SERVER, {
    geometry: bboxToEnvelope(bbox),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'GEOID10',
    returnGeometry: 'false',
    f: 'json',
  })
  const res = await fetchImpl(url, { signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`CDFI OZ query failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const body = await res.json()
  return geoidsFromCdfiResponse(body)
}

/** Fetch 2010 census tract polygons intersecting the viewport envelope. */
export async function fetchCensusTractsInBbox(
  bbox: OpportunityZoneBbox,
  fetchImpl: ArcGisFetch = fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = arcGisQueryUrl(CENSUS_TRACTS_2010_LAYER, {
    geometry: bboxToEnvelope(bbox),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'GEOID,NAME',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  })
  const res = await fetchImpl(url, { signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Census TIGER tract query failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json()
}

/**
 * Assemble the Opportunity Zone tract layer for a viewport bbox — the full
 * public-data join. Injectable fetch for unit tests.
 */
export async function assembleOpportunityZoneLayer(
  req: OpportunityZoneRequest,
  fetchImpl: ArcGisFetch = fetch,
  signal?: AbortSignal,
): Promise<OpportunityZoneLayerResponse> {
  const retrievedAt = new Date().toISOString()
  const designated = await fetchDesignatedGeoidsInBbox(req.bbox, fetchImpl, signal)
  const census = await fetchCensusTractsInBbox(req.bbox, fetchImpl, signal)
  return joinOpportunityZoneTracts(designated, census, retrievedAt)
}
