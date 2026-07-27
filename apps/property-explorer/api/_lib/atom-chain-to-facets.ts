// api/_lib/atom-chain-to-facets.ts
//
// Pure adapter: retrieval-api property atom-chain wire → Property Explorer
// baked-facets shape (facets.zoning / facets.envelope). Never invents a
// district or geometry. Honest-absence (Bexar no-zoning-stamp) maps to the
// same declineReason vocabulary cortex already serves.
//
// not_specified: live setback-rule atoms currently drop the flag; we re-attach
// B3 provenance by district so silent axes never render as real 0′ / "consume lot".

import {
  anyNotSpecified,
  buildToLineDisclosure,
  lookupNotSpecified,
  type NotSpecifiedAxes,
} from "./setback-not-specified.js";

export interface AtomChainAbsence {
  kind?: string;
  reason?: string;
}

export interface AtomChainZoningFact {
  district?: string | null;
  absence?: AtomChainAbsence | null;
  fetchedAt?: string;
  extractedAt?: string;
  parcelNodeId?: string;
}

export interface AtomChainSetbackRule {
  front?: number;
  side?: number;
  rear?: number;
  sideCornerFt?: number;
  districtCode?: string | null;
  /** Future wire: per-axis not_specified from emit-setback-rule. */
  fieldProvenance?: {
    front?: { notSpecified?: boolean };
    side?: { notSpecified?: boolean };
    rear?: { notSpecified?: boolean };
  } | null;
}

export interface AtomChainEnvelopeOutcome {
  kind?: string;
  areaSqFt?: number;
}

export interface AtomChainBuildableEnvelope {
  outcome?: AtomChainEnvelopeOutcome | null;
  geojson?: unknown;
  fetchedAt?: string;
  extractedAt?: string;
  sourceCitation?: string;
  depthWarmPromotion?: string;
}

/** Depth-warm promotion marker from engine R3 (27c WDLL 6/8). */
export const DEPTH_WARM_PROMOTION_MARKER = "depth-warm-promoted-v1";

export function isDepthWarmPromoted(
  chain: PropertyAtomChain | null | undefined,
): boolean {
  const env = chain?.buildableEnvelope;
  if (!env || typeof env !== "object") return false;
  if (env.depthWarmPromotion === DEPTH_WARM_PROMOTION_MARKER) return true;
  const citation = env.sourceCitation;
  return (
    typeof citation === "string" &&
    citation.includes("depth-warm-verified")
  );
}

/**
 * WDLL 8: warmed parcel read must not cold-rederive envelope — atom-chain only.
 */
export function shouldSkipColdDerive(
  chain: PropertyAtomChain | null | undefined,
): boolean {
  return isDepthWarmPromoted(chain) && atomChainIsUsable(chain);
}

/** Minimal retrieval GET /property-nodes/:id/atom-chain body. */
export interface PropertyAtomChain {
  parcelNodeId?: string;
  zoningFact?: AtomChainZoningFact | null;
  setbackRule?: AtomChainSetbackRule | null;
  buildableEnvelope?: AtomChainBuildableEnvelope | null;
  atoms?: unknown[] | null;
}

/** Mirrors apps/property-explorer/src/lib/baked-facets.ts BakedFacetPayload. */
export interface PeBakedFacetPayload {
  parcelNodeId?: string;
  countyFips?: string;
  countyName?: string;
  baseFacts?: {
    apn?: string | null;
    situsAddress?: string | null;
    situsCity?: string | null;
    situsState?: string | null;
    landUse?: { code: string; description?: string | null } | null;
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
      not_specified?: NotSpecifiedAxes;
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

export interface PeBakedFacetsResponse {
  parcelNodeId: string;
  adapterKey: string;
  source: "atom-chain";
  snapshotAt: string | null;
  facets: PeBakedFacetPayload;
  readPath: "atom-chain" | "atom-chain-warm";
}

export function isPropertyAtomPathEnabled(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): boolean {
  return env.PROPERTY_ATOM_PATH?.trim() === "1";
}

/**
 * Path shape after spine rewrite strip: property-atoms/:parcelNodeId/facets
 * (path[0] === 'property-atoms').
 */
export function parsePropertyAtomsPath(
  path: string[],
): { parcelNodeId: string } | null {
  if (path[0] !== "property-atoms") return null;
  const parcelNodeId = (path[1] || "").trim();
  const tail = path[2];
  if (!parcelNodeId || parcelNodeId.includes("..")) return null;
  if (tail !== "facets") return null;
  if (path.length !== 3) return null;
  // parcel ids are fips:propId (colon allowed; no slashes).
  if (parcelNodeId.includes("/")) return null;
  return { parcelNodeId };
}

/** True when the chain carries enough signal to serve (including honest absence). */
export function atomChainIsUsable(chain: PropertyAtomChain | null | undefined): boolean {
  if (!chain || typeof chain !== "object") return false;
  if (chain.zoningFact && typeof chain.zoningFact === "object") return true;
  if (Array.isArray(chain.atoms) && chain.atoms.length > 0) return true;
  return false;
}

function countyFipsFromNodeId(parcelNodeId: string): string | undefined {
  const fips = parcelNodeId.split(":")[0]?.trim();
  return fips && /^\d{5}$/.test(fips) ? fips : undefined;
}

function apnFromNodeId(parcelNodeId: string): string | undefined {
  const rest = parcelNodeId.split(":")[1]?.trim();
  return rest || undefined;
}

function notSpecifiedFromRule(
  rule: AtomChainSetbackRule,
  districtHint: string | null | undefined,
): NotSpecifiedAxes | undefined {
  const fromWire: NotSpecifiedAxes = {};
  const fp = rule.fieldProvenance;
  if (fp?.front?.notSpecified) fromWire.front = true;
  if (fp?.side?.notSpecified) fromWire.side = true;
  if (fp?.rear?.notSpecified) fromWire.rear = true;
  const fromTable = lookupNotSpecified(rule.districtCode ?? districtHint);
  const merged: NotSpecifiedAxes = { ...(fromTable ?? {}), ...fromWire };
  return anyNotSpecified(merged) ? merged : undefined;
}

function mapSetbacks(
  rule: AtomChainSetbackRule | null | undefined,
  districtHint: string | null | undefined,
):
  | {
      front_ft: number;
      side_ft: number;
      rear_ft: number;
      not_specified?: NotSpecifiedAxes;
    }
  | undefined {
  if (!rule) return undefined;
  const front = rule.front;
  const side = rule.side;
  const rear = rule.rear;
  if (
    typeof front !== "number" ||
    typeof side !== "number" ||
    typeof rear !== "number"
  ) {
    return undefined;
  }
  const not_specified = notSpecifiedFromRule(rule, districtHint);
  return {
    front_ft: front,
    side_ft: side,
    rear_ft: rear,
    ...(not_specified ? { not_specified } : {}),
  };
}

/**
 * Adapt atom-chain → PE facets. Returns null when the chain is empty/unusable
 * so the BFF can fall back to cortex.
 */
export function adaptAtomChainToBakedFacets(
  chain: PropertyAtomChain | null | undefined,
): PeBakedFacetsResponse | null {
  if (!atomChainIsUsable(chain)) return null;
  const c = chain as PropertyAtomChain;
  const parcelNodeId = (c.parcelNodeId || "").trim();
  if (!parcelNodeId) return null;

  const zf = c.zoningFact ?? null;
  const rule = c.setbackRule ?? null;
  const envAtom = c.buildableEnvelope ?? null;
  const absenceKind =
    zf?.absence && typeof zf.absence.kind === "string"
      ? zf.absence.kind.trim()
      : "";
  const absenceReason =
    zf?.absence && typeof zf.absence.reason === "string"
      ? zf.absence.reason
      : undefined;

  // Honest absence: never invent a district (Bexar no-zoning-stamp).
  const hasDistrict =
    !absenceKind && typeof zf?.district === "string" && zf.district.trim().length > 0;
  const district = hasDistrict ? (zf!.district as string).trim() : null;

  const setbacks = mapSetbacks(rule, district);
  const outcomeKind =
    envAtom?.outcome && typeof envAtom.outcome.kind === "string"
      ? envAtom.outcome.kind
      : null;
  const areaSqFt =
    envAtom?.outcome && typeof envAtom.outcome.areaSqFt === "number"
      ? envAtom.outcome.areaSqFt
      : undefined;
  const geojson = envAtom?.geojson;
  const ns = setbacks?.not_specified;
  const silentAxes = anyNotSpecified(ns);

  let envelope: PeBakedFacetPayload["envelope"] = null;
  let envelopeCovered = false;

  if (absenceKind === "no-zoning-stamp") {
    // Align with cortex absentZoningHonesty / declineReason vocabulary.
    envelope = {
      status: "declined",
      declineReason: "no-zoning-stamp",
      approximate: true,
      provisional: true,
      disclosure:
        absenceReason ||
        "No zoning stamp on this parcel — honest absence; no district invented.",
    };
    envelopeCovered = false;
  } else if (!hasDistrict) {
    envelope = {
      status: "declined",
      declineReason: absenceKind || "zoning-absent",
      approximate: true,
      provisional: true,
      disclosure: absenceReason,
    };
    envelopeCovered = false;
  } else if (!setbacks) {
    envelope = {
      status: "declined",
      declineReason: "setback-rule-pending",
      district: district ?? undefined,
      approximate: true,
      provisional: true,
      disclosure: "Zoning present; setback-rule atom not yet on chain.",
    };
    envelopeCovered = false;
  } else if (outcomeKind === "no-buildable-area" && silentAxes) {
    // Stale breadth bake treated not_specified zeros as real 0 → "consume lot".
    // Remap: keep setbacks, drop the false empty claim; never fabricate geometry.
    envelope = {
      status: "ok",
      district: district ?? undefined,
      setbacks,
      approximate: true,
      provisional: true,
      disclosure: buildToLineDisclosure(ns),
    };
    envelopeCovered = true;
  } else if (outcomeKind === "no-buildable-area") {
    envelope = {
      status: "no-buildable-area",
      district: district ?? undefined,
      setbacks,
      // Honest zero — setbacks consume the lot (QA-3: not "not verified").
      buildableAreaPct: 0,
      approximate: true,
      provisional: true,
      emptyReason: "Setbacks consume the lot — no buildable area remains.",
      ...(typeof areaSqFt === "number" ? { buildableAreaSqFt: areaSqFt } : {}),
      ...(geojson !== undefined ? { geojson } : {}),
    };
    envelopeCovered = true;
  } else if (outcomeKind === "buildable" || setbacks) {
    // Proof atoms may omit geojson / pct — honest partial OK; do not fabricate.
    // When pct is absent, baked-facets marks buildable as pending (QA-3).
    // When silent axes exist, never publish a pct that treated them as 0 ft.
    const pctFromAtom =
      !silentAxes &&
      envAtom?.outcome &&
      typeof (envAtom.outcome as { buildableAreaPct?: unknown }).buildableAreaPct ===
        "number"
        ? (envAtom.outcome as { buildableAreaPct: number }).buildableAreaPct
        : undefined;
    const baseDisclosure = silentAxes
      ? buildToLineDisclosure(ns)
      : geojson === undefined || geojson === null
        ? "Atom-chain envelope (setbacks present; geometry absent on proof atom — not fabricated)."
        : "Atom-chain buildable envelope.";
    envelope = {
      status: "ok",
      district: district ?? undefined,
      setbacks,
      approximate: true,
      provisional: true,
      disclosure: baseDisclosure,
      ...(typeof pctFromAtom === "number" ? { buildableAreaPct: pctFromAtom } : {}),
      // Warm/buildable areaSqFt is honest even when side/rear are build-to-line
      // silent — do NOT strip it. SilentAxes only blocks pct that treated
      // not_specified axes as 0 ft (the false consume-lot class).
      ...(typeof areaSqFt === "number" && areaSqFt > 0
        ? { buildableAreaSqFt: areaSqFt }
        : {}),
      ...(geojson !== undefined && geojson !== null ? { geojson } : {}),
    };
    envelopeCovered = true;
  }

  const bakedAt =
    envAtom?.extractedAt ||
    envAtom?.fetchedAt ||
    zf?.extractedAt ||
    zf?.fetchedAt ||
    null;

  const apn = apnFromNodeId(parcelNodeId);
  const depthWarm = isDepthWarmPromoted(c);

  return {
    parcelNodeId,
    adapterKey: "property-atom-chain",
    source: "atom-chain",
    snapshotAt: bakedAt,
    readPath: depthWarm ? "atom-chain-warm" : "atom-chain",
    facets: {
      parcelNodeId,
      countyFips: countyFipsFromNodeId(parcelNodeId),
      baseFacts: apn
        ? {
            apn,
            landUse: null,
            acreage: null,
            situsAddress: null,
          }
        : undefined,
      zoning: district ? { district } : null,
      envelope:
        envelope && depthWarm
          ? {
              ...envelope,
              disclosure:
                "Depth-warm verified envelope from promoted ledger — no live re-derive (27c WDLL 8).",
            }
          : envelope,
      facetCoverage: {
        baseFacts: !!apn,
        landUse: false,
        acreage: false,
        zoning: !!district,
        envelope: envelopeCovered,
      },
      provenance: {
        parcelSource: "property-atom-chain",
        parcelVintage: null,
        landUseSource: null,
        landUseGateBlocked: false,
        ...(depthWarm ? { depthWarmPromoted: true as const } : {}),
      },
      bakedAt: bakedAt ?? undefined,
    },
  };
}
