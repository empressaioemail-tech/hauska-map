// apps/property-explorer/src/lib/baked-facets.ts
//
// Baked node-facet READ client — the inspect card's PREFERRED, instant,
// zero-AI, zero-live-compute source.
//
// The backend pre-baked the cheap deterministic facets (base facts, land-use,
// zoning, setbacks/buildable envelope) for every Central-TX parcel node into
// `place_layer_snapshots` and serves them by `parcel_node_id` at
//
//   GET {cortexBase}/brokerage/v1/place/node/:parcelNodeId/facets
//
// through the same-origin spine proxy (anonymous — the browser holds no key;
// the proxy attaches auth server-side). So clicking a parcel shows real,
// gate-passed data INSTANTLY as a pure read. No brief, no model, no live
// adapter fetch is on this path.
//
// HONESTY (commitment #1): a facet that is legitimately absent (Comal land-use,
// a gate-blocked county, a declined envelope, un-stamped zoning) is served as
// an explicit absence — never a fabricated value. This client preserves that:
// it maps the baked payload into a card view-model that distinguishes
// "verified present", "honestly absent / not verified here", and "unknown",
// so the card can render absence as a legible trust signal, not a blank cell.
//
// Owner is NEVER present (the bake never wrote it and the endpoint strips it
// defense-in-depth); this client never reads or surfaces an owner field.

/** The baked Tier-1 facet payload, mirrored from the backend contract. */
export interface BakedFacetPayload {
  parcelNodeId?: string;
  countyFips?: string;
  countyName?: string;
  baseFacts?: {
    apn?: string | null;
    situsAddress?: string | null;
    situsCity?: string | null;
    situsState?: string | null;
    landUse?: {
      code: string;
      description?: string | null;
      source?: string;
      vintage?: string;
    } | null;
    acreage?: { value: number; sqft?: number; method?: string } | null;
  };
  zoning?: { district: string } | null;
  envelope?: {
    status: "ok" | "no-buildable-area" | "declined";
    confidence?: number;
    approximate?: boolean;
    provisional?: boolean;
    declineReason?: string;
    district?: string;
    setbacks?: { front_ft: number; side_ft: number; rear_ft: number };
    buildableAreaPct?: number;
    disclosure?: string;
    emptyReason?: string;
    citationUrl?: string;
    geojson?: unknown;
  } | null;
  facetCoverage?: {
    baseFacts?: boolean;
    landUse?: boolean;
    acreage?: boolean;
    zoning?: boolean;
    envelope?: boolean;
  };
  provenance?: {
    parcelSource?: string;
    parcelVintage?: string | null;
    landUseSource?: string | null;
    landUseGateBlocked?: boolean;
  };
  bakedAt?: string;
}

/** The endpoint envelope. */
export interface BakedFacetsResponse {
  parcelNodeId: string;
  adapterKey: string;
  source: "baked-snapshot" | "atom-chain";
  snapshotAt: string | null;
  facets: BakedFacetPayload;
}

/**
 * The single, load-bearing distinction for the card's honest-absence design:
 *
 *   - "present":  a real, verified value the card renders.
 *   - "absent":   the facet is HONESTLY not available for this parcel — a
 *                 gate-passed "not verified in this area" state. This is a
 *                 FEATURE (service-elevation thesis): render it as a legible
 *                 signal, never a blank cell and never a fabricated value.
 *   - "unknown":  no baked snapshot at all (pre-read / fell back to live), so
 *                 the card should not assert either presence or absence yet.
 */
export type FacetState = "present" | "absent" | "unknown";

/** A card facet: its verification state plus its value when present. */
export interface CardFacet<T> {
  state: FacetState;
  value: T | null;
}

/** The inspect card's view-model, derived purely from a baked payload. */
export interface BakedCardModel {
  parcelNodeId: string | null;
  apn: CardFacet<string>;
  situsAddress: CardFacet<string>;
  county: CardFacet<string>;
  landUse: CardFacet<string>;
  zoning: CardFacet<string>;
  acreage: CardFacet<string>;
  setbacks: CardFacet<string>;
  buildablePct: CardFacet<string>;
  /** True whenever an envelope facet is present — the card must then render the
   *  "approximate / not survey grade" treatment (honesty commitment #1). */
  envelopeApproximate: boolean;
  /** The baked envelope status, when present: "ok" (a buildable area was drawn),
   *  "no-buildable-area" (an HONEST 0% — setbacks consume the lot), or
   *  "declined". Null when no envelope was baked. Drives the 0% card wording. */
  envelopeStatus: "ok" | "no-buildable-area" | "declined" | null;
  /** The 0%-case reason (setbacks exceed the lot), when the bake carried one. */
  envelopeEmptyReason: string | null;
  /** The envelope's honest decline reason, when status === "declined". */
  envelopeDeclineReason: string | null;
  /** Envelope disclosure string when the bake carried one. */
  disclosure: string | null;
  /** Provenance: parcel + land-use source and vintage for the citation line. */
  provenance: {
    parcelSource: string | null;
    landUseSource: string | null;
    landUseGateBlocked: boolean;
    vintage: string | null;
  };
  /** The bake timestamp, for the "as of" citation line. */
  bakedAt: string | null;
}

function present<T>(value: T): CardFacet<T> {
  return { state: "present", value };
}
function absent<T>(): CardFacet<T> {
  return { state: "absent", value: null };
}

/**
 * Derive the card view-model from a baked payload. Pure + owner-free.
 *
 * The `facetCoverage` map is the authoritative present/absent signal the bake
 * computed (true == real content, false == honest absence). We prefer it and
 * fall back to a value-presence check so a payload without coverage flags still
 * renders sensibly. A facet that is honestly absent becomes state:"absent"
 * (the card's "not verified in this area" treatment) — NEVER a blank that reads
 * as "nothing here" and never a fabricated value.
 */
export function deriveBakedCardModel(payload: BakedFacetPayload): BakedCardModel {
  const bf = payload.baseFacts ?? {};
  const cov = payload.facetCoverage ?? {};
  const env = payload.envelope ?? null;

  const apn =
    typeof bf.apn === "string" && bf.apn.trim()
      ? present(bf.apn.trim())
      : absent<string>();

  const situsAddress =
    typeof bf.situsAddress === "string" && bf.situsAddress.trim()
      ? present(bf.situsAddress.trim())
      : absent<string>();

  const countyStr = payload.countyName
    ? payload.countyFips
      ? `${payload.countyName} County (${payload.countyFips})`
      : `${payload.countyName} County`
    : payload.countyFips ?? null;
  const county = countyStr ? present(countyStr) : absent<string>();

  // Land-use: coverage flag is authoritative (Comal / gate-blocked counties
  // bake landUse:null with coverage.landUse:false = honest absence).
  const landUse =
    cov.landUse === true && bf.landUse
      ? present(bf.landUse.description || bf.landUse.code)
      : absent<string>();

  const zoning =
    cov.zoning === true && payload.zoning
      ? present(payload.zoning.district)
      : absent<string>();

  const acreage =
    cov.acreage === true && bf.acreage && typeof bf.acreage.value === "number"
      ? present(`${bf.acreage.value} ac`)
      : absent<string>();

  // Envelope-derived facets. Present only when the bake derived an envelope
  // (status ok / no-buildable-area with setbacks); a declined envelope is an
  // honest absence.
  const hasEnvelope = cov.envelope === true && !!env && env.status !== "declined";
  const s = env?.setbacks;
  const setbacks =
    hasEnvelope && s
      ? present(`F ${s.front_ft}′ · S ${s.side_ft}′ · R ${s.rear_ft}′`)
      : absent<string>();
  const buildablePct =
    hasEnvelope && typeof env?.buildableAreaPct === "number"
      ? present(`${Math.round(env.buildableAreaPct)}%`)
      : absent<string>();

  return {
    parcelNodeId: payload.parcelNodeId ?? null,
    apn,
    situsAddress,
    county,
    landUse,
    zoning,
    acreage,
    setbacks,
    buildablePct,
    // Any present envelope is Tier-1 (shape-only, no roads) — always approximate.
    envelopeApproximate: hasEnvelope,
    envelopeStatus: env?.status ?? null,
    envelopeEmptyReason:
      env?.status === "no-buildable-area"
        ? env.emptyReason ?? env.disclosure ?? "Setbacks consume the lot — no buildable area remains."
        : null,
    envelopeDeclineReason:
      env?.status === "declined" ? env.declineReason ?? null : null,
    disclosure: env?.disclosure ?? null,
    provenance: {
      parcelSource: payload.provenance?.parcelSource ?? null,
      landUseSource: payload.provenance?.landUseSource ?? null,
      landUseGateBlocked: payload.provenance?.landUseGateBlocked === true,
      vintage: payload.provenance?.parcelVintage ?? null,
    },
    bakedAt: payload.bakedAt ?? null,
  };
}

/**
 * Fetch a parcel node's facets through the same-origin dual-serve BFF,
 * ANONYMOUSLY (no key — the proxy attaches auth server-side).
 *
 * Preferred URL: `/api/spine/property-atoms/:id/facets` (BFF chooses atom-chain
 * vs cortex via PROPERTY_ATOM_PATH). Legacy callers may still pass a cortex
 * proxy base (`…/cortex/api`); those keep the old cortex-only path.
 *
 * Returns the parsed response on 200, or null when the node has no snapshot
 * (404) so the caller can fall back to the live-envelope path. Any other
 * failure also returns null (the card degrades to the live fallback).
 *
 * @param parcelNodeId the stable "{fips}:{propId}" id from the parcel click.
 * @param facetsBase   PE facets BFF base (`/api/spine/property-atoms`) or legacy
 *                     cortex proxy base (`/api/spine/cortex/api`).
 */
export async function fetchBakedNodeFacets(
  parcelNodeId: string,
  facetsBase: string,
): Promise<BakedFacetsResponse | null> {
  const id = parcelNodeId.trim();
  if (!id) return null;
  const base = facetsBase.replace(/\/$/, "");
  const url = base.includes("/property-atoms")
    ? `${base}/${encodeURIComponent(id)}/facets`
    : `${base}/brokerage/v1/place/node/${encodeURIComponent(id)}/facets`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  } catch {
    return null;
  }
  if (!res.ok) {
    // 404 == not baked -> caller falls back to live. Any other status also
    // degrades to the live path rather than surfacing an error.
    return null;
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  const b = body as Partial<BakedFacetsResponse>;
  if (!b || typeof b !== "object" || !b.facets) return null;
  return b as BakedFacetsResponse;
}
