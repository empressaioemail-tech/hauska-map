// apps/property-explorer/api/_lib/pe-situs-search-core.ts
//
// Pure helpers for the Property Explorer situs-search BFF (authoritative
// TxGIO parcel situs prefix index via cortex). Framework-free for unit tests.

export const DEFAULT_CORTEX_URL =
  'https://cortex-api-tds7av26va-uc.a.run.app'

export const SITUS_SEARCH_DEFAULT_LIMIT = 7
export const SITUS_SEARCH_MAX_LIMIT = 10

export interface SitusSearchHit {
  parcelNodeId: string
  situsAddress: string
  countyFips: string
}

export interface SitusSearchWireResponse {
  hits: SitusSearchHit[]
}

export interface SitusSearchParams {
  q: string
  limit: number
}

export function cortexBaseUrl(): string {
  return (process.env.CORTEX_API_URL?.trim() || DEFAULT_CORTEX_URL).replace(
    /\/$/,
    '',
  )
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
  return (
    typeof r.parcelNodeId === 'string' &&
    r.parcelNodeId.trim().length > 0 &&
    typeof r.situsAddress === 'string' &&
    r.situsAddress.trim().length > 0 &&
    typeof r.countyFips === 'string' &&
    r.countyFips.trim().length > 0
  )
}

/** Map cortex JSON to wire hits; drops malformed rows. */
export function mapSitusSearchResponse(json: unknown): SitusSearchWireResponse {
  const body = json as { hits?: unknown } | null
  const raw = Array.isArray(body?.hits) ? body!.hits : []
  const hits = raw.filter(isSitusHit).map((h) => ({
    parcelNodeId: h.parcelNodeId.trim(),
    situsAddress: h.situsAddress.trim(),
    countyFips: h.countyFips.trim(),
  }))
  return { hits }
}
