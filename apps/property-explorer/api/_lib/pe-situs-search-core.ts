// apps/property-explorer/api/_lib/pe-situs-search-core.ts
//
// Pure helpers for the Property Explorer situs-search BFF (authoritative
// TxGIO parcel situs prefix index via cortex). Framework-free for unit tests.

export const SITUS_SEARCH_DEFAULT_LIMIT = 7
export const SITUS_SEARCH_MAX_LIMIT = 10

export interface SitusSearchHit {
  parcelNodeId: string | null
  situsAddress: string
  countyFips: string
  latitude?: number | null
  longitude?: number | null
  source?: 'parcel-situs' | 'address-point'
}

/**
 * The four classes a customer can be owed when a search finds nothing
 * (P-205 / OPS-24 P-353), plus the budget refuse cortex can also emit.
 * `(string & {})` keeps the four names autocompleted while letting an
 * unknown future class pass through UNCHANGED rather than being coerced
 * into one of ours — a class we do not recognise is not a class we may
 * relabel.
 */
export type SitusSearchMissClass =
  | 'no-hit'
  | 'county_out_of_coverage'
  | 'out_of_coverage'
  | 'coverage_check_unavailable'
  | 'situs-search-budget-exceeded'
  | (string & {})

/** Present only when `missClass` is `county_out_of_coverage`. */
export interface SitusSearchOutOfCoverageCounty {
  countyFips: string
  countyName: string
  state: string
}

export interface SitusSearchWireResponse {
  hits: SitusSearchHit[]
  /**
   * P-353: cortex's coverage answer, carried beside `hits` and NOT dropped.
   * Absent when the search found hits, and absent when cortex sent none —
   * this module never invents a class (a fabricated `no-hit` would be the
   * P-205 collapse wearing the fix's clothes).
   */
  missClass?: SitusSearchMissClass
  /** Present only on `county_out_of_coverage`. */
  outOfCoverageCounty?: SitusSearchOutOfCoverageCounty
  /** Present only on `out_of_coverage`; the recognised state code, e.g. "CO". */
  outOfCoverageState?: string
  /** Present only on `coverage_check_unavailable`: why the check could not answer. */
  coverageCheckUnavailableReason?: string
  /**
   * Not emitted by cortex today (it is MCP-side vocabulary). Carried through
   * when a future upstream sends one, so the BFF is never the thing that
   * drops it.
   */
  missClassDisplayText?: string
}

export interface SitusSearchParams {
  q: string
  limit: number
}

/** Validate + normalise query params into SitusSearchParams, or an error message. */
export function parseSitusSearchParams(
  query: Record<string, unknown>,
): { ok: true; params: SitusSearchParams } | { ok: false; message: string } {
  const rawQ = query.q
  const q = typeof rawQ === 'string' ? rawQ.trim() : ''
  if (!q) return { ok: false, message: 'q is required' }
  if (q.length > 256) return { ok: false, message: 'q too long (max 256 chars)' }

  const rawLimit = query.limit
  let limit = SITUS_SEARCH_DEFAULT_LIMIT
  if (rawLimit != null && rawLimit !== '') {
    const n =
      typeof rawLimit === 'string' ? Number(rawLimit) : typeof rawLimit === 'number' ? rawLimit : NaN
    if (!Number.isFinite(n) || n < 1 || n > SITUS_SEARCH_MAX_LIMIT) {
      return {
        ok: false,
        message: `limit must be 1-${SITUS_SEARCH_MAX_LIMIT}`,
      }
    }
    limit = Math.floor(n)
  }

  return { ok: true, params: { q, limit } }
}

export function buildCortexSitusSearchUrl(
  cortexBase: string,
  params: SitusSearchParams,
): string {
  const qs = new URLSearchParams({
    q: params.q,
    limit: String(params.limit),
  })
  return `${cortexBase.replace(/\/$/, '')}/api/brokerage/v1/place/situs-search?${qs.toString()}`
}

function isSitusHit(v: unknown): v is SitusSearchHit {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const r = v as Record<string, unknown>
  const situs = typeof r.situsAddress === 'string' ? r.situsAddress.trim() : ''
  const fips = typeof r.countyFips === 'string' ? r.countyFips.trim() : ''
  if (!situs || !fips) return false
  const nodeId = typeof r.parcelNodeId === 'string' ? r.parcelNodeId.trim() : ''
  const lat = r.latitude
  const lng = r.longitude
  const hasPoint =
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    typeof lng === 'number' &&
    Number.isFinite(lng)
  if (nodeId) return true
  return hasPoint
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function outOfCoverageCounty(
  v: unknown,
): SitusSearchOutOfCoverageCounty | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const r = v as Record<string, unknown>
  const countyFips = nonEmptyString(r.countyFips)
  const countyName = nonEmptyString(r.countyName)
  const state = nonEmptyString(r.state)
  if (!countyFips || !countyName || !state) return undefined
  return { countyFips, countyName, state }
}

/**
 * P-353. The coverage answer cortex computed, attached beside `hits`.
 *
 * Two rules, and they are the whole of this function:
 *   1. A search that found hits is UNCHANGED — `{ hits }` and nothing else.
 *      The coverage question was never asked, so an answer to it would be a
 *      lie about what happened.
 *   2. An empty search carries whatever cortex gave us, VERBATIM, or no
 *      class at all when cortex gave none. Each field is validated for shape
 *      and otherwise not touched: not gated on the class it "belongs" to
 *      (a class/field mismatch upstream is upstream's to own, and dropping
 *      the field here would hide it), and never inferred from `hits.length`.
 */
function coverageAnswer(json: unknown): Partial<SitusSearchWireResponse> {
  const body = json as Record<string, unknown> | null
  const missClass = nonEmptyString(body?.missClass)
  if (!missClass) return {}
  const out: Partial<SitusSearchWireResponse> = { missClass }
  const county = outOfCoverageCounty(body?.outOfCoverageCounty)
  if (county) out.outOfCoverageCounty = county
  const state = nonEmptyString(body?.outOfCoverageState)
  if (state) out.outOfCoverageState = state
  const reason = nonEmptyString(body?.coverageCheckUnavailableReason)
  if (reason) out.coverageCheckUnavailableReason = reason
  const displayText = nonEmptyString(body?.missClassDisplayText)
  if (displayText) out.missClassDisplayText = displayText
  return out
}

/** Map cortex JSON to wire hits; drops malformed rows. */
export function mapSitusSearchResponse(json: unknown): SitusSearchWireResponse {
  const body = json as { hits?: unknown } | null
  const raw = Array.isArray(body?.hits) ? body!.hits : []
  const hits = raw.filter(isSitusHit).map((h) => ({
    parcelNodeId:
      typeof h.parcelNodeId === 'string' && h.parcelNodeId.trim()
        ? h.parcelNodeId.trim()
        : null,
    situsAddress: h.situsAddress.trim(),
    countyFips: h.countyFips.trim(),
    latitude:
      typeof h.latitude === 'number' && Number.isFinite(h.latitude)
        ? h.latitude
        : null,
    longitude:
      typeof h.longitude === 'number' && Number.isFinite(h.longitude)
        ? h.longitude
        : null,
    source:
      h.source === 'address-point' || h.source === 'parcel-situs'
        ? h.source
        : undefined,
  }))
  // Rule 1: hits present → the old body, byte for byte.
  if (hits.length > 0) return { hits }
  return { hits, ...coverageAnswer(json) }
}

/**
 * The BFF's own refusal to guess: a failure to OBTAIN an answer is not a
 * miss. Served as `coverage_check_unavailable` so a timeout or a refusing
 * upstream reads to the customer as "we could not check coverage", never as
 * "no results" (dispatch item 4).
 */
export function coverageUnavailableResponse(
  reason: string,
): SitusSearchWireResponse {
  return {
    hits: [],
    missClass: 'coverage_check_unavailable',
    coverageCheckUnavailableReason: reason,
  }
}
