// apps/property-explorer/src/lib/situs-search-client.ts
//
// Thin client for the /api/pe-situs-search BFF (cortex TxGIO situs index).

import type { SitusSearchWireResponse } from "../../api/_lib/pe-situs-search-core";
import { situsHitToSuggestion, type Suggestion } from "./search-kinds";

export const PE_SITUS_SEARCH_URL = "/api/pe-situs-search";

export async function fetchSitusSearchSuggestions(
  query: string,
  signal: AbortSignal,
  opts?: { baseUrl?: string; limit?: number; fetchImpl?: typeof fetch },
): Promise<Suggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const qs = new URLSearchParams({
    q: trimmed,
    limit: String(opts?.limit ?? 7),
  });
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `${opts?.baseUrl ?? PE_SITUS_SEARCH_URL}?${qs.toString()}`,
    { method: "GET", signal },
  );
  if (!res.ok) {
    throw new Error(`situs-search ${res.status}`);
  }
  const json = (await res.json()) as SitusSearchWireResponse;
  const hits = Array.isArray(json?.hits) ? json.hits : [];
  return hits
    .map(situsHitToSuggestion)
    .filter((s): s is Suggestion => s != null);
}
