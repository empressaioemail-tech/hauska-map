/**
 * Canonical parcel-node-id shape (G6 / F1b).
 *
 * ONE regex shared by PE BFFs and CI. MCP gate must use the same source
 * string (`PARCEL_NODE_ID_SOURCE`) — see hauska-mcp-server property-atom-chain
 * and the CI assertion in parcel-node-id.test.ts.
 *
 * Shape: `{5-digit FIPS}:{propId}` where propId is non-empty and has no `/`
 * or whitespace. Digits-only propIds are the Central-TX norm; alpha propIds
 * remain valid where jurisdictions use them.
 */
export const PARCEL_NODE_ID_SOURCE = String.raw`^\d{5}:[^/\s]+$`

export const PARCEL_NODE_ID_RE = new RegExp(PARCEL_NODE_ID_SOURCE)

export function isValidParcelNodeId(value: unknown): value is string {
  return typeof value === 'string' && PARCEL_NODE_ID_RE.test(value.trim())
}

export function normalizeParcelNodeId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return PARCEL_NODE_ID_RE.test(trimmed) ? trimmed : null
}

/**
 * Exact CAD pad suffix for the dual-grammar pair (WDLL 5 / BP-PARCEL-KEY-01).
 * Strip or add this trailing suffix on propId only. No other suffixes.
 */
export const PARCEL_PAD_SUFFIX = '.00000000'

/**
 * Other grammar for a requested parcelNodeId, or null if there is no pair.
 * `48021:34137` <-> `48021:34137.00000000`. Refuses `.1` / `.00000001` / any
 * non-exact pad. Lookup alias only — never a store re-key.
 */
export function parcelGrammarAlias(parcelNodeId: string): string | null {
  const normalized = normalizeParcelNodeId(parcelNodeId)
  if (!normalized) return null
  const colon = normalized.indexOf(':')
  if (colon < 0) return null
  const fips = normalized.slice(0, colon)
  const propId = normalized.slice(colon + 1)
  if (!propId) return null
  if (propId.endsWith(PARCEL_PAD_SUFFIX) && propId.length > PARCEL_PAD_SUFFIX.length) {
    const stripped = propId.slice(0, -PARCEL_PAD_SUFFIX.length)
    if (!stripped || stripped.endsWith('.')) return null
    return `${fips}:${stripped}`
  }
  if (propId.includes('.')) return null
  return `${fips}:${propId}${PARCEL_PAD_SUFFIX}`
}

export function parcelGrammarPair(parcelNodeId: string): {
  requested: string
  alias: string | null
} {
  const requested = normalizeParcelNodeId(parcelNodeId)
  if (!requested) {
    return {
      requested: typeof parcelNodeId === 'string' ? parcelNodeId.trim() : '',
      alias: null,
    }
  }
  const alias = parcelGrammarAlias(requested)
  return { requested, alias: alias && alias !== requested ? alias : null }
}

/**
 * Keep the customer's requested parcelNodeId on inspect JSON. Warden treats a
 * mismatched echo as unhealthy. Does not rewrite URL identity.
 */
export function echoRequestedParcelNodeId<T>(body: T, requested: string): T {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  const next: Record<string, unknown> = {
    ...(body as Record<string, unknown>),
    parcelNodeId: requested,
  }
  const facets = next['facets']
  if (facets && typeof facets === 'object' && !Array.isArray(facets)) {
    next['facets'] = {
      ...(facets as Record<string, unknown>),
      parcelNodeId: requested,
    }
  }
  return next as T
}
