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

import { formatSetbackDisplay } from "../../api/_lib/setback-not-specified";
import { mapBuildableDisplay } from "./buildable-display-vocab";

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
    setbacks?: {
      front_ft: number;
      side_ft: number;
      rear_ft: number;
      not_specified?: {
        front?: boolean;
        side?: boolean;
        rear?: boolean;
        sideCorner?: boolean;
      };
    };
    buildableAreaPct?: number;
    buildableAreaSqFt?: number;
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
 * Card facet verification vocabulary (QA-3 / F1b):
 *
 *   - "present":  a real, verified value the card renders.
 *   - "absent":   honestly not available here (e.g. no zoning stamp). Value
 *                 may carry a specific label ("no zoning stamp here"); the
 *                 default UI string is "not verified here" when value is null.
 *   - "pending":  upstream facts are present but a derived field is not yet
 *                 on the atom (e.g. setbacks live, buildable % not computed).
 *                 NEVER say "not verified" for this — the data path is live.
 *   - "unknown":  no baked snapshot at all (pre-read / fell back to live), so
 *                 the card should not assert either presence or absence yet.
 */
export type FacetState = "present" | "absent" | "pending" | "unknown";

/** A card facet: its verification state plus its value when present/pending. */
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
  /**
   * Shared B3 vocabulary kind — same enum PDF SUMMARY uses for this parcel's
   * envelope inputs (pending | provisional | buildable-with-area | …).
   */
  buildableDisplayKind:
    | "absent"
    | "loading"
    | "pending"
    | "provisional"
    | "buildable-with-area"
    | "declined-consume"
    | "not_specified";
  /** Stable cross-surface probe token (map card ↔ inspect ↔ PDF). */
  buildableAgreementToken: string;
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
function absent<T>(message?: T): CardFacet<T> {
  return { state: "absent", value: message ?? null };
}
function pending<T>(message: T): CardFacet<T> {
  return { state: "pending", value: message };
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

  const zoningDecline =
    env?.status === "declined" ? env.declineReason ?? null : null;
  // atom_path_pending is a FAILED/INCOMPLETE READ shell, not honest absence —
  // never render it as "not verified here" (Gate C bounce bug).
  const zoning =
    cov.zoning === true && payload.zoning
      ? present(payload.zoning.district)
      : zoningDecline === "atom_path_pending"
        ? pending("Loading zoning…")
        : zoningDecline === "no-zoning-stamp"
          ? absent("no zoning stamp here")
          : zoningDecline === "zoning-absent" || zoningDecline === "no-setback-table"
            ? absent("no zoning here")
            : absent<string>();

  const acreage =
    cov.acreage === true && bf.acreage && typeof bf.acreage.value === "number"
      ? present(`${bf.acreage.value} ac`)
      : absent<string>();

  // Envelope-derived facets. Present only when the bake derived an envelope
  // (status ok / no-buildable-area with setbacks); a declined envelope is an
  // honest absence. Buildable % is a DERIVED field — when setbacks are present
  // but pct is missing, say pending (not "not verified").
  const hasEnvelope = cov.envelope === true && !!env && env.status !== "declined";
  const s = env?.setbacks;
  const silentAxes = !!(
    s?.not_specified?.front ||
    s?.not_specified?.side ||
    s?.not_specified?.rear
  );
  const setbacks =
    hasEnvelope && s
      ? present(formatSetbackDisplay(s))
      : zoningDecline === "atom_path_pending"
        ? pending("Loading setbacks…")
        : absent<string>();
  // B3: one shared mapper for map card / inspect (PDF uses the same module).
  const buildableVocab = mapBuildableDisplay({
    envelopeStatus:
      zoningDecline === "atom_path_pending"
        ? "declined"
        : env?.status ?? (hasEnvelope ? "ok" : null),
    declineReason:
      zoningDecline === "atom_path_pending"
        ? "atom_path_pending"
        : env?.status === "declined"
          ? env.declineReason ?? null
          : null,
    notSpecifiedAxes: silentAxes,
    buildableAreaPct:
      typeof env?.buildableAreaPct === "number" ? env.buildableAreaPct : null,
    buildableAreaSqFt:
      typeof env?.buildableAreaSqFt === "number" ? env.buildableAreaSqFt : null,
    hasGeometry: env?.geojson != null,
    provisional: env?.provisional === true,
  });
  const buildablePct: CardFacet<string> =
    buildableVocab.cardState === "present"
      ? present(buildableVocab.cardLabel ?? "")
      : buildableVocab.cardState === "pending"
        ? pending(buildableVocab.cardLabel ?? "pending")
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
    buildableDisplayKind: buildableVocab.kind,
    buildableAgreementToken: buildableVocab.agreementToken,
    provenance: {
      parcelSource: payload.provenance?.parcelSource ?? null,
      landUseSource: payload.provenance?.landUseSource ?? null,
      landUseGateBlocked: payload.provenance?.landUseGateBlocked === true,
      vintage: payload.provenance?.parcelVintage ?? null,
    },
    bakedAt: payload.bakedAt ?? null,
  };
}

/** Discriminated facets fetch — never conflate transient failure with absence. */
export type BakedFacetsFetchResult =
  | { kind: "ok"; data: BakedFacetsResponse }
  | { kind: "not_found" }
  | { kind: "transient"; message: string; status: number }
  | { kind: "error"; message: string; status: number };

const CLIENT_FACETS_ATTEMPTS = 4;
const CLIENT_FACETS_BACKOFF_MS = [500, 1_200, 2_000, 3_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBakedNodeFacetsOnce(
  parcelNodeId: string,
  facetsBase: string,
): Promise<BakedFacetsFetchResult> {
  const id = parcelNodeId.trim();
  if (!id) return { kind: "error", message: "parcelNodeId required", status: 0 };
  const base = facetsBase.replace(/\/$/, "");
  const url = base.includes("/property-atoms")
    ? `${base}/${encodeURIComponent(id)}/facets`
    : `${base}/brokerage/v1/place/node/${encodeURIComponent(id)}/facets`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  } catch (err) {
    return {
      kind: "transient",
      message: err instanceof Error ? err.message : String(err),
      status: 0,
    };
  }
  if (res.status === 404) return { kind: "not_found" };
  if (res.status === 503 || res.status === 502 || res.status === 504 || res.status === 429) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; retryable?: boolean };
      if (body?.message) message = body.message;
    } catch {
      /* ignore */
    }
    return { kind: "transient", message, status: res.status };
  }
  if (!res.ok) {
    return { kind: "error", message: `HTTP ${res.status}`, status: res.status };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: "transient", message: "facets response was not JSON", status: res.status };
  }
  const b = body as Partial<BakedFacetsResponse> & {
    error?: string;
    retryable?: boolean;
  };
  // Belt: some proxies may 200 a retryable envelope — treat as transient.
  if (b && typeof b === "object" && b.retryable === true) {
    return {
      kind: "transient",
      message: typeof b.error === "string" ? b.error : "retryable facets response",
      status: res.status,
    };
  }
  if (!b || typeof b !== "object" || !b.facets) {
    return { kind: "error", message: "facets payload missing", status: res.status };
  }
  return { kind: "ok", data: b as BakedFacetsResponse };
}

/**
 * Fetch a parcel node's facets through the same-origin dual-serve BFF,
 * ANONYMOUSLY (no key — the proxy attaches auth server-side).
 *
 * Retries transient upstream failures. Callers MUST keep a loading UI while
 * `kind === "transient"` — never render that as "not verified" / honest-absence.
 */
export async function fetchBakedNodeFacets(
  parcelNodeId: string,
  facetsBase: string,
): Promise<BakedFacetsFetchResult> {
  let last: BakedFacetsFetchResult = {
    kind: "error",
    message: "facets unset",
    status: 0,
  };
  for (let i = 0; i < CLIENT_FACETS_ATTEMPTS; i++) {
    const result = await fetchBakedNodeFacetsOnce(parcelNodeId, facetsBase);
    if (result.kind === "ok" || result.kind === "not_found" || result.kind === "error") {
      return result;
    }
    last = result;
    await sleep(CLIENT_FACETS_BACKOFF_MS[i] ?? 3_000);
  }
  return last;
}

/**
 * Legacy helper: ok → data, everything else → null.
 * Prefer the discriminated `fetchBakedNodeFacets` for inspect UI.
 */
export async function fetchBakedNodeFacetsOrNull(
  parcelNodeId: string,
  facetsBase: string,
): Promise<BakedFacetsResponse | null> {
  const result = await fetchBakedNodeFacets(parcelNodeId, facetsBase);
  return result.kind === "ok" ? result.data : null;
}
