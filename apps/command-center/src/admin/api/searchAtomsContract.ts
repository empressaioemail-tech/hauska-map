// apps/command-center/src/admin/api/searchAtomsContract.ts
//
// Client-side contract helpers for the MCP `search_atoms` tool.
//
// ENTITY TYPES — the tool's `entity_type` enum is HYPHENATED. Verified against
// the live introspection catalog (GET /api/spine/mcp-introspection/tools/
// search_atoms on the deployed console, 2026-07-14):
//   enum: ["code-section","code-definition","code-amendment",
//          "code-cross-reference","code-edition","jurisdiction-corpus"]
// Sending underscored values (e.g. code_section) is rejected upstream with
// JSON-RPC -32602 invalid_enum_value — never convert hyphens to underscores.
//
// JURISDICTION — the tool matches EXACT underscored tenant ids only (live
// probe 2026-07-14: jurisdiction "bastrop_tx" → rows; "bastrop-tx" and
// "Bastrop, TX" → silent 0 rows). normalizeJurisdiction maps operator input
// onto that shape client-side so free-form entry doesn't silently zero out;
// panels surface the normalized value so a genuine 0-row result stays
// interpretable.

export const SEARCH_ATOMS_ENTITY_TYPES = [
  'code-section',
  'code-definition',
  'code-amendment',
  'code-cross-reference',
  'code-edition',
  'jurisdiction-corpus',
] as const

export type SearchAtomsEntityType = (typeof SEARCH_ATOMS_ENTITY_TYPES)[number]

/** Normalize free-form jurisdiction input to the underscored tenant-id shape
 *  search_atoms matches on: lowercase, every run of punctuation/whitespace →
 *  a single underscore, leading/trailing underscores stripped.
 *  "Bastrop, TX" → "bastrop_tx" · "bastrop-tx" → "bastrop_tx" ·
 *  "bastrop_tx" → "bastrop_tx" · "  " → "". */
export function normalizeJurisdiction(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
