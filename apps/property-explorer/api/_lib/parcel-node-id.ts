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
