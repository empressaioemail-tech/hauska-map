// apps/property-explorer/src/lib/situs-search-client.ts
//
// Thin client for the /api/pe-situs-search BFF (cortex TxGIO situs index).
//
// P-353: this module used to read `json.hits` and return the hit array,
// throwing the rest of the body away — which is where the coverage answer
// died for the map (the BFF carried it from 163fde32 onward; nothing here
// could see it). `fetchSitusSearchResult` is now the real client and returns
// the coverage answer BESIDE the suggestions; the old
// `fetchSitusSearchSuggestions` shape is kept as a delegating wrapper so no
// existing call site or test has to change.

import type { SitusSearchHit } from "../../api/_lib/pe-situs-search-core";
import {
  coverageMissFromWire,
  type CoverageMiss,
} from "./coverage-miss";
import {
  placeSearchHitToSuggestion,
  situsQueryVariants,
  type Suggestion,
} from "./search-kinds";

export const PE_SITUS_SEARCH_URL = "/api/pe-situs-search";

/** The `hits` array of a wire body, or an empty array for anything else. */
function situsHitsFromBody(json: unknown): SitusSearchHit[] {
  if (!json || typeof json !== "object") return [];
  const raw = (json as { hits?: unknown }).hits;
  return Array.isArray(raw) ? (raw as SitusSearchHit[]) : [];
}

export interface SitusSearchResult {
  suggestions: Suggestion[];
  /**
   * The coverage answer when the situs index found nothing. Null when hits
   * were found, and null when the BFF served no class at all (nothing is
   * ever defaulted here).
   */
  miss: CoverageMiss | null;
}

/**
 * Query every situs variant and return the union of their usable hits, plus
 * the coverage answer.
 *
 * The MISS is taken from the PRIMARY variant — the query as typed — when it
 * carries one, else from the first variant that does. The variants are
 * derived prefixes (`1308 Pecan Bastrop` also asks `1308 Pecan`), and a
 * derived variant strips exactly the locality the coverage check needs, so
 * letting a derived variant's class outrank the typed query's would be
 * letting the least-informed query answer the most-specific question. Hits
 * keep their existing union behaviour; this rule governs the empty answer.
 */
export async function fetchSitusSearchResult(
  query: string,
  signal: AbortSignal,
  opts?: { baseUrl?: string; limit?: number; fetchImpl?: typeof fetch },
): Promise<SitusSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { suggestions: [], miss: null };

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const limit = opts?.limit ?? 7;
  const variants = situsQueryVariants(trimmed);
  const batches = await Promise.all(
    variants.map(async (q, index) => {
      const qs = new URLSearchParams({ q, limit: String(limit) });
      const res = await fetchImpl(
        `${opts?.baseUrl ?? PE_SITUS_SEARCH_URL}?${qs.toString()}`,
        { method: "GET", signal },
      );
      if (!res.ok) {
        throw new Error(`situs-search ${res.status}`);
      }
      const json = (await res.json()) as unknown;
      const hits = situsHitsFromBody(json);
      return { index, hits, miss: coverageMissFromWire(json) };
    }),
  );
  const seen = new Set<string>();
  const hits = [];
  for (const batch of batches) {
    for (const hit of batch.hits) {
      const key = `${hit.parcelNodeId ?? ""}|${hit.situsAddress}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
    }
  }
  const ordered = [...batches].sort((a, b) => a.index - b.index);
  const miss =
    ordered.find((b) => b.index === 0 && b.miss)?.miss ??
    ordered.find((b) => b.miss)?.miss ??
    null;
  return {
    suggestions: hits
      .map(placeSearchHitToSuggestion)
      .filter((s): s is Suggestion => s != null),
    miss,
  };
}

/** Suggestions only — the shape every existing caller already expects. */
export async function fetchSitusSearchSuggestions(
  query: string,
  signal: AbortSignal,
  opts?: { baseUrl?: string; limit?: number; fetchImpl?: typeof fetch },
): Promise<Suggestion[]> {
  const { suggestions } = await fetchSitusSearchResult(query, signal, opts);
  return suggestions;
}
