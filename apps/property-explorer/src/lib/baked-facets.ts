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
import type {
  EnvelopeProvenanceRefs,
  SetbackFieldProvenance,
  SetbackFieldNotes,
} from "./buildable-envelope.js";

export type { EnvelopeProvenanceRefs, SetbackFieldProvenance, SetbackFieldNotes };

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
  zoning?: { district: string; jurisdictionKey?: string } | null;
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
      side_interior_ft?: number;
      side_corner_ft?: number;
      not_specified?: {
        front?: boolean;
        side?: boolean;
        rear?: boolean;
        sideCorner?: boolean;
      };
      /**
       * Per-axis governing-rule references for a not_specified cell (Elgin
       * setback-table ratification, 2026-08-04 directive 1). Present only
       * once a served table carries them — a conditional cell without this
       * still renders the pre-existing "not specified (build-to-line
       * governs)" treatment, never a bare dash claiming more than the data
       * supports.
       */
      governedBy?: SetbackFieldProvenance | null;
      /**
       * Per-axis provenance notes (ratification directive 2: "details spell
       * out in the X-ray") — the fuller rule text (story-split side yards,
       * corner cases, formula rears) behind the modeled minimum scalar.
       */
      fieldNotes?: SetbackFieldNotes | null;
    };
    buildableAreaPct?: number;
    buildableAreaSqFt?: number;
    disclosure?: string;
    emptyReason?: string;
    citationUrl?: string;
    geojson?: unknown;
    /**
     * Forward-compat, type-only (no baked backend serves this today): the
     * same atom-provenance shape as the live buildable-envelope path
     * (legacy-design-tools feat/envelope-provenance-refs), anticipated here
     * because the payload's `source: "baked-snapshot" | "atom-chain"`
     * discriminant already names an atom-chain-backed bake as a future
     * source. Optional — absent on every payload the current bake writes.
     */
    provenanceRefs?: EnvelopeProvenanceRefs;
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

/** Cortex inspect GET flood determination (PR 449). Root sibling of facets. */
export type FloodHazardFactCardInput = {
  state?: string;
  floodZone?: unknown;
  inSpecialFloodHazardArea?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  source?: unknown;
};

/** The endpoint envelope. */
export interface BakedFacetsResponse {
  parcelNodeId: string;
  adapterKey: string;
  source: "baked-snapshot" | "atom-chain";
  snapshotAt: string | null;
  facets: BakedFacetPayload;
  /**
   * Flood determination from flood-hazard-fact atoms. Absent when the BFF
   * did not copy it. Never populated from tier2.flood.
   */
  floodHazardFact?: FloodHazardFactCardInput;
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
  /**
   * Flood row from floodHazardFact only. `unknown` when the field is missing
   * (FacetRow hides it). Never derived from tier2.flood.
   */
  flood: CardFacet<string>;
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
  /**
   * Forward-compat, type-only atom-provenance refs threaded straight from
   * the envelope facet (see BakedFacetPayload.envelope.provenanceRefs).
   * Null on every payload today — no baked backend serves it yet.
   */
  provenanceRefs: EnvelopeProvenanceRefs | null;
  /** Per-axis governing-rule references, threaded from
   *  envelope.setbacks.governedBy. Null when the payload carries none. */
  setbackGovernedBy: SetbackFieldProvenance | null;
  /** Per-axis provenance notes for the X-ray/detail surface, threaded from
   *  envelope.setbacks.fieldNotes. Null when the payload carries none. */
  setbackFieldNotes: SetbackFieldNotes | null;
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
 * Map cortex-root floodHazardFact → a card facet.
 *
 * present zone / typed absence / named refusal. Missing field → unknown
 * (InspectCard hides the row). Never reads tier2.flood. Never invents a zone.
 * A refused fact never becomes a silent null — the code is the value.
 */
export function floodHazardFactToCardFacet(
  fact: FloodHazardFactCardInput | null | undefined,
): CardFacet<string> {
  if (!fact || typeof fact !== "object") {
    return { state: "unknown", value: null };
  }
  if (fact.state === "present") {
    const zone =
      typeof fact.floodZone === "string" && fact.floodZone.trim()
        ? fact.floodZone.trim()
        : null;
    if (zone) return present(`Zone ${zone}`);
    return present("Flood determination present (zone unstated)");
  }
  if (fact.state === "absent") {
    const absence = fact.absence;
    const reason =
      typeof absence?.reason === "string" && absence.reason.trim()
        ? absence.reason.trim()
        : null;
    const kind =
      typeof absence?.kind === "string" && absence.kind.trim()
        ? absence.kind.trim()
        : null;
    return absent(reason ?? kind ?? "typed absence");
  }
  if (fact.state === "refused") {
    const code =
      typeof fact.code === "string" && fact.code.trim()
        ? fact.code.trim()
        : "refused";
    return absent(code);
  }
  return { state: "unknown", value: null };
}

/**
 * Render a land-use fact WITH its provenance inline, e.g.
 * "A1 — Single-family residential (cad-roll · 2024)". Returns null when the
 * fact carries no code and no description (a genuine absence — never invent).
 */
function formatLandUseDisplay(
  lu: NonNullable<BakedFacetPayload["baseFacts"]>["landUse"],
): string | null {
  if (!lu) return null;
  const code = typeof lu.code === "string" ? lu.code.trim() : "";
  const description =
    typeof lu.description === "string" ? lu.description.trim() : "";
  const label =
    code && description ? `${code} — ${description}` : description || code;
  if (!label) return null;
  const prov = [lu.source, lu.vintage]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim());
  return prov.length > 0 ? `${label} (${prov.join(" · ")})` : label;
}

/**
 * Render an acreage fact WITH its method inline, e.g. "1.23 ac (cad-roll)".
 * The numeric value is rendered as-is (no rounding — no derived precision).
 * Returns null when there is no finite numeric value (genuine absence).
 */
function formatAcreageDisplay(
  ac: NonNullable<BakedFacetPayload["baseFacts"]>["acreage"],
): string | null {
  if (!ac || typeof ac.value !== "number" || !Number.isFinite(ac.value)) {
    return null;
  }
  const method =
    typeof ac.method === "string" && ac.method.trim() ? ac.method.trim() : null;
  return method ? `${ac.value} ac (${method})` : `${ac.value} ac`;
}

/**
 * Derive the card view-model from a baked payload. Pure + owner-free.
 *
 * GATING RULE (fix/pe-inspect-landuse-acreage): a genuinely present base-fact
 * VALUE is trusted and rendered — the `facetCoverage` boolean never suppresses
 * a real value the payload carries. Coverage only disambiguates a NULL value:
 *   - value present            → state:"present" (regardless of coverage flag)
 *   - value null + cov true    → absent WITH a specific label ("covered here,
 *                                but this parcel carries no value on record")
 *   - value null + cov falsy   → absent, default "not verified here" treatment
 * A facet that is honestly absent becomes state:"absent" — NEVER a blank that
 * reads as "nothing here" and never a fabricated or defaulted value.
 */
export function deriveBakedCardModel(
  payload: BakedFacetPayload,
  floodHazardFact?: FloodHazardFactCardInput | null,
): BakedCardModel {
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

  // Land-use: trust a present value (a stale/false coverage flag must not hide
  // real data the payload carries). Coverage only disambiguates a NULL:
  // Comal / gate-blocked counties bake landUse:null (honest absence).
  const landUseDisplay = formatLandUseDisplay(bf.landUse ?? null);
  const landUse = landUseDisplay
    ? present(landUseDisplay)
    : cov.landUse === true
      ? absent("no land-use value on record here")
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

  // Acreage: same rule — a real numeric value renders regardless of the
  // coverage flag; coverage only shades the wording of a genuine null.
  const acreageDisplay = formatAcreageDisplay(bf.acreage ?? null);
  const acreage = acreageDisplay
    ? present(acreageDisplay)
    : cov.acreage === true
      ? absent("no acreage value on record here")
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
      ? present(formatSetbackDisplay(s, s.governedBy ?? null))
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
    flood: floodHazardFactToCardFacet(floodHazardFact),
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
    provenanceRefs: env?.provenanceRefs ?? null,
    setbackGovernedBy: s?.governedBy ?? null,
    setbackFieldNotes: s?.fieldNotes ?? null,
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
