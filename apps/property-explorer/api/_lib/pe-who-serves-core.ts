/**
 * P-75 who-serves BFF core — proxy to cortex GET /api/who-serves.
 *
 * A miss is holders [] plus the fixed residual sentence, never HTTP 200 {}.
 * TCEQ additive rows stay complementary who-governs (water-district), never
 * restated as water CCN.
 *
 * Pure wire helpers live here (no Node env) so src/ can import them under the
 * app tsconfig. Server fetch passes baseUrl from the BFF handler.
 */

export const WHO_SERVES_RESIDUAL =
  'SERVICE-LETTER-REQUIRED — territory is not tap/capacity/extension commitment.'

export const WHO_SERVES_SERVICE_KINDS = [
  'water',
  'sewer',
  'electric',
  'water-district',
] as const

export type WhoServesServiceKind = (typeof WHO_SERVES_SERVICE_KINDS)[number]

export type WhoServesHolder = {
  source_key: string
  service_kind: WhoServesServiceKind
  territory_id: string
  territory_name: string | null
}

export type WhoServesMeasured = {
  status: 'measured'
  holders: WhoServesHolder[]
  residual: typeof WHO_SERVES_RESIDUAL
  asOf: string | null
}

export type WhoServesUnmeasured = {
  status: 'unmeasured'
  basis: string
  holders: []
  asOf: null
}

export type WhoServesSection = WhoServesMeasured | WhoServesUnmeasured

export type ParseWhoServesParamsResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; message: string }

export function parseWhoServesParams(
  query: Record<string, unknown>,
): ParseWhoServesParamsResult {
  const lat = Number(query.lat)
  const lng = Number(query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      ok: false,
      message: 'GET /api/pe-who-serves requires finite lat and lng query params.',
    }
  }
  if (lat === 0 && lng === 0) {
    return {
      ok: false,
      message: 'who-serves refused a degenerate (0,0) query point.',
    }
  }
  return { ok: true, lat, lng }
}

export function buildWhoServesUpstreamUrl(
  baseUrl: string,
  lat: number,
  lng: number,
): string {
  const base = baseUrl.replace(/\/$/, '')
  const qs = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  })
  return `${base}/api/who-serves?${qs.toString()}`
}

const SERVICE_KIND_SET = new Set<string>(WHO_SERVES_SERVICE_KINDS)

export function isWhoServesServiceKind(
  value: string,
): value is WhoServesServiceKind {
  return SERVICE_KIND_SET.has(value)
}

export function assertWhoServesSection(value: unknown): WhoServesSection {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('who-serves section must be a non-array object')
  }
  const rec = value as Record<string, unknown>
  if (rec.status === 'unmeasured') {
    if (typeof rec.basis !== 'string' || rec.basis.length === 0) {
      throw new Error('who-serves unmeasured requires a basis')
    }
    if ('residual' in rec) {
      throw new Error(
        'who-serves unmeasured must not carry SERVICE-LETTER-REQUIRED as if a search ran',
      )
    }
    if (!Array.isArray(rec.holders) || rec.holders.length !== 0) {
      throw new Error('who-serves unmeasured holders must be []')
    }
    return value as WhoServesSection
  }
  if (!('holders' in rec) || !('residual' in rec)) {
    throw new Error(
      'who-serves empty-object success is refused: holders and residual are required',
    )
  }
  if (!Array.isArray(rec.holders)) {
    throw new Error('who-serves holders must be an array')
  }
  if (rec.residual !== WHO_SERVES_RESIDUAL) {
    throw new Error(
      'who-serves residual must be the exact SERVICE-LETTER-REQUIRED sentence',
    )
  }
  for (const holder of rec.holders) {
    if (!holder || typeof holder !== 'object') {
      throw new Error('who-serves holder must be an object')
    }
    const h = holder as Record<string, unknown>
    if (
      typeof h.source_key !== 'string' ||
      typeof h.service_kind !== 'string' ||
      typeof h.territory_id !== 'string'
    ) {
      throw new Error(
        'who-serves holder missing source_key, service_kind, or territory_id',
      )
    }
    if (!isWhoServesServiceKind(h.service_kind)) {
      throw new Error(
        `who-serves holder has unknown service_kind ${JSON.stringify(h.service_kind)}`,
      )
    }
    if (h.source_key === 'tceq-water-districts' && h.service_kind === 'water') {
      throw new Error('who-serves refused TCEQ additive row restated as water CCN')
    }
  }
  return value as WhoServesSection
}

/** Card-facing summary from a validated who-serves section. */
export function formatWhoServesDisplay(section: WhoServesSection): {
  state: 'present' | 'absent'
  summary: string
  residual: string | null
} {
  if (section.status === 'unmeasured') {
    return {
      state: 'absent',
      summary: section.basis,
      residual: null,
    }
  }
  const holderLines = section.holders.map((h) => {
    const name = h.territory_name?.trim()
    const label = name ? `${h.service_kind} — ${name}` : h.service_kind
    return label
  })
  const summary =
    holderLines.length > 0
      ? holderLines.join(' · ')
      : 'No territory holders at this point'
  return {
    state: 'present',
    summary,
    residual: section.residual,
  }
}

export async function fetchWhoServesFromCortex(
  lat: number,
  lng: number,
  opts: {
    baseUrl: string
    apiKey?: string
    fetchImpl?: typeof fetch
  },
): Promise<WhoServesSection> {
  const baseUrl = opts.baseUrl.replace(/\/$/, '')
  const apiKey = opts.apiKey?.trim()
  if (!apiKey) {
    throw new Error('CORTEX_SERVICE_API_KEY not configured')
  }
  const fetchImpl = opts.fetchImpl ?? fetch
  const url = buildWhoServesUpstreamUrl(baseUrl, lat, lng)
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`who-serves upstream ${res.status}${text ? `: ${text}` : ''}`)
  }
  const json = (await res.json().catch(() => null)) as unknown
  return assertWhoServesSection(json)
}
