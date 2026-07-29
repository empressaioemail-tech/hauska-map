// apps/property-explorer/src/lib/geocodeClient.ts
//
// Thin client for the /api/pe-geocode BFF (Photon proxy). Passes the current
// map center as viewport BIAS so nearer results rank first (Photon does
// location bias natively). Caller owns debounce + AbortController (the
// suggest controller in search-suggest.ts).

import type { GeocodeWireResponse } from "../../api/_lib/pe-geocode-core";
import { featureToSuggestion, type Suggestion } from "./search-kinds";

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
