// apps/property-explorer/src/lib/situs-search-client.ts
//
// Thin client for the /api/pe-situs-search BFF (cortex TxGIO situs index).

import type { SitusSearchWireResponse } from "../../api/_lib/pe-situs-search-core";
import {
  placeSearchHitToSuggestion,
  situsQueryVariants,
  type Suggestion,
} from "./search-kinds";

export const PE_SITUS_SEARCH_URL = "/api/pe-situs-search";

export async function fetchSitusSearchSuggestions(
  query: string,
  signal: AbortSignal,
  opts?: { baseUrl?: string; limit?: number; fetchImpl?: typeof fetch },
): Promise<Suggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const limit = opts?.limit ?? 7;
  const variants = situsQueryVariants(trimmed);
  const batches = await Promise.all(
    variants.map(async (q) => {
      const qs = new URLSearchParams({ q, limit: String(limit) });
      const res = await fetchImpl(
        `${opts?.baseUrl ?? PE_SITUS_SEARCH_URL}?${qs.toString()}`,
        { method: "GET", signal },
      );
      if (!res.ok) {
        throw new Error(`situs-search ${res.status}`);
      }
      const json = (await res.json()) as SitusSearchWireResponse;
      return Array.isArray(json?.hits) ? json.hits : [];
    }),
  );
  const seen = new Set<string>();
  const hits = [];
  for (const batch of batches) {
    for (const hit of batch) {
      const key = `${hit.parcelNodeId ?? ""}|${hit.situsAddress}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
    }
  }
  return hits
    .map(placeSearchHitToSuggestion)
    .filter((s): s is Suggestion => s != null);
}
