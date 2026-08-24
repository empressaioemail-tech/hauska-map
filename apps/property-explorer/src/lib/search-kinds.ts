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

/** Who wrote this row. Photon is a camera hint, not the identity writer. */
export type SuggestionSource =
  | "photon"
  | "situs-address-point"
  | "situs-parcel"
  | "direct-id";

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
  /** Absent on older fixtures. Construction sites set it. */
  source?: SuggestionSource;
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
    source: "direct-id",
  };
}

/** True when the input LOOKS like a parcel-id attempt (skip geocoding for it). */
export function looksLikeParcelId(raw: string): boolean {
  return PARCEL_ID_FAST_PATH_RE.test(raw.trim());
}

const STREET_SUFFIX_RE =
  /\s+(drive|street|avenue|lane|boulevard|court|circle|road|dr|st|ave|ln|blvd|ct|cir|rd)\.?$/i;

const US_STATE_ABBREV: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

/**
 * Photon address labels spell the state and keep the street suffix + ZIP.
 * Cortex address-only geocode 422s that shape. The short form the operator
 * pasted (`17005 Simsbrook, Pflugerville TX`) is the identity query.
 */
export function isPhotonAddressLabel(raw: string): boolean {
  const q = raw.trim();
  if (!q) return false;
  return Object.keys(US_STATE_ABBREV).some((name) =>
    new RegExp(`,\\s*${name}\\b`, "i").test(q),
  );
}

export function houseNumberFromSuggestion(s: Suggestion): string | null {
  const src = (s.lookupQuery ?? s.label).trim();
  const m = src.match(/^(\d+)/);
  return m?.[1] ?? null;
}

function abbreviateState(raw: string): string {
  const t = raw.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return US_STATE_ABBREV[t.toLowerCase()] ?? t;
}

/**
 * `17005 Simsbrook Drive, Pflugerville, Texas, 78660`
 * → `17005 Simsbrook, Pflugerville TX`
 */
export function compactEnvelopeAddressQuery(raw: string): string {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return raw.trim();
  const line = (parts[0] ?? raw).replace(STREET_SUFFIX_RE, "").trim();
  let city = "";
  let state = "";
  if (parts.length >= 3) {
    city = parts[1] ?? "";
    const stateOrZip = parts[2] ?? "";
    if (/^\d{5}(-\d{4})?$/.test(stateOrZip)) {
      const cityState = city.match(/^(.+?)\s+([A-Za-z]{2}|[A-Za-z][A-Za-z .]+)$/);
      if (cityState) {
        city = cityState[1] ?? city;
        state = abbreviateState(cityState[2] ?? "");
      }
    } else {
      state = abbreviateState(stateOrZip);
    }
  } else if (parts.length === 2) {
    const cityState = (parts[1] ?? "").match(
      /^(.+?)\s+([A-Za-z]{2}|[A-Za-z][A-Za-z .]+)$/,
    );
    if (cityState) {
      city = cityState[1] ?? "";
      state = abbreviateState(cityState[2] ?? "");
    } else {
      city = parts[1] ?? "";
    }
  }
  city = city.replace(/\s+\d{5}(-\d{4})?$/, "").trim();
  const locality = [city, state].filter(Boolean).join(" ");
  return locality ? `${line}, ${locality}` : line;
}

/** What Find / landing must send. Photon labels are compacted first. */
export function identityQueryFromAddressSuggestion(s: Suggestion): string {
  const raw = (s.lookupQuery ?? s.label).trim();
  if (s.source === "situs-address-point" || s.source === "situs-parcel") {
    return raw;
  }
  if (s.source === "photon" || isPhotonAddressLabel(raw)) {
    return compactEnvelopeAddressQuery(raw);
  }
  return raw;
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
      // Photon postal string. Identity query is compacted at pick / Find.
      lookupQuery: [line, f.city, f.state, f.postcode].filter(Boolean).join(", "),
      source: "photon",
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
    source: "situs-parcel",
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
    source: "situs-address-point",
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
    if (s.kind === "address" && s.source === "photon") {
      const hn = houseNumberFromSuggestion(s);
      if (
        hn &&
        merged.some((m) => {
          if (m.source !== "situs-address-point" && m.source !== "situs-parcel") {
            return false;
          }
          return houseNumberFromSuggestion(m) === hn;
        })
      ) {
        return;
      }
    }
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
  if (s.kind === "address") return identityQueryFromAddressSuggestion(s);
  return s.lookupQuery ?? s.label;
}

/** Kind display metadata for the dropdown (label text; icon drawn by the UI). */
export const KIND_LABELS: Record<SuggestionKind, string> = {
  parcel: "Parcel",
  address: "Address",
  street: "Street",
  place: "Place",
};
