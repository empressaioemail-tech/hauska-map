// apps/property-explorer/api/_lib/pe-opportunity-zone-core.ts
//
// Pure helpers for the Property Explorer Opportunity Zone tract BFF. Public
// federal data only — no engine gate, no tenant data, no proprietary sources.
//
// Two assemble modes:
//   1. scope=texas — one-shot statewide Texas (STATE=48) designated tracts from
//      the CDFI FeatureServer with optional ArcGIS maxAllowableOffset
//      simplification for the regional-pattern LOD (~628 tracts; unsimplified
//      GeoJSON is ~20MB and exceeds the serverless response budget).
//   2. viewport bbox — CDFI designation GEOIDs × Census TIGER/Line 2010 tract
//      polygons for full-detail geometry in the current view.
//
// Every emitted feature carries designation + geometry source strings and
// vintages on its properties for map attribution. Never pulls the national
// ~8,700-tract set.

import {
  parseTopoRequest,
  type TopoBbox,
  type TopoRequest,
} from './pe-topography-core.js'

export type OpportunityZoneBbox = TopoBbox

/** Viewport detail request (existing bbox path). */
export type OpportunityZoneViewportRequest = TopoRequest & {
  scope?: 'viewport'
}

/** Statewide Texas regional-pattern request — no bbox required. */
export type OpportunityZoneTexasRequest = {
  scope: 'texas'
  /**
   * When true (default), apply TEXAS_OZ_STATEWIDE_MAX_OFFSET so the statewide
   * payload stays under the serverless response budget.
   */
  simplify?: boolean
}

export type OpportunityZoneRequest =
  | OpportunityZoneViewportRequest
  | OpportunityZoneTexasRequest

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

/** Geometry citation when polygons are served from the CDFI FeatureServer itself. */
export const OZ_GEOMETRY_SOURCE_CDFI =
  'CDFI Fund Opportunity Zones FeatureServer (2010 census tract polygons)'

export const OZ_DESIGNATION_VINTAGE =
  '2018-12-14 designated list (IRS Notices 2018-48, 2019-42; FeatureServer coverage 12/2019)'

export const OZ_GEOMETRY_VINTAGE = 'TIGER/Line 2010 census tracts'

/** Texas FIPS — statewide OZ scope is Texas-only (never the national set). */
export const TEXAS_OZ_STATE_FIPS = '48'

/**
 * ArcGIS maxAllowableOffset (degrees, outSR=4326) for the statewide LOD.
 * Measured 2026-08-01: unsimplified TX set ≈19.5MB / 526k verts; 0.001° ≈0.59MB /
 * 25k verts — pockets readable statewide, fits the Vercel response budget.
 */
export const TEXAS_OZ_STATEWIDE_MAX_OFFSET = 0.001

export function parseOpportunityZoneRequest(
  body: unknown,
): { ok: true; request: OpportunityZoneRequest } | { ok: false; message: string } {
  const b = (typeof body === 'string' ? safeJson(body) : body) as
    | Record<string, unknown>
    | null
  if (!b || typeof b !== 'object') {
    return { ok: false, message: 'body must be a JSON object' }
  }
  if (b.scope === 'texas') {
    return {
      ok: true,
      request: {
        scope: 'texas',
        simplify: b.simplify === undefined ? true : Boolean(b.simplify),
      },
    }
  }
  const parsed = parseTopoRequest(body)
  if (!parsed.ok) return parsed
  return { ok: true, request: { ...parsed.request, scope: 'viewport' } }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
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
  /** Present on the statewide LOD path. */
  scope?: 'texas' | 'viewport'
  simplified?: boolean
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

export function opportunityZoneProvenance(
  retrievedAt = new Date().toISOString(),
  opts?: {
    geometrySource?: string
    scope?: 'texas' | 'viewport'
    simplified?: boolean
  },
): OpportunityZoneProvenance {
  return {
    designationSource: OZ_DESIGNATION_SOURCE,
    designationVintage: OZ_DESIGNATION_VINTAGE,
    designationListUrl: CDFI_OZ_LIST_URL,
    geometrySource: opts?.geometrySource ?? OZ_GEOMETRY_SOURCE,
    geometryVintage: OZ_GEOMETRY_VINTAGE,
    retrievedAt,
    ...(opts?.scope ? { scope: opts.scope } : {}),
    ...(opts?.simplified !== undefined ? { simplified: opts.simplified } : {}),
  }
}

export function opportunityZoneProviderLabel(prov?: OpportunityZoneProvenance): string {
  const p = prov ?? opportunityZoneProvenance()
  const lod =
    p.scope === 'texas'
      ? p.simplified
        ? '; Texas statewide (simplified LOD)'
        : '; Texas statewide'
      : ''
  return `Opportunity Zone — ${p.designationSource} (${p.designationVintage}); geometry: ${p.geometrySource} (${p.geometryVintage})${lod}`
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
  const prov = opportunityZoneProvenance(retrievedAt, { scope: 'viewport' })
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

/**
 * Stamp provenance onto CDFI FeatureServer GeoJSON features (statewide path).
 * CDFI hosts the designated-tract polygons (2010 census tract definitions).
 */
export function stampCdfiOpportunityZoneFeatures(
  cdfiGeoJson: unknown,
  retrievedAt = new Date().toISOString(),
  opts?: { simplified?: boolean },
): OpportunityZoneLayerResponse {
  const simplified = opts?.simplified === true
  const prov = opportunityZoneProvenance(retrievedAt, {
    geometrySource: OZ_GEOMETRY_SOURCE_CDFI,
    scope: 'texas',
    simplified,
  })
  const g = cdfiGeoJson as { type?: string; features?: Array<Record<string, unknown>> } | null
  const features: unknown[] = []
  for (const f of g?.features ?? []) {
    const props = (f?.properties ?? {}) as Record<string, unknown>
    const geoidRaw = props.GEOID10 ?? props.geoid10 ?? props.GEOID ?? props.geoid
    const geoid = typeof geoidRaw === 'string' ? geoidRaw.trim() : null
    if (!geoid) continue
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
        lod: simplified ? 'statewide-simplified' : 'statewide-full',
      },
    })
  }
  return {
    geojson: { type: 'FeatureCollection', features },
    provider: opportunityZoneProviderLabel(prov),
    provenance: prov,
    honestEmptyReason:
      features.length === 0 ? 'no designated Opportunity Zone tracts in Texas (STATE=48)' : null,
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
 * Fetch all Texas (STATE=48) designated OZ tract polygons from CDFI in one shot.
 * Optional maxAllowableOffset keeps the statewide LOD under the response budget.
 */
export async function fetchTexasCdfiOzGeoJson(
  fetchImpl: ArcGisFetch = fetch,
  signal?: AbortSignal,
  opts?: { maxAllowableOffset?: number },
): Promise<unknown> {
  const params: Record<string, string> = {
    where: `STATE='${TEXAS_OZ_STATE_FIPS}'`,
    outFields: 'GEOID10,STATE,STATE_NAME,COUNTY,TRACT',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  }
  if (typeof opts?.maxAllowableOffset === 'number' && Number.isFinite(opts.maxAllowableOffset)) {
    params.maxAllowableOffset = String(opts.maxAllowableOffset)
  }
  const url = arcGisQueryUrl(CDFI_OZ_FEATURE_SERVER, params)
  const res = await fetchImpl(url, { signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`CDFI Texas OZ query failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json()
}

/** Assemble the Texas statewide OZ layer (regional-pattern LOD). */
export async function assembleTexasOpportunityZoneLayer(
  opts: { simplify?: boolean } = {},
  fetchImpl: ArcGisFetch = fetch,
  signal?: AbortSignal,
): Promise<OpportunityZoneLayerResponse> {
  const simplify = opts.simplify !== false
  const retrievedAt = new Date().toISOString()
  const cdfi = await fetchTexasCdfiOzGeoJson(fetchImpl, signal, {
    maxAllowableOffset: simplify ? TEXAS_OZ_STATEWIDE_MAX_OFFSET : undefined,
  })
  return stampCdfiOpportunityZoneFeatures(cdfi, retrievedAt, { simplified: simplify })
}

/**
 * Assemble the Opportunity Zone tract layer — Texas statewide or viewport
 * detail. Injectable fetch for unit tests.
 */
export async function assembleOpportunityZoneLayer(
  req: OpportunityZoneRequest,
  fetchImpl: ArcGisFetch = fetch,
  signal?: AbortSignal,
): Promise<OpportunityZoneLayerResponse> {
  if (req.scope === 'texas') {
    return assembleTexasOpportunityZoneLayer(
      { simplify: req.simplify !== false },
      fetchImpl,
      signal,
    )
  }
  const retrievedAt = new Date().toISOString()
  const designated = await fetchDesignatedGeoidsInBbox(req.bbox, fetchImpl, signal)
  const census = await fetchCensusTractsInBbox(req.bbox, fetchImpl, signal)
  return joinOpportunityZoneTracts(designated, census, retrievedAt)
}
