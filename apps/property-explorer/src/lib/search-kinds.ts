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

const STREET_SUFFIX_CANON: Record<string, string> = {
  drive: "dr",
  dr: "dr",
  street: "st",
  st: "st",
  avenue: "ave",
  ave: "ave",
  lane: "ln",
  ln: "ln",
  boulevard: "blvd",
  blvd: "blvd",
  court: "ct",
  ct: "ct",
  circle: "cir",
  cir: "cir",
  road: "rd",
  rd: "rd",
};

const STREET_SUFFIX_TOKEN_RE =
  /^(drive|street|avenue|lane|boulevard|court|circle|road|dr|st|ave|ln|blvd|ct|cir|rd)\.?$/i;

const PLACE_TYPES = new Set([
  "city",
  "county",
  "state",
  "district",
  "locality",
  "neighbourhood",
  "neighborhood",
  "suburb",
  "town",
  "village",
]);

/** Honest chip when Photon/house lookup finds no parcel — not a neighborhood hover. */
export const INDEX_MISS_CHIP = "No parcel in the index for that address";

/** Raw Find of a bare house+street must not lock the first prefix hit. */
export const AMBIGUOUS_FIND_REASON =
  "Several streets or cities match — pick one from the list.";

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

function streetSuffixFromText(raw: string): string | null {
  const tokens = raw
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const t of tokens) {
    const canon = STREET_SUFFIX_CANON[t.replace(/\.$/, "")];
    if (canon) return canon;
  }
  return null;
}

function streetStemFromText(raw: string): string {
  const first = raw.split(",")[0] ?? raw;
  return first
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t, i) => i > 0 && !STREET_SUFFIX_CANON[t.replace(/\.$/, "")])
    .join(" ");
}

function unitFromText(raw: string): string {
  const m = raw.match(/#\s*([a-z0-9-]+)|(?:apt|apartment|unit|ste|suite)\s+([a-z0-9-]+)/i);
  return (m?.[1] ?? m?.[2] ?? "").toLowerCase();
}

function cityFromSuggestion(s: Suggestion): string {
  const fromSub = (s.sublabel ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase()
    .replace(/\s+(tx|texas)$/i, "")
    .trim();
  if (fromSub) return fromSub;
  const parts = (s.lookupQuery ?? "").split(",").map((p) => p.trim());
  return (parts[1] ?? "").toLowerCase().replace(/\s+(tx|texas)$/i, "").trim();
}

/** House + stem + suffix + city + unit. Street vs Drive and two cities are distinct. */
export function suggestionIdentityKey(s: Suggestion): string {
  const src = `${s.label} ${s.lookupQuery ?? ""} ${s.sublabel ?? ""}`;
  const hn = houseNumberFromSuggestion(s) ?? "";
  return [
    hn,
    streetStemFromText(src),
    streetSuffixFromText(src) ?? "",
    cityFromSuggestion(s),
    unitFromText(src),
  ].join("|");
}

export function isAmbiguousSuggestionSet(items: Suggestion[]): boolean {
  const keys = new Set<string>();
  for (const s of items) {
    if (s.kind !== "parcel" && s.kind !== "address") continue;
    keys.add(suggestionIdentityKey(s));
    if (keys.size >= 2) return true;
  }
  return false;
}

/** House number + street name, no suffix and no city — never lock hits[0]. */
export function isBareHouseStreetQuery(raw: string): boolean {
  const q = raw.trim();
  if (!q || looksLikeParcelId(q)) return false;
  const tokens = q.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || !/^\d/.test(tokens[0] ?? "")) return false;
  const rest = tokens.slice(1);
  if (rest.some((t) => STREET_SUFFIX_TOKEN_RE.test(t))) return false;
  if (rest.some((t) => US_STATE_ABBREV[t.toLowerCase()])) return false;
  return rest.length === 1;
}

/** `Bastrop Texas` / `Bastrop, Texas` — no house number, state token present. */
export function looksLikeBarePlaceQuery(raw: string): boolean {
  const q = raw.trim();
  if (!q || looksLikeParcelId(q) || /^\d/.test(q)) return false;
  const tokens = q.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;
  const last = tokens[tokens.length - 1]?.toLowerCase() ?? "";
  return Boolean(US_STATE_ABBREV[last]);
}

/**
 * Extra situs prefixes so a city token is not treated as part of the street.
 * `1308 Pecan Bastrop` also queries `1308 Pecan`. Does not drop the original.
 */
export function situsQueryVariants(raw: string): string[] {
  const q = raw.trim();
  if (!q || looksLikeParcelId(q)) return [q];
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim().replace(/\s+/g, " ");
    const k = t.toLowerCase();
    if (!t || seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  push(q);
  const tokens = q.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  let trimmed = [...tokens];
  const last = trimmed[trimmed.length - 1];
  if (trimmed.length >= 2 && last && US_STATE_ABBREV[last.toLowerCase()]) {
    trimmed = trimmed.slice(0, -1);
    push(trimmed.join(" "));
  }
  const tail = trimmed[trimmed.length - 1];
  if (
    trimmed.length >= 3 &&
    tail &&
    !STREET_SUFFIX_TOKEN_RE.test(tail) &&
    !/^\d/.test(tail)
  ) {
    push(trimmed.slice(0, -1).join(" "));
  }
  return out;
}

export function isPudOrSubdivisionLabel(label: string): boolean {
  return /\b(pud|subdivision|condo(?:minium)?s?|townhomes?|hoa)\b/i.test(label);
}

/** Photon street bbox that covers a whole PUD (~9 km) must not be fitted. */
export function streetExtentTooLarge(extent: GeoExtent | null): boolean {
  if (!extent) return false;
  const [minLon, maxLat, maxLon, minLat] = extent;
  return Math.abs(maxLon - minLon) > 0.08 || Math.abs(maxLat - minLat) > 0.08;
}

function rankSuggestionForQuery(s: Suggestion, query: string): number {
  const q = query.toLowerCase();
  const blob = `${s.label} ${s.sublabel ?? ""} ${s.lookupQuery ?? ""}`.toLowerCase();
  let rank = 0;
  if (s.source === "situs-parcel" || s.source === "direct-id") rank += 40;
  if (s.source === "situs-address-point") rank += 20;
  const qSuffix = streetSuffixFromText(q);
  const sSuffix = streetSuffixFromText(blob);
  if (qSuffix && sSuffix && qSuffix === sSuffix) rank += 30;
  for (const token of q.split(/\s+/).filter((t) => t.length >= 3)) {
    if (blob.includes(token)) rank += 8;
  }
  if (s.kind === "parcel" && s.parcelNodeId?.startsWith("48021:")) rank += 4;
  return rank;
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

function stateLongName(state: string | null): string | null {
  if (!state) return null;
  const abbr = abbreviateState(state);
  const named = Object.entries(US_STATE_ABBREV).find(([, v]) => v === abbr);
  if (!named) return state;
  return named[0].replace(/\b\w/g, (c) => c.toUpperCase());
}

function placeTypeOf(f: GeocodeWireFeature): string | null {
  const type = (f.type ?? "").toLowerCase();
  if (PLACE_TYPES.has(type)) return type;
  const osm = (f.osmValue ?? "").toLowerCase();
  if (f.osmKey === "place" && PLACE_TYPES.has(osm)) return osm;
  return null;
}

/** City vs county labels: `Bastrop City Texas` / `Bastrop County Texas`. */
export function placeDisplayLabel(f: GeocodeWireFeature): {
  label: string;
  sublabel: string | null;
} | null {
  const name = (f.name ?? f.street ?? "").trim();
  if (!name) return null;
  const kind = placeTypeOf(f);
  const state = stateLongName(f.state) ?? "Texas";
  if (kind === "city" || kind === "town" || kind === "village") {
    const city = name.replace(/\s+city$/i, "").trim();
    return { label: `${city} City ${state}`, sublabel: f.county ? `${f.county}` : null };
  }
  if (kind === "county") {
    const county = name.replace(/\s+county$/i, "").trim();
    return { label: `${county} County ${state}`, sublabel: null };
  }
  return { label: name, sublabel: localityLine(f) };
}

/** Classify a geocoder wire feature into a suggestion kind. */
export function classifyFeature(f: GeocodeWireFeature): SuggestionKind {
  if (f.housenumber || f.type === "house") return "address";
  const place = placeTypeOf(f);
  if (place) return "place";
  if (f.osmKey === "highway" || f.type === "street") {
    if (isPudOrSubdivisionLabel(f.name ?? f.street ?? "")) return "place";
    return "street";
  }
  return "place";
}

/** Map one geocoder wire feature onto a display suggestion (null = unusable). */
export function featureToSuggestion(f: GeocodeWireFeature): Suggestion | null {
  const kind = classifyFeature(f);
  if (kind === "address") {
    const line = [f.housenumber, f.street ?? f.name].filter(Boolean).join(" ").trim();
    if (!line) return null;
    return {
      kind,
      label: line,
      sublabel: localityLine(f),
      lat: f.lat,
      lng: f.lng,
      extent: f.extent,
      parcelNodeId: null,
      // Photon postal string. Identity query is compacted at pick / Find.
      lookupQuery: [line, f.city, f.state, f.postcode].filter(Boolean).join(", "),
      source: "photon",
    };
  }
  if (kind === "place") {
    const place = placeDisplayLabel(f);
    if (!place) return null;
    return {
      kind,
      label: place.label,
      sublabel: place.sublabel,
      lat: f.lat,
      lng: f.lng,
      extent: f.extent,
      parcelNodeId: null,
      lookupQuery: null,
      source: "photon",
    };
  }
  const name = f.name ?? f.street;
  if (!name) return null;
  return {
    kind,
    label: name,
    sublabel: localityLine(f),
    lat: f.lat,
    lng: f.lng,
    extent: f.extent,
    parcelNodeId: null,
    lookupQuery: null,
    source: "photon",
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
 * parcelNodeId, lookupQuery, and address identity (house+stem+suffix+city).
 * House number alone is NOT identity — Street vs Drive and two cities stay.
 */
export function mergeSearchSuggestions(
  situs: Suggestion[],
  geocode: Suggestion[],
  max = 7,
  query = "",
): Suggestion[] {
  const seenParcel = new Set<string>();
  const seenLookup = new Set<string>();
  const seenIdentity = new Set<string>();
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
    if (s.kind === "parcel" || s.kind === "address") {
      const ident = suggestionIdentityKey(s);
      if (ident && seenIdentity.has(ident)) return;
      if (ident) seenIdentity.add(ident);
    }
    merged.push(s);
  };

  const rankedSitus = [...situs].sort(
    (a, b) => rankSuggestionForQuery(b, query) - rankSuggestionForQuery(a, query),
  );
  const rankedGeocode = [...geocode].sort(
    (a, b) => rankSuggestionForQuery(b, query) - rankSuggestionForQuery(a, query),
  );
  for (const s of rankedSitus) consider(s);
  for (const s of rankedGeocode) consider(s);
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
  if (s.kind === "parcel") {
    const addr = s.lookupQuery?.trim();
    if (addr && !looksLikeParcelId(addr)) return addr;
    return s.parcelNodeId ?? s.lookupQuery ?? s.label;
  }
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
