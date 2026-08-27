// apps/property-explorer/src/lib/parcel-lookup.ts
//
// QUERY -> PARCEL NODE ID. That is all this module does now.
//
// It used to build a whole inspect card here: it read the baked facets, shaped
// them into a ParcelCardData, resolved a buildable envelope, and geocoded the
// situs ADDRESS to decide where to fly. That made it one of the five paths that
// each answered the same parcel questions separately, and its own comment
// admitted the consequence — "the inspect card opens but the map does not
// move" whenever no centre resolved.
//
// Facts now come from ONE place, `fact-sheet-resolver.ts`, keyed on the parcel
// node id this module produces. Navigation comes from the sheet's geometry
// centroid, never from an address (invariant I5).

import {
  fetchBuildableEnvelope,
  parsePlaceKey,
} from "./buildable-envelope.js";
import { CORTEX_PROXY_BASE } from "./config";
import { isValidParcelNodeId, normalizeParcelNodeId } from "./parcel-node-id";
import { PE_SITUS_SEARCH_URL } from "./situs-search-client";
import { situsHitsFromResponse, uniqueSitusPin } from "./situs-pin";
import {
  AMBIGUOUS_FIND_REASON,
  compactEnvelopeAddressQuery,
  isBareHouseStreetQuery,
  isPhotonAddressLabel,
  looksLikeBarePlaceQuery,
  situsQueryVariants,
} from "./search-kinds";

export type LookupKind = "parcel-node-id" | "address";

export function classifyLookupQuery(raw: string): { kind: LookupKind; value: string } | null {
  const value = raw.trim();
  if (!value) return null;
  // G6 — same contract as BFF/MCP (F1b).
  const nodeId = normalizeParcelNodeId(value);
  if (nodeId && isValidParcelNodeId(nodeId)) {
    return { kind: "parcel-node-id", value: nodeId };
  }
  return { kind: "address", value };
}

export function isParcelNodeIdQuery(raw: string): boolean {
  return classifyLookupQuery(raw)?.kind === "parcel-node-id";
}

export type ResolvedLookupPoint = { lat: number; lng: number };

export type LookupResult =
  | {
      ok: true;
      parcelNodeId: string;
      source: LookupKind;
      /** Backend-authoritative point from placeKey or caller bias. */
      resolvedPoint?: ResolvedLookupPoint;
    }
  | { ok: false; reason: string };

const DEEP_LINK_PARAM_KEYS = [
  "parcelNodeId",
  "parcel",
  "address",
  "simulated",
  "session_id",
] as const;

/** Drop sim/deep-link query params after a successful search handoff. */
export function clearDeepLinkParams(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of DEEP_LINK_PARAM_KEYS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next || "/");
}

/**
 * Resolve a query to a PARCEL NODE ID and nothing else.
 *
 * Identity writer is the situs index. A unique hit with a node id is the
 * answer. A unique address-point (node id null, rooftop present) asks
 * envelope with THAT rooftop — never a Photon or viewport coordinate.
 * Many hits or no pin: envelope ADDRESS ONLY, unless a trusted situs
 * rooftop was supplied by an address-point pick (#191). Caller lat/lng
 * (Photon / viewport) stay ignored.
 */
export type LookupSubjectHint = {
  parcelNodeId: string;
  situsAddress?: string | null;
};

export const HONEST_SEARCH_MISS =
  "Address not matched to a parcel — search returned no hit.";

export function normalizeFindAddress(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findQueryMatchesSubjectSitus(
  query: string,
  situs: string | null | undefined,
): boolean {
  if (!situs) return false;
  const q = normalizeFindAddress(query);
  const s = normalizeFindAddress(situs);
  if (!q || !s) return false;
  return q === s || q.includes(s) || s.includes(q);
}

export function isNakedPropertySearch404(reason: string | undefined): boolean {
  if (!reason) return false;
  return /property search results:\s*404|error fetch property search|http-404/i.test(
    reason,
  );
}

export function honestSearchMissReason(
  raw: string | undefined,
  query: string,
): string {
  if (isNakedPropertySearch404(raw) || /404/.test(raw ?? "")) {
    return HONEST_SEARCH_MISS;
  }
  return raw?.trim() || `Address not found or not pinned to a single parcel: ${query}`;
}

export async function resolveLookupToParcelNodeId(
  raw: string,
  opts?: {
    cortexBase?: string;
    situsSearchUrl?: string;
    fetchImpl?: typeof fetch;
    /** Ignored for identity. Photon / viewport bias must not override address. */
    lat?: number;
    lng?: number;
    /** Situs address-point rooftop from the picked row. Not Photon. */
    trustedRooftop?: { lat: number; lng: number };
    /** Already-mapped subject. A 404 must not toast if the query matches it. */
    currentSubject?: LookupSubjectHint | null;
  },
): Promise<LookupResult> {
  const classified = classifyLookupQuery(raw);
  if (!classified) {
    return { ok: false, reason: "Enter a parcel id (48209:156346) or a street address." };
  }
  if (classified.kind === "parcel-node-id") {
    return { ok: true, parcelNodeId: classified.value, source: "parcel-node-id" };
  }

  if (looksLikeBarePlaceQuery(classified.value)) {
    return {
      ok: false,
      reason: "That looks like a city or county — pick a row from the list.",
    };
  }
  if (isBareHouseStreetQuery(classified.value)) {
    return { ok: false, reason: AMBIGUOUS_FIND_REASON };
  }

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const pin = await fetchUniqueSitusPin(classified.value, {
    situsSearchUrl: opts?.situsSearchUrl ?? PE_SITUS_SEARCH_URL,
    fetchImpl,
  });

  if (pin?.parcelNodeId && isValidParcelNodeId(pin.parcelNodeId)) {
    const resolvedPoint =
      pin.lat != null && pin.lng != null
        ? { lat: pin.lat, lng: pin.lng }
        : undefined;
    return {
      ok: true,
      parcelNodeId: pin.parcelNodeId,
      source: "address",
      resolvedPoint,
    };
  }

  const subject = opts?.currentSubject;
  if (
    subject?.parcelNodeId &&
    isValidParcelNodeId(subject.parcelNodeId) &&
    findQueryMatchesSubjectSitus(classified.value, subject.situsAddress)
  ) {
    return {
      ok: true,
      parcelNodeId: subject.parcelNodeId,
      source: "address",
    };
  }

  const fallbackAddress = isPhotonAddressLabel(classified.value)
    ? compactEnvelopeAddressQuery(classified.value)
    : classified.value;
  const roof = opts?.trustedRooftop;
  const trusted =
    roof &&
    Number.isFinite(roof.lat) &&
    Number.isFinite(roof.lng)
      ? { lat: roof.lat, lng: roof.lng }
      : null;
  const envInput =
    pin && pin.lat != null && pin.lng != null
      ? {
          address: pin.situsAddress,
          lat: pin.lat,
          lng: pin.lng,
        }
      : trusted
        ? {
            address: pin?.situsAddress ?? fallbackAddress,
            lat: trusted.lat,
            lng: trusted.lng,
          }
        : { address: fallbackAddress };

  const env = await fetchBuildableEnvelope(
    envInput,
    opts?.cortexBase ?? CORTEX_PROXY_BASE,
    fetchImpl,
  );
  const parcelNodeId =
    typeof env.parcelNodeId === "string" && env.parcelNodeId.trim()
      ? env.parcelNodeId.trim()
      : null;
  if (!parcelNodeId) {
    if (
      subject?.parcelNodeId &&
      isValidParcelNodeId(subject.parcelNodeId) &&
      findQueryMatchesSubjectSitus(classified.value, subject.situsAddress)
    ) {
      return {
        ok: true,
        parcelNodeId: subject.parcelNodeId,
        source: "address",
      };
    }
    return {
      ok: false,
      reason: honestSearchMissReason(env.reason ?? undefined, classified.value),
    };
  }
  const fromPlaceKey = parsePlaceKey(
    typeof env.placeKey === "string" ? env.placeKey : null,
  );
  const resolvedPoint =
    fromPlaceKey ??
    (envInput.lat != null && envInput.lng != null
      ? { lat: envInput.lat, lng: envInput.lng }
      : undefined);
  return { ok: true, parcelNodeId, source: "address", resolvedPoint };
}

async function fetchUniqueSitusPin(
  query: string,
  opts: { situsSearchUrl: string; fetchImpl: typeof fetch },
) {
  try {
    const variants = situsQueryVariants(query);
    const batches = await Promise.all(
      variants.map(async (q) => {
        const qs = new URLSearchParams({ q, limit: "7" });
        const res = await opts.fetchImpl(`${opts.situsSearchUrl}?${qs.toString()}`, {
          method: "GET",
        });
        if (!res.ok) return [];
        return situsHitsFromResponse(await res.json());
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
    const cityHint = cityHintFromQuery(query);
    const filtered = cityHint
      ? hits.filter((h) => h.situsAddress.toLowerCase().includes(cityHint))
      : hits;
    return uniqueSitusPin(cityHint ? filtered : hits);
  } catch {
    return null;
  }
}

function cityHintFromQuery(raw: string): string | null {
  const tokens = raw.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (tokens.length < 3 || !/^\d/.test(tokens[0] ?? "")) return null;
  const last = tokens[tokens.length - 1]?.toLowerCase() ?? "";
  if (!last || /^\d/.test(last)) return null;
  if (/^(drive|street|avenue|lane|boulevard|court|circle|road|dr|st|ave|ln|blvd|ct|cir|rd|tx|texas)$/i.test(last)) {
    return null;
  }
  return last;
}

/** Read deep-link query from a URLSearchParams (parcelNodeId | parcel | address). */
export function deepLinkLookupQuery(params: URLSearchParams): string | null {
  const id =
    params.get("parcelNodeId")?.trim() || params.get("parcel")?.trim() || null;
  if (id) return id;
  const address = params.get("address")?.trim();
  return address || null;
}
