// apps/property-explorer/src/lib/search-kinds.ts
//
// Pure kind logic for the type-ahead map search: classify what a geocoder
// feature IS (address / street / place), build display labels, group + cap
// suggestion lists, compute matched-substring highlight ranges, and decide
// the LANDING each suggestion produces when selected.

import type { GeocodeWireFeature } from "../../api/_lib/pe-geocode-core";
import type { SitusSearchHit } from "../../api/_lib/pe-situs-search-core";
import { isValidParcelNodeId, normalizeParcelNodeId } from "./parcel-node-id";

export type SuggestionKind = "parcel" | "address" | "street" | "place";

/** Photon extent order: [minLon, maxLat, maxLon, minLat]. */
export type GeoExtent = [number, number, number, number];

export interface Suggestion {
  kind: SuggestionKind;
  /** Primary display line (matched substrings highlighted by the component). */
  label: string;
  /** Muted secondary line (locality / context). */
  sublabel: string | null;
  lat: number | null;
  lng: number | null;
  extent: GeoExtent | null;
  /** For kind "parcel": the normalized parcel node id to open directly. */
  parcelNodeId: string | null;
  /** The raw text to feed the address→parcel lookup (address kind). */
  lookupQuery: string | null;
}

/** Parcel-id fast path — same shape family as the G6 contract (5-digit FIPS). */
export const PARCEL_ID_FAST_PATH_RE = /^\d{5}:\S+/;

export function parcelIdSuggestion(raw: string): Suggestion | null {
  const trimmed = raw.trim();
  if (!PARCEL_ID_FAST_PATH_RE.test(trimmed)) return null;
  const nodeId = normalizeParcelNodeId(trimmed);
  if (!nodeId || !isValidParcelNodeId(nodeId)) return null;
  return {
    kind: "parcel",
    label: `Open parcel ${nodeId}`,
    sublabel: "direct parcel id",
    lat: null,
    lng: null,
    extent: null,
    parcelNodeId: nodeId,
    lookupQuery: nodeId,
  };
}

/** True when the input LOOKS like a parcel-id attempt (skip geocoding for it). */
export function looksLikeParcelId(raw: string): boolean {
  return PARCEL_ID_FAST_PATH_RE.test(raw.trim());
}

function localityLine(f: GeocodeWireFeature): string | null {
  const parts = [f.city ?? f.county, f.state].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : null;
}

/** Classify a geocoder wire feature into a suggestion kind. */
export function classifyFeature(f: GeocodeWireFeature): SuggestionKind {
  if (f.housenumber || f.type === "house") return "address";
  if (f.osmKey === "highway" || f.type === "street") return "street";
  return "place";
}

/** Map one geocoder wire feature onto a display suggestion (null = unusable). */
export function featureToSuggestion(f: GeocodeWireFeature): Suggestion | null {
  const kind = classifyFeature(f);
  const locality = localityLine(f);
  if (kind === "address") {
    const line = [f.housenumber, f.street ?? f.name].filter(Boolean).join(" ").trim();
    if (!line) return null;
    return {
      kind,
      label: line,
      sublabel: locality,
      lat: f.lat,
      lng: f.lng,
      extent: f.extent,
      parcelNodeId: null,
      // Full postal-ish string for the address→parcel lookup.
      lookupQuery: [line, f.city, f.state, f.postcode].filter(Boolean).join(", "),
    };
  }
  const name = f.name ?? f.street;
  if (!name) return null;
  return {
    kind,
    label: name,
    sublabel: locality,
    lat: f.lat,
    lng: f.lng,
    extent: f.extent,
    parcelNodeId: null,
    lookupQuery: null,
  };
}

/** Map one authoritative situs hit onto a parcel suggestion. */
export function situsHitToSuggestion(hit: SitusSearchHit): Suggestion | null {
  const situs = hit.situsAddress?.trim();
  const nodeId = hit.parcelNodeId?.trim();
  if (!situs || !nodeId || !isValidParcelNodeId(nodeId)) return null;
  const comma = situs.indexOf(",");
  const streetLine = comma >= 0 ? situs.slice(0, comma).trim() : situs;
  const locality = comma >= 0 ? situs.slice(comma + 1).trim() : null;
  return {
    kind: "parcel",
    label: streetLine || situs,
    sublabel: locality || "parcel situs",
    lat: null,
    lng: null,
    extent: null,
    parcelNodeId: nodeId,
    lookupQuery: situs,
  };
}

/** Map a TxGIO address-point hit (rooftop, no parcel id) onto an address suggestion. */
export function addressPointHitToSuggestion(hit: SitusSearchHit): Suggestion | null {
  const situs = hit.situsAddress?.trim();
  if (!situs) return null;
  const lat =
    hit.latitude != null && Number.isFinite(hit.latitude) ? hit.latitude : null;
  const lng =
    hit.longitude != null && Number.isFinite(hit.longitude) ? hit.longitude : null;
  if (lat == null || lng == null) return null;
  const comma = situs.indexOf(",");
  const streetLine = comma >= 0 ? situs.slice(0, comma).trim() : situs;
  const locality = comma >= 0 ? situs.slice(comma + 1).trim() : null;
  return {
    kind: "address",
    label: streetLine || situs,
    sublabel: locality || "authoritative address",
    lat,
    lng,
    extent: null,
    parcelNodeId: null,
    lookupQuery: situs,
  };
}

/** Route a combined place-search hit to the correct suggestion shape. */
export function placeSearchHitToSuggestion(hit: SitusSearchHit): Suggestion | null {
  if (hit.source === "address-point") return addressPointHitToSuggestion(hit);
  const nodeId = hit.parcelNodeId?.trim();
  if (nodeId && isValidParcelNodeId(nodeId)) return situsHitToSuggestion(hit);
  if (hit.latitude != null && hit.longitude != null) {
    return addressPointHitToSuggestion(hit);
  }
  return null;
}

/** Group order: parcel fast path, addresses, streets, places. Cap to `max`. */
export function groupSuggestions(
  items: Suggestion[],
  max = 7,
): Suggestion[] {
  const order: SuggestionKind[] = ["parcel", "address", "street", "place"];
  const grouped: Suggestion[] = [];
  for (const kind of order) {
    for (const s of items) if (s.kind === kind) grouped.push(s);
  }
  // De-dupe identical label+sublabel rows (Photon can return near-duplicates).
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const s of grouped) {
    const key = `${s.kind}|${s.label}|${s.sublabel ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Merge situs-index parcel hits ahead of geocoder suggestions. Dedupes by
 * parcelNodeId and by normalized lookupQuery so the same address does not
 * appear twice when both sources return it.
 */
export function mergeSearchSuggestions(
  situs: Suggestion[],
  geocode: Suggestion[],
  max = 7,
): Suggestion[] {
  const seenParcel = new Set<string>();
  const seenLookup = new Set<string>();
  const merged: Suggestion[] = [];

  const consider = (s: Suggestion) => {
    if (s.parcelNodeId) {
      const id = s.parcelNodeId.trim();
      if (id && seenParcel.has(id)) return;
      if (id) seenParcel.add(id);
    }
    const lookup = s.lookupQuery?.trim().toLowerCase();
    if (lookup) {
      if (seenLookup.has(lookup)) return;
      seenLookup.add(lookup);
    }
    merged.push(s);
  };

  for (const s of situs) consider(s);
  for (const s of geocode) consider(s);
  return groupSuggestions(merged, max);
}

/** Case-insensitive matched-substring ranges of query TOKENS inside a label. */
export function highlightRanges(
  label: string,
  query: string,
): Array<{ start: number; end: number }> {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 1);
  if (!tokens.length) return [];
  const lower = label.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];
  for (const token of tokens) {
    let from = 0;
    while (from <= lower.length - token.length) {
      const idx = lower.indexOf(token, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + token.length });
      from = idx + token.length;
    }
  }
  // Merge overlaps so nested <b> spans never happen.
  ranges.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}

/**
 * The text the input must carry after a suggestion is picked, which is also
 * what Find re-submits.
 *
 * THE DEFECT this closes: `label` for an address suggestion is only house
 * number plus street (see `featureToSuggestion` above), because the locality is
 * drawn as the muted `sublabel`. `pick()` used to write `label` into the input,
 * so picking "17005 Simsbrook Drive, Pflugerville, TX 78660" left "17005
 * Simsbrook Drive" in the box, and pressing Find then submitted the TRUNCATED
 * string and errored. The correctly built full string was already sitting in
 * `lookupQuery` and was being discarded.
 *
 * Order: the parcel node id (the stable key), then the full lookup target, then
 * the display label as a last resort. A street or place carries no lookup
 * target, so its label is the only honest thing to show.
 */
export function suggestionLookupTarget(s: Suggestion): string {
  if (s.kind === "parcel") return s.parcelNodeId ?? s.lookupQuery ?? s.label;
  return s.lookupQuery ?? s.label;
}

/** Kind display metadata for the dropdown (label text; icon drawn by the UI). */
export const KIND_LABELS: Record<SuggestionKind, string> = {
  parcel: "Parcel",
  address: "Address",
  street: "Street",
  place: "Place",
};
