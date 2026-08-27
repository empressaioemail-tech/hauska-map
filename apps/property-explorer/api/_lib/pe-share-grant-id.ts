// Client-safe grant-id helpers. No node: imports — the SPA share landing
// reads these. The Node mint/store stay in pe-share-grant.ts.

/** UUID (any RFC-4122 version). Not an HMAC (those contain a '.'). */
export const SHARE_GRANT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isShareGrantId(value: unknown): value is string {
  return typeof value === "string" && SHARE_GRANT_ID_RE.test(value)
}

/** SPA path a human browser should land on for a grant-id share (W2.1). */
export function shareAppLandingPath(grantId: string): string {
  if (!isShareGrantId(grantId)) {
    throw new Error("grant_id_required")
  }
  return `/share?g=${grantId}`
}

/**
 * True when GET /s/{id} is a browser document navigation and must 302 to
 * the SPA. Explicit format= (json / agent / html / markdown) stays the
 * instrument — that is how models fetch. A check observed only passing
 * is not a check: format=html + dest=document must NOT redirect.
 */
export function isBrowserShareNavigation(input: {
  queryFormat?: string | null
  secFetchDest?: string | null
  secFetchMode?: string | null
}): boolean {
  const format = input.queryFormat?.trim().toLowerCase() ?? ""
  if (
    format === "json" ||
    format === "agent" ||
    format === "html" ||
    format === "markdown"
  ) {
    return false
  }
  return input.secFetchDest === "document" || input.secFetchMode === "navigate"
}
