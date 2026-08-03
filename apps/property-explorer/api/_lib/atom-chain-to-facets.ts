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
  sourceAdapter?: string | null;
}

/** R22/R24/R25/R26 — full-field + disclosure metadata surfaced on the PE card. */
export interface AtomChainSetbackDisplayMeta {
  minLotSize?: string;
  sideFireCodeDeferral?: boolean;
  sideCityLanguage?: string;
  resolvedDistrictCode?: string | null;
  splitZoneMinorZones?: Array<{ districtCode: string | null; shapeArea?: number }>;
  secondSource?: { source: string; note: string; citationUrl?: string };
}

export interface AtomChainSetbackRule {
  front?: number;
  side?: number;
  rear?: number;
  /** Interior side yard (AMENDMENT 2 R2); legacy `side` mirrors this. */
  sideInteriorFt?: number;
  sideCornerFt?: number;
  districtCode?: string | null;
  sourceAdapter?: string | null;
  sourceCodeAtomRef?: { atomDid?: string } | null;
  /** R24 full-field parity — surfaced on the card. */
  maxHeightFt?: number;
  maxImperviousPct?: number;
  minLotSize?: string;
  /** R22/R24/R25/R26 display + disclosure metadata. */
  displayMeta?: AtomChainSetbackDisplayMeta | null;
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
  reason?: string;
}

export interface AtomChainBuildableEnvelope {
  outcome?: AtomChainEnvelopeOutcome | null;
  geojson?: unknown;
  fetchedAt?: string;
  extractedAt?: string;
  sourceCitation?: string;
  depthWarmPromotion?: string;
  /** depth-warm honest decline — must surface on PE before generic pending. */
  warmVerifyDecline?: string;
  warmVerifyDeclineCode?: string;
}

export const DEPTH_WARM_PROMOTION_MARKER = "depth-warm-promoted-v1";

/** R13 — repealed / pre-layer-23 Bastrop city setback sources must not serve. */
function isStaleBastropCitySetbackRule(
  parcelNodeId: string,
  rule: AtomChainSetbackRule | null | undefined,
  zoningSourceAdapter?: string | null,
): boolean {
  if (!/^48021:[^/\s]+$/.test(parcelNodeId.trim()) || !rule) return false;
  const zAdapter = (zoningSourceAdapter ?? "").trim();
  const isCity =
    zAdapter.includes("bastrop-city") ||
    zAdapter.includes("txgio-zoning-stamp:bastrop-city-tx");
  if (!isCity) return false;
  const adapter = (rule.sourceAdapter ?? "").trim();
  if (adapter === "bastrop-per-parcel-record-layer-23") return false;
  const did = (rule.sourceCodeAtomRef?.atomDid ?? "").toLowerCase();
  if (
    did.includes("b3-code-april-2025") ||
    did.includes("bastrop-b3-code-april-2025")
  ) {
    return true;
  }
  if (
    adapter === "descriptor-fixture" ||
    adapter === "cortex-tier1-snapshot-breadth-bake"
  ) {
    return true;
  }
  return adapter !== "bastrop-per-parcel-record-layer-23";
}

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
      /** Distinct interior side when corner lot split is on the wire. */
      side_interior_ft?: number;
      side_corner_ft?: number;
      not_specified?: NotSpecifiedAxes;
      /** R22 — side yard resolved from a building/fire-code deferral (5ft). */
      side_fire_code_deferral?: boolean;
      /** City's verbatim side-yard language when deferred to building/fire code. */
      side_city_language?: string;
    };
    /** R24 full-field parity — surfaced on the card. */
    maxHeightFt?: number;
    maxImperviousPct?: number;
    minLotSize?: string;
    /** R26 — dominant district + minor zones on a split-zoned parcel. */
    splitZoneMinorZones?: Array<{ districtCode: string | null; shapeArea?: number }>;
    /** R25 — conflicting second source (e.g. Bastrop layer-83 Revisions). */
    secondSource?: { source: string; note: string; citationUrl?: string };
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
  /** True when baked cortex base facts were merged onto the atom-chain read. */
  baseFactsMerged?: boolean;
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
      side_interior_ft?: number;
      side_corner_ft?: number;
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
  const sideInterior =
    typeof rule.sideInteriorFt === "number" ? rule.sideInteriorFt : side;
  const sideCorner =
    typeof rule.sideCornerFt === "number" ? rule.sideCornerFt : undefined;
  const not_specified = notSpecifiedFromRule(rule, districtHint);
  const fireCodeDeferral = rule.displayMeta?.sideFireCodeDeferral === true;
  const sideCityLanguage = rule.displayMeta?.sideCityLanguage;
  return {
    front_ft: front,
    side_ft: side,
    rear_ft: rear,
    ...(sideCorner != null &&
    typeof sideInterior === "number" &&
    sideInterior !== sideCorner
      ? { side_interior_ft: sideInterior, side_corner_ft: sideCorner }
      : {}),
    ...(not_specified ? { not_specified } : {}),
    ...(fireCodeDeferral ? { side_fire_code_deferral: true } : {}),
    ...(sideCityLanguage ? { side_city_language: sideCityLanguage } : {}),
  };
}

/**
 * Merge the BAKED cortex base facts into an atom-chain facets response
 * (map UX cluster item 6 — data-path fix).
 *
 * The cortex facets endpoint serves acreage for ~100% of Bastrop parcels and
 * land-use for ~98.8%, but the atom-chain adapter hardcoded
 * facetCoverage.landUse/acreage to false and carried no base facts, so the
 * card said "not verified here" for facts that ARE verified. This merge adopts
 * ONLY the baked BASE FACTS (land-use, acreage, situs address/city/state,
 * county name) plus their coverage flags and land-use provenance.
 *
 * NEVER adopted (anti-zombie, Master WDLL 3.7): cortex zoning and cortex
 * envelope — the atom chain stays the sole product truth for both.
 *
 * Honesty: a baked-absent fact (null value, coverage false) stays honestly
 * absent — nothing is defaulted or invented. An unusable baked body returns
 * the atom response unchanged.
 */
export function mergeBakedBaseFacts(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const baked = (bakedBody as { facets?: PeBakedFacetPayload } | null | undefined)
    ?.facets;
  if (!baked || typeof baked !== "object") return atomResponse;

  const bakedBase = baked.baseFacts ?? {};
  const bakedCov = baked.facetCoverage ?? {};
  const atomFacets = atomResponse.facets;
  const atomBase = atomFacets.baseFacts ?? {};

  const landUse =
    bakedBase.landUse &&
    typeof bakedBase.landUse === "object" &&
    typeof bakedBase.landUse.code === "string" &&
    bakedBase.landUse.code.trim()
      ? bakedBase.landUse
      : null;
  const acreage =
    bakedBase.acreage &&
    typeof bakedBase.acreage === "object" &&
    typeof bakedBase.acreage.value === "number" &&
    Number.isFinite(bakedBase.acreage.value)
      ? bakedBase.acreage
      : null;
  const situsAddress =
    typeof bakedBase.situsAddress === "string" && bakedBase.situsAddress.trim()
      ? bakedBase.situsAddress
      : atomBase.situsAddress ?? null;
  const apn =
    (typeof atomBase.apn === "string" && atomBase.apn.trim() ? atomBase.apn : null) ??
    (typeof bakedBase.apn === "string" && bakedBase.apn.trim() ? bakedBase.apn : null);

  return {
    ...atomResponse,
    baseFactsMerged: true,
    facets: {
      ...atomFacets,
      countyFips: atomFacets.countyFips ?? baked.countyFips,
      countyName:
        typeof baked.countyName === "string" && baked.countyName.trim()
          ? baked.countyName
          : atomFacets.countyName,
      baseFacts: {
        apn,
        situsAddress,
        situsCity: bakedBase.situsCity ?? null,
        situsState: bakedBase.situsState ?? null,
        landUse,
        acreage,
      },
      facetCoverage: {
        ...atomFacets.facetCoverage,
        baseFacts:
          atomFacets.facetCoverage?.baseFacts === true ||
          bakedCov.baseFacts === true ||
          !!apn,
        // Coverage true when the baked side covers the facet OR carries a real
        // value; a baked-absent facet stays false (honest absence).
        landUse: bakedCov.landUse === true || !!landUse,
        acreage: bakedCov.acreage === true || !!acreage,
        // zoning + envelope stay ATOM-OWNED — never adopted from cortex.
      },
      provenance: {
        ...atomFacets.provenance,
        parcelVintage:
          baked.provenance?.parcelVintage ??
          atomFacets.provenance?.parcelVintage ??
          null,
        landUseSource: baked.provenance?.landUseSource ?? null,
        landUseGateBlocked: baked.provenance?.landUseGateBlocked === true,
      },
    },
  };
}

/**
 * Adapt atom-chain → PE facets. Returns null when the chain is empty/unusable
 * so the BFF can fall back to cortex.
 */
/**
 * Derive the corpus JURISDICTION KEY from a zoning source adapter id, so chat
 * atom-retrieval (and any consumer needing the stamped jurisdiction) can send
 * it. The stamp adapters carry it as a suffix, e.g.
 * `txgio-zoning-stamp:bastrop-city-tx` → `bastrop-city-tx`. Only a real
 * stamped jurisdiction key is returned; a bare/parcel-record adapter with no
 * jurisdiction suffix returns null (honest absence — never a fabricated key).
 */
export function jurisdictionKeyFromSourceAdapter(
  sourceAdapter: string | null | undefined,
): string | null {
  const a = (sourceAdapter ?? "").trim();
  if (!a) return null;
  const m = a.match(/(?:zoning-stamp|jurisdiction)[:/]([a-z0-9][a-z0-9-]*)/i);
  if (m && m[1]) return m[1].toLowerCase();
  return null;
}

function mapWarmVerifyDeclineEnvelope(
  envAtom: AtomChainBuildableEnvelope,
  district: string | null,
): PeBakedFacetPayload["envelope"] | null {
  const code = (envAtom.warmVerifyDeclineCode ?? "").trim();
  const message = (envAtom.warmVerifyDecline ?? "").trim();
  const outcomeReason =
    envAtom.outcome &&
    typeof envAtom.outcome === "object" &&
    typeof envAtom.outcome.reason === "string"
      ? envAtom.outcome.reason.trim()
      : "";
  const declineReason = code || "warm-verify-decline";
  const disclosure =
    message ||
    outcomeReason ||
    "Depth-warm verified honest decline — no envelope geometry served.";
  if (!code && !message && !outcomeReason) return null;
  return {
    status: "declined",
    declineReason,
    district: district ?? undefined,
    approximate: true,
    provisional: true,
    disclosure,
  };
}

export function adaptAtomChainToBakedFacets(
  chain: PropertyAtomChain | null | undefined,
): PeBakedFacetsResponse | null {
  if (!atomChainIsUsable(chain)) return null;
  const c = chain as PropertyAtomChain;
  const parcelNodeId = (c.parcelNodeId || "").trim();
  if (!parcelNodeId) return null;

  const zf = c.zoningFact ?? null;
  const zoningSourceAdapter =
    zf && typeof (zf as { sourceAdapter?: string }).sourceAdapter === "string"
      ? (zf as { sourceAdapter: string }).sourceAdapter
      : null;
  let rule = c.setbackRule ?? null;
  if (
    isStaleBastropCitySetbackRule(parcelNodeId, rule, zoningSourceAdapter)
  ) {
    rule = null;
  }
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
  // The stamped corpus jurisdiction key (from the zoning source adapter), so
  // chat atom-retrieval sends areaContext.jurisdictionKey and the answer can
  // carry cited atoms. Null when the adapter has no jurisdiction suffix.
  const jurisdictionKey = jurisdictionKeyFromSourceAdapter(zoningSourceAdapter);

  const setbacks = mapSetbacks(rule, district);
  // R24/R25/R26 — full-field parity + disclosure, surfaced onto any drawn envelope.
  const dm = rule?.displayMeta ?? null;
  const fullFields: Partial<NonNullable<PeBakedFacetPayload["envelope"]>> = rule
    ? {
        ...(typeof rule.maxHeightFt === "number" && rule.maxHeightFt > 0
          ? { maxHeightFt: rule.maxHeightFt }
          : {}),
        ...(typeof rule.maxImperviousPct === "number" && rule.maxImperviousPct > 0
          ? { maxImperviousPct: rule.maxImperviousPct }
          : {}),
        ...(rule.minLotSize || dm?.minLotSize
          ? { minLotSize: (rule.minLotSize || dm?.minLotSize) as string }
          : {}),
        ...(dm?.splitZoneMinorZones?.length
          ? { splitZoneMinorZones: dm.splitZoneMinorZones }
          : {}),
        ...(dm?.secondSource ? { secondSource: dm.secondSource } : {}),
      }
    : {};
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
  } else if (envAtom) {
    const warmDecline = mapWarmVerifyDeclineEnvelope(envAtom, district);
    if (warmDecline) {
      envelope = warmDecline;
      envelopeCovered = false;
    }
  }
  if (!envelope && !setbacks) {
    envelope = {
      status: "declined",
      declineReason: "setback-rule-pending",
      district: district ?? undefined,
      approximate: true,
      provisional: true,
      disclosure:
        "Setbacks pending re-warm from city per-parcel record — verify with city. " +
        "Repealed or pre-layer-23 sources are not served.",
    };
    envelopeCovered = false;
  } else if (!envelope && outcomeKind === "no-buildable-area" && silentAxes) {
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
  } else if (!envelope && outcomeKind === "no-buildable-area") {
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
  } else if (!envelope && (outcomeKind === "buildable" || setbacks)) {
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

  // R24/R25/R26 — merge full-field parity + disclosure onto the envelope whenever
  // the parcel has a district (present even on declined/no-buildable envelopes so
  // the card shows height/impervious/min-lot + the honest second-source callout).
  if (envelope && Object.keys(fullFields).length > 0) {
    envelope = { ...envelope, ...fullFields };
  }

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
      zoning: district
        ? { district, ...(jurisdictionKey ? { jurisdictionKey } : {}) }
        : null,
      envelope:
        envelope && depthWarm && setbacks
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
