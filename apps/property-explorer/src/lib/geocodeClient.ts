// apps/property-explorer/src/lib/geocodeClient.ts
//
// Thin client for the /api/pe-geocode BFF (Photon proxy). Passes the current
// map center as viewport BIAS so nearer results rank first (Photon does
// location bias natively). Caller owns debounce + AbortController (the
// suggest controller in search-suggest.ts).

import type { GeocodeWireResponse } from "../../api/_lib/pe-geocode-core";
import {
  featureToSuggestion,
  isBareHouseStreetQuery,
  mergeSearchSuggestions,
  type Suggestion,
} from "./search-kinds";
import { coverageMissSentence, isOutOfCoverage } from "./coverage-miss";
import { fetchSitusSearchResult } from "./situs-search-client";

export const PE_GEOCODE_URL = "/api/pe-geocode";

export interface GeocodeBias {
  lat: number;
  lng: number;
  zoom?: number | null;
}

export async function fetchGeocodeSuggestions(
  query: string,
  bias: GeocodeBias | null,
  signal: AbortSignal,
  opts?: { baseUrl?: string; limit?: number; fetchImpl?: typeof fetch },
): Promise<Suggestion[]> {
  const qs = new URLSearchParams({ q: query, limit: String(opts?.limit ?? 7) });
  if (bias) {
    qs.set("lat", String(bias.lat));
    qs.set("lon", String(bias.lng));
    if (bias.zoom != null && Number.isFinite(bias.zoom)) {
      qs.set("zoom", String(Math.round(bias.zoom)));
    }
  }
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const res = await fetchImpl(`${opts?.baseUrl ?? PE_GEOCODE_URL}?${qs.toString()}`, {
    method: "GET",
    signal,
  });
  if (!res.ok) {
    throw new Error(`geocode ${res.status}`);
  }
  const json = (await res.json()) as GeocodeWireResponse;
  const features = Array.isArray(json?.features) ? json.features : [];
  return features
    .map(featureToSuggestion)
    .filter((s): s is Suggestion => s != null);
}

export interface MergedSearchResult {
  suggestions: Suggestion[];
  /**
   * P-353. Set only when the situs leg said the PLACE is outside the area we
   * cover (`county_out_of_coverage` / `out_of_coverage`). The sentence is
   * ready to read; no surface re-words it.
   *
   * Deliberately NOT set for `no-hit` (an ordinary "keep typing" state in a
   * typeahead) or `coverage_check_unavailable` (which a partial query can
   * produce simply because there is not yet enough locality to check) — those
   * two are answers to a COMPLETED search and the Find submit path, not the
   * typeahead, is where the customer reads them.
   */
  coverageNotice: string | null;
}

export async function fetchMergedSearchResult(
  query: string,
  bias: GeocodeBias | null,
  signal: AbortSignal,
  opts?: {
    baseGeocodeUrl?: string;
    baseSitusUrl?: string;
    limit?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<MergedSearchResult> {
  const limit = opts?.limit ?? 7;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const geocodeQueries = isBareHouseStreetQuery(query)
    ? [query, `${query} Street`, `${query} Drive`]
    : [query];
  const [situs, ...geocodeBatches] = await Promise.all([
    fetchSitusSearchResult(query, signal, {
      baseUrl: opts?.baseSitusUrl,
      limit,
      fetchImpl,
    }).catch(() => ({ suggestions: [] as Suggestion[], miss: null })),
    ...geocodeQueries.map((q) =>
      fetchGeocodeSuggestions(q, bias, signal, {
        baseUrl: opts?.baseGeocodeUrl,
        limit,
        fetchImpl,
      }).catch(() => [] as Suggestion[]),
    ),
  ]);

  // P-353 item 3. An out-of-coverage answer outranks a geocoded pin. Photon
  // will happily name a street in a county we do not cover — offering that
  // row is a geocoded pin standing in for "we do not cover this county",
  // which is a worse answer than none. The rows are dropped AFTER the merge
  // inputs are fetched rather than before, so the ordinary path does not pay
  // for the refusal with a serial situs-then-geocode round trip.
  if (isOutOfCoverage(situs.miss)) {
    return {
      suggestions: [],
      coverageNotice: coverageMissSentence(situs.miss!),
    };
  }

  return {
    suggestions: mergeSearchSuggestions(
      situs.suggestions,
      geocodeBatches.flat(),
      limit,
      query,
    ),
    coverageNotice: null,
  };
}

export async function fetchMergedSearchSuggestions(
  query: string,
  bias: GeocodeBias | null,
  signal: AbortSignal,
  opts?: {
    baseGeocodeUrl?: string;
    baseSitusUrl?: string;
    limit?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<Suggestion[]> {
  const { suggestions } = await fetchMergedSearchResult(query, bias, signal, opts);
  return suggestions;
}

