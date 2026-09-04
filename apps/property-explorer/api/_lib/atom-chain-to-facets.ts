// api/_lib/atom-chain-to-facets.ts
//
// Pure adapter: retrieval-api property atom-chain wire → Property Explorer
// baked-facets shape (facets.zoning / facets.envelope). Never invents a
// district or geometry. Honest-absence (Bexar no-zoning-stamp) maps to the
// same declineReason vocabulary cortex already serves.
//
// not_specified: live setback-rule atoms currently drop the flag; we re-attach
// B3 provenance by district so silent axes never render as real 0′ / "consume lot".

import { resolveCodifiedSetbacksForStamp } from "./codified-setback-from-zoning.js";
import {
  anyNotSpecified,
  buildToLineDisclosure,
  lookupNotSpecified,
  type NotSpecifiedAxes,
} from "./setback-not-specified.js";
import { withVerdictLayerFields } from "./verdict-layer-merge.js";

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

/** R13 — layer-23 per-parcel record is the live Bastrop city setback source. */
export const BASTROP_LIVE_SETBACK_ADAPTER = "bastrop-per-parcel-record-layer-23";

function isBastropCityZoningAdapter(
  zoningSourceAdapter: string | null | undefined,
): boolean {
  const zAdapter = (zoningSourceAdapter ?? "").trim();
  return (
    zAdapter.includes("bastrop-city") ||
    zAdapter.includes("txgio-zoning-stamp:bastrop-city-tx")
  );
}

/**
 * True when the atom-chain carries a live setback-rule (layer-23 for Bastrop
 * city parcels). Depth-warm promoted scalars do not count — they must not block
 * live re-derive or mask the authoritative per-parcel record.
 */
export function hasLiveAtomChainSetbackRule(
  parcelNodeId: string,
  rule: AtomChainSetbackRule | null | undefined,
  zoningSourceAdapter: string | null | undefined,
): boolean {
  if (!rule) return false;
  if (!mapSetbacks(rule, rule.districtCode)) return false;
  if (
    /^48021:[^/\s]+$/.test(parcelNodeId.trim()) &&
    isBastropCityZoningAdapter(zoningSourceAdapter)
  ) {
    return (rule.sourceAdapter ?? "").trim() === BASTROP_LIVE_SETBACK_ADAPTER;
  }
  if (/^48021:[^/\s]+$/.test(parcelNodeId.trim())) {
    return false;
  }
  return true;
}

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
  if (!isDepthWarmPromoted(chain) || !atomChainIsUsable(chain)) return false;
  const c = chain as PropertyAtomChain;
  const parcelNodeId = (c.parcelNodeId || "").trim();
  const zf = c.zoningFact ?? null;
  const zoningSourceAdapter =
    zf && typeof (zf as { sourceAdapter?: string }).sourceAdapter === "string"
      ? (zf as { sourceAdapter: string }).sourceAdapter
      : null;
  let rule = c.setbackRule ?? null;
  if (isStaleBastropCitySetbackRule(parcelNodeId, rule, zoningSourceAdapter)) {
    rule = null;
  }
  if (hasLiveAtomChainSetbackRule(parcelNodeId, rule, zoningSourceAdapter)) {
    return false;
  }
  return true;
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
    /**
     * C4 / liveBuildablePct nest. Written only when a percent is a real
     * number. Absent when the lot area is unknown — never a 0 standing in
     * for a missing denominator.
     */
    summary?: {
      buildableAreaPct: number;
      buildableAreaSqFt: number;
      parcelAreaSqFt: number;
    };
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
    structural?: boolean;
  };
  /** P-63 doc 19 layer wire for living area (from cortex structuralFact). */
  livingAreaSqft?:
    | { status: "populated"; value: number }
    | {
        status: "absent";
        verdict: string;
        authority: string;
        scopeSearched: string;
        asOf: string;
        basis: string;
      }
    | null;
  /** CAD structural year from cortex structuralFact. Never a listing year. */
  yearBuilt?:
    | { status: "populated"; value: number }
    | {
        status: "absent";
        verdict: string;
        authority: string;
        scopeSearched: string;
        asOf: string;
        basis: string;
      }
    | null;
  /** CAD source for yearBuilt. Absent means the card refuses a bare year. */
  yearBuiltSource?: string | null;
  provenance?: {
    parcelSource?: string;
    parcelVintage?: string | null;
    landUseSource?: string | null;
    landUseGateBlocked?: boolean;
  };
  bakedAt?: string;
}

/** Cortex inspect GET sibling of `facets` / `tier2` (PR 449). */
export type FloodHazardFactWire = {
  state: "present" | "absent" | "refused";
  floodZone?: unknown;
  inSpecialFloodHazardArea?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  zones?: unknown;
};

/**
 * Cortex inspect GET sibling of `facets` / `tier2` / `floodHazardFact` (s7).
 * Copied from the cortex JSON ROOT only. Never populated from
 * facets.baseFacts.landUse (cad-roll retiredStore).
 */
export type LandUseFactWire = {
  state: "present" | "absent" | "refused";
  landUseCode?: unknown;
  landUseLabel?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  taxYear?: unknown;
  boundAs?: unknown;
  tried?: unknown;
  entityId?: unknown;
  sourceAdapter?: unknown;
};

/**
 * Cortex inspect GET sibling of `facets` / `tier2` / `floodHazardFact` /
 * `landUseFact` (P-48 / LDT 451). Copied from the cortex JSON ROOT only.
 * Never populated from bake / CAD / mud-pid.
 */
export type SpecialDistrictFactWire = {
  state: "present" | "absent" | "refused";
  districtId?: unknown;
  districtType?: unknown;
  districtName?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  boundAs?: unknown;
  tried?: unknown;
  entityId?: unknown;
  sourceAdapter?: unknown;
};

/**
 * Cortex inspect GET sibling (P-49 / rrc-pipeline-fact). Spatial overlay at
 * WRITE time — no :sd: / :pipeline: picker on this family.
 */
export type PipelineFactWire = {
  state: "present" | "absent" | "refused";
  nearPipeline?: unknown;
  bufferMeters?: unknown;
  nearestPipelineDistanceMeters?: unknown;
  t4permit?: unknown;
  p5Num?: unknown;
  operatorName?: unknown;
  systemName?: unknown;
  commodity?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  boundAs?: unknown;
  tried?: unknown;
  entityId?: unknown;
  sourceAdapter?: unknown;
};

/**
 * Cortex inspect GET sibling (P-50 / well-fact). Spatial overlay at WRITE
 * time — writer keys `${parcel}:${wellKey}`. No :sd: / :well: picker. No
 * pipeline ANY bind. Does not share the texas-rrc key.
 */
export type WellFactWire = {
  state: "present" | "absent" | "refused";
  apiNumber14?: unknown;
  wellStatus?: unknown;
  operatorName?: unknown;
  parcelRelation?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  reason?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  boundAs?: unknown;
  tried?: unknown;
  entityId?: unknown;
  sourceAdapter?: unknown;
};

/**
 * Cortex inspect GET sibling (P-51 / building-footprint). Spatial overlay at
 * WRITE time — writer keys `${parcelNodeId}:footprint:${footprintId}`.
 * structureRole is body.structureRole, never the last entity_id token.
 * No :sd: / :footprint: picker. No pipeline ANY bind. Does not share the
 * texas-rrc key.
 */
export type BuildingFootprintFactWire = {
  state: "present" | "absent" | "refused";
  structureRole?: unknown;
  footprintId?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  reason?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  boundAs?: unknown;
  tried?: unknown;
  entityId?: unknown;
  sourceAdapter?: unknown;
};

/**
 * Cortex inspect GET sibling (P-53 / property-boundary-edge). Writer keys
 * `${countyFips}:${propId}:boundary:${edgeIndex}`. role is body.role,
 * never the last entity_id token. Geometry is the atom body. No :sd: /
 * :boundary: picker. No pipeline ANY bind. Does not share the texas-rrc
 * key. Never a GIS parcel outline / txgio_parcel / bake ring.
 */
export type BoundaryEdgeFactWire = {
  state: "present" | "absent" | "refused";
  role?: unknown;
  edgeIndex?: unknown;
  adjacencyKind?: unknown;
  frontBasis?: unknown;
  edges?: unknown;
  interior?: unknown;
  propertyLineTags?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  reason?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  boundAs?: unknown;
  tried?: unknown;
  entityId?: unknown;
  sourceAdapter?: unknown;
  extractedAt?: unknown;
};

/**
 * Cortex inspect GET sibling (P-54 / owner-fact). Writer keys
 * `${parcelNodeId}:${taxYear}`. Identified-session only. Anonymous is
 * typed refusal code=identified-session-required with no ownerName.
 * No :sd: picker. No pipeline ANY bind. Does not share the texas-rrc
 * key. Never a bake / cad-parcel-roll / GIS owner.
 */
/**
 * Cortex inspect GET sibling (P-76 / city-limits). PIP against
 * `tx_city_boundary`, not an atom. ETJ is typed absence (`etjStatus:
 * unresolved`). No ETJ buffer ring on this wire.
 */
export type CityLimitsFactWire = {
  status: "incorporated" | "unincorporated" | "unmeasured";
  etjStatus: "unresolved";
  source: "tx_city_boundary";
  basis: string;
  cityName?: string;
  geoId?: string;
  gnis?: string | null;
};

export type OwnerFactWire = {
  state: "present" | "absent" | "refused";
  taxYear?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  reason?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  boundAs?: unknown;
  tried?: unknown;
  entityId?: unknown;
  sourceAdapter?: unknown;
  extractedAt?: unknown;
};

/**
 * Cortex inspect GET sibling (acquire-wave12 / school-district-fact).
 * Copied from the cortex JSON ROOT only.
 */
export type SchoolDistrictFactWire = {
  state: "present" | "absent" | "refused";
  districtName?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  reason?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  boundAs?: unknown;
  tried?: unknown;
  entityId?: unknown;
  sourceAdapter?: unknown;
};

/**
 * Cortex inspect GET sibling (acquire-wave12 / utility-service-fact).
 * Copied from the cortex JSON ROOT only. Distinct from the `whoServes`
 * lookup — never merged with it.
 *
 * CONFIRMED SHAPE (2026-09-04), verified first-hand against
 * legacy-design-tools `artifacts/api-server/src/lib/utilityServiceFactRead.ts`
 * on main as of the PR #600 merge (212f09f0). `state` stays top-level on a
 * flat object exactly as `isUtilityServiceFactWire` below already expects
 * — the field is NOT list-shaped or array-wrapped at the wire boundary, so
 * that guard never rejected it. The actual defect was one layer down: the
 * resolver (fact-sheet-resolver.ts) previously read nonexistent
 * `provider`/`serviceType` keys instead of the real `water`/`sewer`
 * companion-row slots, so a `present` fact was silently mischaracterized
 * as absent rather than hidden. Water and sewer are independent slots —
 * see the real source file's module doc — either or both `null`, never
 * both null on `present`. No electric slot exists; never invent one.
 */
export type UtilityServiceFactWire = {
  state: "present" | "absent" | "refused";
  water?: unknown;
  sewer?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  reason?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  boundAs?: unknown;
  tried?: unknown;
  entityId?: unknown;
  sourceAdapter?: unknown;
};

/**
 * Cortex inspect GET sibling (acquire-wave12 / overlay-districts-fact).
 * Copied from the cortex JSON ROOT only.
 *
 * OPEN QUESTION, unverified against the LDT projector (cutover PRs not
 * merged yet): factory close records show this rail as LIST-shaped too —
 * multiple companion rows per parcel, each carrying real per-district
 * content (e.g. Bastrop Character-District rows carry CD_Name / CD_Desc /
 * Shape__Area), not just a bare name. `names?: unknown` below only keeps
 * room for a flat array of strings; if the served shape is instead an
 * array of richer per-district records (or the fact itself is an array
 * rather than an object with a top-level `state`), `isOverlayDistrictsFactWire`
 * rejects it outright and this field is treated as absent from the wire —
 * permanently, since it is a shape mismatch, not a missing-field gap.
 * Confirm the served shape before cutover so this type (and
 * ParcelFactSheet's `overlayDistricts`) can carry per-district
 * name/description/area if that data is meant to surface.
 */
export type OverlayDistrictsFactWire = {
  state: "present" | "absent" | "refused";
  names?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  reason?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  boundAs?: unknown;
  tried?: unknown;
  entityId?: unknown;
  sourceAdapter?: unknown;
};

/**
 * Cortex inspect GET sibling (acquire-wave12 / ag-valuation-fact).
 * Copied from the cortex JSON ROOT only.
 *
 * CONFIRMED SHAPE (2026-09-04), verified first-hand against
 * legacy-design-tools `artifacts/api-server/src/lib/agValuationFactRead.ts`
 * on branch `feat/b-acquire-wave12-serve-agvaluation` (PR #602, OPEN — not
 * yet merged, caught before it could go live). `entries` is an ARRAY —
 * plural, not a picked lead, since a parcel can carry several distinct
 * land-record segments. Superseded an earlier flat
 * hasAgValuation/exemptionType guess that predated reading the real
 * served type.
 */
export type AgValuationFactWire = {
  state: "present" | "absent" | "refused";
  entries?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  reason?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  boundAs?: unknown;
  tried?: unknown;
  entityId?: unknown;
  sourceAdapter?: unknown;
};

/**
 * Cortex inspect GET sibling (acquire-wave12 / max-impervious-cover-fact).
 * Copied from the cortex JSON ROOT only. Distinct from the per-axis setback
 * rule's own `maxImperviousPct` sub-field — never derived from that.
 *
 * CONFIRMED SHAPE (2026-09-04), verified first-hand against
 * legacy-design-tools
 * `artifacts/api-server/src/lib/maxImperviousCoverPctFactRead.ts` on branch
 * `feat/b-acquire-wave12-serve-maximperviouscoverpct` (PR #604, OPEN — not
 * yet merged, caught before it could go live). The real key is `percent`,
 * not `maxImperviousCoverPct` — superseded an earlier guess that the inner
 * key would echo the outer rail name.
 */
export type MaxImperviousCoverPctFactWire = {
  state: "present" | "absent" | "refused";
  percent?: unknown;
  watershedType?: unknown;
  inRechargeZone?: unknown;
  crosswalkCitation?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  reason?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  evaluatedAt?: unknown;
  boundAs?: unknown;
  tried?: unknown;
  entityId?: unknown;
  sourceAdapter?: unknown;
};

export interface PeBakedFacetsResponse {
  parcelNodeId: string;
  adapterKey: string;
  source: "atom-chain";
  snapshotAt: string | null;
  facets: PeBakedFacetPayload;
  readPath: "atom-chain" | "atom-chain-warm";
  /** True when baked cortex base facts were merged onto the atom-chain read. */
  baseFactsMerged?: boolean;
  /**
   * Flood determination from flood-hazard-fact atoms. Copied from the cortex
   * JSON ROOT only. Never populated from tier2.flood.
   */
  floodHazardFact?: FloodHazardFactWire;
  /**
   * Land use from land-use-fact atoms. Copied from the cortex JSON ROOT only.
   * Never populated from facets.baseFacts.landUse.
   */
  landUseFact?: LandUseFactWire;
  /**
   * Special district from special-district-fact atoms. Copied from the cortex
   * JSON ROOT only. Never populated from bake / CAD / mud-pid.
   */
  specialDistrictFact?: SpecialDistrictFactWire;
  /**
   * Pipeline from rrc-pipeline-fact atoms. Copied from the cortex JSON ROOT
   * only. Never populated from bake / CAD / texas-rrc GIS.
   */
  pipelineFact?: PipelineFactWire;
  /**
   * Well from well-fact atoms. Copied from the cortex JSON ROOT only.
   * Never populated from bake / CAD / texas-rrc GIS / tx_rrc_well.
   */
  wellFact?: WellFactWire;
  /**
   * Footprint from building-footprint atoms. Copied from the cortex JSON
   * ROOT only. Never populated from bake / CAD / GIS / tx_building_footprint.
   */
  buildingFootprintFact?: BuildingFootprintFactWire;
  /**
   * Boundary from property-boundary-edge atoms. Copied from the cortex JSON
   * ROOT only. Never populated from bake / CAD / GIS / txgio_parcel /
   * parcel ring.
   */
  boundaryEdgeFact?: BoundaryEdgeFactWire;
  /**
   * Owner from owner-fact atoms. Copied from the cortex JSON ROOT only.
   * Never populated from bake / CAD / cad-parcel-roll / GIS owner.
   * Identified-session only.
   */
  ownerFact?: OwnerFactWire;
  /**
   * City limits from tx_city_boundary PIP (P-76). Copied from the cortex
   * JSON ROOT only. Never populated from situsCity / bake / atom chain.
   * ETJ is typed absence only — no buffer ring.
   */
  cityLimitsFact?: CityLimitsFactWire;
  /**
   * Structural/CAMA from structural-fact read (P-63). Copied from cortex JSON
   * ROOT only. Never upgraded lookup-failed → absent-verified in transit.
   */
  structuralFact?: StructuralFactWire;
  /**
   * School district from school-district-fact atoms (acquire-wave12).
   * Copied from the cortex JSON ROOT only.
   */
  schoolDistrictFact?: SchoolDistrictFactWire;
  /**
   * Utility service from utility-service-fact atoms (acquire-wave12).
   * Copied from the cortex JSON ROOT only. Distinct from `whoServes`.
   */
  utilityServiceFact?: UtilityServiceFactWire;
  /**
   * Overlay districts from overlay-districts-fact atoms (acquire-wave12).
   * Copied from the cortex JSON ROOT only.
   */
  overlayDistrictsFact?: OverlayDistrictsFactWire;
  /**
   * Agricultural valuation from ag-valuation-fact atoms (acquire-wave12).
   * Copied from the cortex JSON ROOT only.
   */
  agValuationFact?: AgValuationFactWire;
  /**
   * Max impervious cover percentage from max-impervious-cover-fact atoms
   * (acquire-wave12). Copied from the cortex JSON ROOT only.
   */
  maxImperviousCoverPctFact?: MaxImperviousCoverPctFactWire;
}

/** Cortex inspect GET sibling — P-63 verdict layer serve. */
export type StructuralFactWire = {
  state?: "present";
  status?: "absent";
  verdict?: string;
  authority?: string;
  scopeSearched?: string;
  asOf?: string;
  basis?: string;
  provenanceClass?: string;
  source?: string;
  livingAreaSqft?: number | null;
  yearBuilt?: number | null;
  countyFips?: string;
  propId?: string;
  taxYear?: number;
  tier?: string;
  sourceVintage?: string | null;
};

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
 * Cortex inspect GET sibling of `facets` / `tier2` (PR 449). Copied from the
 * cortex JSON ROOT only. Never derived from `tier2.flood`.
 */
export function isFloodHazardFactWire(
  value: unknown,
): value is FloodHazardFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/** Cortex JSON ROOT only. Never reads `tier2.flood` or a nested facets copy. */
export function floodHazardFactFromCortexRoot(
  bakedBody: unknown,
): FloodHazardFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { floodHazardFact?: unknown }).floodHazardFact;
  return isFloodHazardFactWire(fact) ? fact : undefined;
}

function withFloodHazardFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = floodHazardFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, floodHazardFact: fact };
}

/** Cortex inspect GET sibling of `facets` / `tier2` / `floodHazardFact` (s7). */
export function isLandUseFactWire(value: unknown): value is LandUseFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/**
 * Cortex JSON ROOT only. Never reads `facets.baseFacts.landUse` or a nested
 * cad-roll copy. A cad-roll `{code, description}` object parked on the root
 * has no state and is rejected.
 */
export function landUseFactFromCortexRoot(
  bakedBody: unknown,
): LandUseFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { landUseFact?: unknown }).landUseFact;
  return isLandUseFactWire(fact) ? fact : undefined;
}

function withLandUseFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = landUseFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, landUseFact: fact };
}

/** Cortex inspect GET sibling of flood / land-use (P-48 / LDT 451). */
export function isSpecialDistrictFactWire(
  value: unknown,
): value is SpecialDistrictFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/**
 * Cortex JSON ROOT only. Never reads bake / CAD / mud-pid or a nested
 * facets copy. A bake `{districtType, districtName}` object parked on the
 * root has no state and is rejected.
 */
export function specialDistrictFactFromCortexRoot(
  bakedBody: unknown,
): SpecialDistrictFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { specialDistrictFact?: unknown }).specialDistrictFact;
  return isSpecialDistrictFactWire(fact) ? fact : undefined;
}

function withSpecialDistrictFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = specialDistrictFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, specialDistrictFact: fact };
}

/** Cortex inspect GET sibling of flood / land-use / special-district (P-49). */
export function isPipelineFactWire(
  value: unknown,
): value is PipelineFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/**
 * Cortex JSON ROOT only. Never reads bake / CAD / texas-rrc GIS or a nested
 * facets copy. A bake / GIS object parked on the root has no state and is
 * rejected. No :sd: / :pipeline: picker.
 */
export function pipelineFactFromCortexRoot(
  bakedBody: unknown,
): PipelineFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { pipelineFact?: unknown }).pipelineFact;
  return isPipelineFactWire(fact) ? fact : undefined;
}

function withPipelineFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = pipelineFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, pipelineFact: fact };
}

/** Cortex inspect GET sibling of flood / land-use / special-district / pipeline (P-50). */
export function isWellFactWire(value: unknown): value is WellFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/**
 * Cortex JSON ROOT only. Never reads bake / CAD / texas-rrc GIS /
 * tx_rrc_well or a nested facets copy. A bake / GIS object parked on the
 * root has no state and is rejected. No :sd: / :well: picker.
 */
export function wellFactFromCortexRoot(
  bakedBody: unknown,
): WellFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { wellFact?: unknown }).wellFact;
  return isWellFactWire(fact) ? fact : undefined;
}

function withWellFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = wellFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, wellFact: fact };
}

/** Cortex inspect GET sibling of flood / land-use / special-district / pipeline / well (P-51). */
export function isBuildingFootprintFactWire(
  value: unknown,
): value is BuildingFootprintFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/**
 * Cortex JSON ROOT only. Never reads bake / CAD / GIS /
 * tx_building_footprint or a nested facets copy. A bake / GIS object parked
 * on the root has no state and is rejected. No :sd: / :footprint: picker.
 * Does not parse the last entity_id token as structureRole.
 */
export function buildingFootprintFactFromCortexRoot(
  bakedBody: unknown,
): BuildingFootprintFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { buildingFootprintFact?: unknown })
    .buildingFootprintFact;
  return isBuildingFootprintFactWire(fact) ? fact : undefined;
}

function withBuildingFootprintFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = buildingFootprintFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, buildingFootprintFact: fact };
}

/** Cortex inspect GET sibling of flood / land-use / special-district / pipeline / well / footprint (P-53). */
export function isBoundaryEdgeFactWire(
  value: unknown,
): value is BoundaryEdgeFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/**
 * Cortex JSON ROOT only. Never reads bake / CAD / GIS / txgio_parcel /
 * parcel ring or a nested facets copy. A bake / GIS object parked on the
 * root has no state and is rejected. No :sd: / :boundary: picker. Does
 * not parse the last entity_id token as role.
 */
export function boundaryEdgeFactFromCortexRoot(
  bakedBody: unknown,
): BoundaryEdgeFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { boundaryEdgeFact?: unknown }).boundaryEdgeFact;
  return isBoundaryEdgeFactWire(fact) ? fact : undefined;
}

function withBoundaryEdgeFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = boundaryEdgeFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, boundaryEdgeFact: fact };
}

/** Cortex inspect GET sibling of flood / land-use / special-district / pipeline / well / footprint / boundary (P-54). */
export function isOwnerFactWire(value: unknown): value is OwnerFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/**
 * Cortex JSON ROOT only. Never reads bake / CAD / cad-parcel-roll /
 * GIS owner or a nested facets copy. A bake / CAD-roll object parked on
 * the root has no state and is rejected. No :sd: picker. Does not share
 * the texas-rrc key.
 */
export function ownerFactFromCortexRoot(
  bakedBody: unknown,
): OwnerFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { ownerFact?: unknown }).ownerFact;
  return isOwnerFactWire(fact) ? fact : undefined;
}

function withOwnerFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = ownerFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, ownerFact: fact };
}

/** Cortex inspect GET sibling (acquire-wave12 / school-district-fact). */
export function isSchoolDistrictFactWire(
  value: unknown,
): value is SchoolDistrictFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/** Cortex JSON ROOT only. A nested facets copy has no state and is rejected. */
export function schoolDistrictFactFromCortexRoot(
  bakedBody: unknown,
): SchoolDistrictFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { schoolDistrictFact?: unknown }).schoolDistrictFact;
  return isSchoolDistrictFactWire(fact) ? fact : undefined;
}

function withSchoolDistrictFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = schoolDistrictFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, schoolDistrictFact: fact };
}

/** Cortex inspect GET sibling (acquire-wave12 / utility-service-fact). */
export function isUtilityServiceFactWire(
  value: unknown,
): value is UtilityServiceFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/**
 * Cortex JSON ROOT only. A nested facets copy has no state and is rejected.
 * Distinct from `whoServes` — never reads that field as this one.
 */
export function utilityServiceFactFromCortexRoot(
  bakedBody: unknown,
): UtilityServiceFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { utilityServiceFact?: unknown }).utilityServiceFact;
  return isUtilityServiceFactWire(fact) ? fact : undefined;
}

function withUtilityServiceFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = utilityServiceFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, utilityServiceFact: fact };
}

/** Cortex inspect GET sibling (acquire-wave12 / overlay-districts-fact). */
export function isOverlayDistrictsFactWire(
  value: unknown,
): value is OverlayDistrictsFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/** Cortex JSON ROOT only. A nested facets copy has no state and is rejected. */
export function overlayDistrictsFactFromCortexRoot(
  bakedBody: unknown,
): OverlayDistrictsFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { overlayDistrictsFact?: unknown })
    .overlayDistrictsFact;
  return isOverlayDistrictsFactWire(fact) ? fact : undefined;
}

function withOverlayDistrictsFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = overlayDistrictsFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, overlayDistrictsFact: fact };
}

/** Cortex inspect GET sibling (acquire-wave12 / ag-valuation-fact). */
export function isAgValuationFactWire(
  value: unknown,
): value is AgValuationFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/** Cortex JSON ROOT only. A nested facets copy has no state and is rejected. */
export function agValuationFactFromCortexRoot(
  bakedBody: unknown,
): AgValuationFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { agValuationFact?: unknown }).agValuationFact;
  return isAgValuationFactWire(fact) ? fact : undefined;
}

function withAgValuationFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = agValuationFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, agValuationFact: fact };
}

/** Cortex inspect GET sibling (acquire-wave12 / max-impervious-cover-fact). */
export function isMaxImperviousCoverPctFactWire(
  value: unknown,
): value is MaxImperviousCoverPctFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = (value as { state?: unknown }).state;
  return state === "present" || state === "absent" || state === "refused";
}

/**
 * Cortex JSON ROOT only. A nested facets copy has no state and is rejected.
 * Distinct from the per-axis setback rule's own `maxImperviousPct` — never
 * reads that field as this one.
 */
export function maxImperviousCoverPctFactFromCortexRoot(
  bakedBody: unknown,
): MaxImperviousCoverPctFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { maxImperviousCoverPctFact?: unknown })
    .maxImperviousCoverPctFact;
  return isMaxImperviousCoverPctFactWire(fact) ? fact : undefined;
}

function withMaxImperviousCoverPctFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = maxImperviousCoverPctFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, maxImperviousCoverPctFact: fact };
}

/** Travis/CAD sentinels (`, TX`) are not situs. Same rule as fact-sheet-resolver. */
export function isUsableSitusAddress(raw: string | null | undefined): boolean {
  if (!raw || typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const street = (trimmed.split(",")[0] ?? "").trim();
  if (!street || !/^\d/.test(street)) return false;
  if (/^,\s*(TX)?\s*$/i.test(trimmed)) return false;
  return true;
}

/**
 * Live txgio_parcel.situs_address from cortex JSON ROOT (P-74).
 * Never Find / Photon / navigationAddress.
 */
export function txgioParcelSitusAddressFromCortexRoot(
  bakedBody: unknown,
): string | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const root = bakedBody as {
    txgioParcelSitusAddress?: unknown;
    txgioParcelSitus?: unknown;
  };
  if (typeof root.txgioParcelSitusAddress === "string") {
    const trimmed = root.txgioParcelSitusAddress.trim();
    return isUsableSitusAddress(trimmed) ? trimmed : undefined;
  }
  const nested = root.txgioParcelSitus;
  if (
    nested &&
    typeof nested === "object" &&
    !Array.isArray(nested) &&
    (nested as { source?: unknown }).source === "txgio_parcel" &&
    typeof (nested as { situsAddress?: unknown }).situsAddress === "string"
  ) {
    const trimmed = (nested as { situsAddress: string }).situsAddress.trim();
    return isUsableSitusAddress(trimmed) ? trimmed : undefined;
  }
  return undefined;
}

function resolveMergedSitusAddress(
  bakedBase: { situsAddress?: string | null },
  atomBase: { situsAddress?: string | null },
  bakedBody: unknown,
): string | null {
  const bakedRaw =
    typeof bakedBase.situsAddress === "string" ? bakedBase.situsAddress.trim() : "";
  if (isUsableSitusAddress(bakedRaw)) return bakedRaw;
  const txgio = txgioParcelSitusAddressFromCortexRoot(bakedBody);
  if (txgio) return txgio;
  const atomRaw =
    typeof atomBase.situsAddress === "string" ? atomBase.situsAddress.trim() : "";
  if (isUsableSitusAddress(atomRaw)) return atomRaw;
  return null;
}

/** Cortex inspect GET sibling (P-76 / tx_city_boundary PIP). Not an atom. */
export function isCityLimitsFactWire(
  value: unknown,
): value is CityLimitsFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as CityLimitsFactWire;
  if (
    o.status !== "incorporated" &&
    o.status !== "unincorporated" &&
    o.status !== "unmeasured"
  ) {
    return false;
  }
  if (o.etjStatus !== "unresolved") return false;
  if (o.source !== "tx_city_boundary") return false;
  return typeof o.basis === "string" && o.basis.length > 0;
}

/**
 * Cortex JSON ROOT only. Never reads situsCity, bake city, or a nested
 * facets copy. A situsCity string parked on the root is rejected.
 */
export function cityLimitsFactFromCortexRoot(
  bakedBody: unknown,
): CityLimitsFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { cityLimitsFact?: unknown }).cityLimitsFact;
  return isCityLimitsFactWire(fact) ? fact : undefined;
}

function withCityLimitsFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = cityLimitsFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, cityLimitsFact: fact };
}

export function isStructuralFactWire(value: unknown): value is StructuralFactWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as StructuralFactWire;
  if (o.state === "present") return true;
  if (o.status === "absent" && typeof o.verdict === "string") return true;
  return false;
}

export function structuralFactFromCortexRoot(
  bakedBody: unknown,
): StructuralFactWire | undefined {
  if (!bakedBody || typeof bakedBody !== "object" || Array.isArray(bakedBody)) {
    return undefined;
  }
  const fact = (bakedBody as { structuralFact?: unknown }).structuralFact;
  return isStructuralFactWire(fact) ? fact : undefined;
}

function withStructuralFact(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const fact = structuralFactFromCortexRoot(bakedBody);
  if (fact === undefined) return atomResponse;
  return { ...atomResponse, structuralFact: fact };
}

function withRootFacts(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  return withMaxImperviousCoverPctFact(
    withAgValuationFact(
      withOverlayDistrictsFact(
        withUtilityServiceFact(
          withSchoolDistrictFact(
            withVerdictLayerFields(
              withStructuralFact(
                withCityLimitsFact(
                  withOwnerFact(
                    withBoundaryEdgeFact(
                      withBuildingFootprintFact(
                        withWellFact(
                          withPipelineFact(
                            withSpecialDistrictFact(
                              withLandUseFact(
                                withFloodHazardFact(atomResponse, bakedBody),
                                bakedBody,
                              ),
                              bakedBody,
                            ),
                            bakedBody,
                          ),
                          bakedBody,
                        ),
                        bakedBody,
                      ),
                      bakedBody,
                    ),
                    bakedBody,
                  ),
                  bakedBody,
                ),
                bakedBody,
              ),
              bakedBody,
            ),
            bakedBody,
          ),
          bakedBody,
        ),
        bakedBody,
      ),
      bakedBody,
    ),
    bakedBody,
  );
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
 *
 * floodHazardFact is a ROOT sibling of facets (cortex PR 449), not a base
 * fact. Copy it from the cortex JSON ROOT only. Do not adopt tier2.flood.
 * landUseFact is the same shape family (s7): copy from the cortex JSON ROOT
 * only. Do not adopt baked facets.baseFacts.landUse as landUseFact.
 * specialDistrictFact is the same shape family (P-48 / LDT 451): copy from
 * the cortex JSON ROOT only. Do not adopt bake / CAD / mud-pid as that field.
 * pipelineFact is the same shape family (P-49): copy from the cortex JSON
 * ROOT only. Do not adopt bake / CAD / texas-rrc GIS as that field.
 * wellFact is the same shape family (P-50): copy from the cortex JSON ROOT
 * only. Do not adopt bake / CAD / texas-rrc GIS / tx_rrc_well as that field.
 * buildingFootprintFact is the same shape family (P-51): copy from the
 * cortex JSON ROOT only. Do not adopt bake / CAD / GIS /
 * tx_building_footprint as that field. structureRole stays on the fact
 * body; never parse the last entity_id token.
 * boundaryEdgeFact is the same shape family (P-53): copy from the
 * cortex JSON ROOT only. Do not adopt bake / CAD / GIS / txgio_parcel /
 * parcel ring as that field. role stays on the fact body; never parse
 * the last entity_id token. Do not present a GIS parcel outline as the
 * atom.
 * ownerFact is the same shape family (P-54): copy from the cortex JSON
 * ROOT only. Do not adopt bake / CAD / cad-parcel-roll / GIS owner as
 * that field. Identified-session only. Do not treat a service key as
 * identified.
 * cityLimitsFact is the same shape family (P-76): copy from the cortex
 * JSON ROOT only. Do not adopt situsCity / bake city as that field. ETJ
 * is typed absence only — never invent a buffer ring.
 * P-74 situs sentinel: a trimmed `, TX` (or comma-tail without a street) is
 * absent. Fall through to cortex-root txgio_parcel.situs_address. Never copy
 * Find / Photon onto the county record.
 * If facets are missing, still attach the root fields when they are present.
 */
export function mergeBakedBaseFacts(
  atomResponse: PeBakedFacetsResponse,
  bakedBody: unknown,
): PeBakedFacetsResponse {
  const baked = (bakedBody as { facets?: PeBakedFacetPayload } | null | undefined)
    ?.facets;
  if (!baked || typeof baked !== "object") {
    // Facets missing: still forward root flood / land-use / special-district /
    // pipeline / well / footprint / boundary / owner. Identity-return only
    // when those fields are also absent.
    return withRootFacts(atomResponse, bakedBody);
  }

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
  const situsAddress = resolveMergedSitusAddress(bakedBase, atomBase, bakedBody);
  const apn =
    (typeof atomBase.apn === "string" && atomBase.apn.trim() ? atomBase.apn : null) ??
    (typeof bakedBase.apn === "string" && bakedBase.apn.trim() ? bakedBase.apn : null);

  const merged: PeBakedFacetsResponse = {
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
          !!apn ||
          !!situsAddress,
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
  return withRootFacts(merged, bakedBody);
}

const SQFT_PER_ACRE = 43560;

function lotAreaSqFtFromAcreage(
  acreage: { value?: number; sqft?: number } | null | undefined,
): number | null {
  if (!acreage || typeof acreage !== "object") return null;
  if (typeof acreage.sqft === "number" && Number.isFinite(acreage.sqft) && acreage.sqft > 0) {
    return acreage.sqft;
  }
  if (typeof acreage.value === "number" && Number.isFinite(acreage.value) && acreage.value > 0) {
    return acreage.value * SQFT_PER_ACRE;
  }
  return null;
}

function roundTenths(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * C4: after acreage is merged from the cortex bake, derive
 * buildableAreaPct when the envelope claims a positive area and the lot
 * area is known. Writes the root field (sheet resolver) and the summary
 * nest (Gate 8 C4 / liveBuildablePct).
 *
 * Fail closed: unknown or non-positive lot area leaves both fields
 * absent. Never emit 0 for a missing denominator.
 */
export function attachBuildablePctFromKnownLotArea(
  payload: PeBakedFacetsResponse,
): PeBakedFacetsResponse {
  const facets = payload.facets;
  const env = facets.envelope;
  if (!env || typeof env !== "object" || env.status !== "ok") {
    return payload;
  }
  const sqft = env.buildableAreaSqFt;
  if (typeof sqft !== "number" || !Number.isFinite(sqft) || sqft <= 0) {
    return payload;
  }
  const lotSqFt = lotAreaSqFtFromAcreage(facets.baseFacts?.acreage);
  if (lotSqFt == null) {
    return payload;
  }
  const existing =
    typeof env.buildableAreaPct === "number" && Number.isFinite(env.buildableAreaPct)
      ? env.buildableAreaPct
      : null;
  const pct = existing ?? roundTenths((sqft / lotSqFt) * 100);
  if (!Number.isFinite(pct) || pct <= 0) {
    return payload;
  }
  return {
    ...payload,
    facets: {
      ...facets,
      envelope: {
        ...env,
        buildableAreaPct: pct,
        summary: {
          buildableAreaPct: pct,
          buildableAreaSqFt: sqft,
          parcelAreaSqFt: lotSqFt,
        },
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
  const tableSetbacks =
    setbacks ??
    (hasDistrict && jurisdictionKey
      ? resolveCodifiedSetbacksForStamp(jurisdictionKey, district)
      : null);
  const effectiveSetbacks = setbacks ?? tableSetbacks ?? undefined;
  const liveSetback = hasLiveAtomChainSetbackRule(
    parcelNodeId,
    rule,
    zoningSourceAdapter,
  );
  const depthWarm = isDepthWarmPromoted(c);
  /** Live layer-23 scalars + depth-warm geometry coexist — serve both, not either/or. */
  const dualSourceEnvelope = liveSetback && depthWarm;
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
      // Travis/Central TX: depth-warm verify-fail must not block codified table
      // setbacks when a GIS stamp + table row exist (~3% promoted geometry;
      // remainder still serves setback scalars).
      if (effectiveSetbacks) {
        envelope = {
          status: "ok",
          district: district ?? undefined,
          setbacks: effectiveSetbacks,
          approximate: true,
          provisional: true,
          disclosure:
            `Codified setback table (${jurisdictionKey ?? "unknown"}); depth-warm geometry withheld` +
            (warmDecline.declineReason
              ? ` — ${warmDecline.declineReason}`
              : "."),
        };
        envelopeCovered = true;
      } else {
        envelope = warmDecline;
        envelopeCovered = false;
      }
    }
  }
  if (!envelope && !effectiveSetbacks) {
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
      setbacks: effectiveSetbacks,
      approximate: true,
      provisional: true,
      disclosure: buildToLineDisclosure(ns),
    };
    envelopeCovered = true;
  } else if (!envelope && outcomeKind === "no-buildable-area") {
    envelope = {
      status: "no-buildable-area",
      district: district ?? undefined,
      setbacks: effectiveSetbacks,
      // Honest zero — setbacks consume the lot (QA-3: not "not verified").
      buildableAreaPct: 0,
      approximate: true,
      provisional: true,
      emptyReason: "Setbacks consume the lot — no buildable area remains.",
      ...(typeof areaSqFt === "number" ? { buildableAreaSqFt: areaSqFt } : {}),
      ...(geojson !== undefined ? { geojson } : {}),
    };
    envelopeCovered = true;
  } else if (!envelope && (outcomeKind === "buildable" || effectiveSetbacks)) {
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
    const baseDisclosure = dualSourceEnvelope
      ? "Atom-chain setback scalars; buildable envelope geometry from live derive (labelEdges+derive), not depth-warm ledger."
      : silentAxes
        ? buildToLineDisclosure(ns)
        : geojson === undefined || geojson === null
          ? "Atom-chain envelope (setbacks present; geometry absent on proof atom — not fabricated)."
          : "Atom-chain buildable envelope.";
    envelope = {
      status: "ok",
      district: district ?? undefined,
      setbacks: effectiveSetbacks,
      approximate: true,
      provisional: true,
      disclosure: baseDisclosure,
      ...(typeof pctFromAtom === "number" ? { buildableAreaPct: pctFromAtom } : {}),
      // Warm/buildable areaSqFt is honest even when side/rear are build-to-line
      // silent — do NOT strip it. SilentAxes only blocks pct that treated
      // not_specified axes as 0 ft (the false consume-lot class).
      ...(typeof areaSqFt === "number" && areaSqFt > 0 ? { buildableAreaSqFt: areaSqFt } : {}),
      // Geometry withheld on facets — map/export use live labelEdges+derive (WDLL unification).
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
        envelope && depthWarm && effectiveSetbacks && !liveSetback && setbacks
          ? {
              ...envelope,
              disclosure:
                "Atom-chain setback scalars; buildable envelope geometry from live derive (labelEdges+derive), not depth-warm ledger.",
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
