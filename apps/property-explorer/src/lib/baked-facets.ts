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
// Bake owner is NEVER present (the bake never wrote it and the endpoint
// strips it). The inspect Owner row reads cortex-root ownerFact only
// (P-54), never a CAD-roll / GIS owner parked on the bake.

import { formatSetbackDisplay } from "../../api/_lib/setback-not-specified";
import { mapBuildableDisplay } from "./buildable-display-vocab";
import { isUsableSitusAddress } from "./fact-sheet-resolver";
import type {
  EnvelopeProvenanceRefs,
  SetbackFieldProvenance,
  SetbackFieldNotes,
} from "./buildable-envelope.js";
import {
  isLayerAbsenceWire,
  isSilentEmptyStructuralLayer,
  layerAbsenceDisplayLabel,
  layerAbsenceProvenanceFromWire,
  layerWireToCardFacet,
  type LayerAbsenceWire,
  type LayerWire,
} from "./layer-absence";

export type { EnvelopeProvenanceRefs, SetbackFieldProvenance, SetbackFieldNotes };
export type { LayerAbsenceVerdict, LayerAbsenceWire, LayerWire } from "./layer-absence";
export { isSilentEmptyStructuralLayer } from "./layer-absence";

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
  zoning?: { district: string; jurisdictionKey?: string } | LayerAbsenceWire | null;
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
    /** True when cortex attempted the structural / CAMA-dependent read. */
    structural?: boolean;
  };
  /**
   * Doc 19 §Layer — structural field wires from cortex inspect GET (P-63).
   * Populated carries a numeric sqft; absent carries typed verdict + basis.
   */
  livingAreaSqft?: LayerWire<number> | null;
  yearBuilt?: LayerWire<number> | null;
  /**
   * CAD structural year source from the BFF (structuralFact.source or
   * cad_property). A populated year with no source is refused at the card.
   */
  yearBuiltSource?: string | null;
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
  /**
   * Flood determination from flood-hazard-fact atoms. Absent when the BFF
   * did not copy it. Never populated from tier2.flood.
   */
  floodHazardFact?: FloodHazardFactCardInput;
  /**
   * Land use from land-use-fact atoms. Absent when the BFF did not copy it.
   * Never populated from facets.baseFacts.landUse.
   */
  landUseFact?: LandUseFactCardInput;
  /**
   * Special district from special-district-fact atoms. Absent when the BFF
   * did not copy it. Never populated from bake / CAD / mud-pid.
   */
  specialDistrictFact?: SpecialDistrictFactCardInput;
  /**
   * Pipeline from rrc-pipeline-fact atoms. Absent when the BFF did not copy
   * it. Never populated from bake / CAD / texas-rrc GIS.
   */
  pipelineFact?: PipelineFactCardInput;
  /**
   * Well from well-fact atoms. Absent when the BFF did not copy it.
   * Never populated from bake / CAD / texas-rrc GIS / tx_rrc_well.
   */
  wellFact?: WellFactCardInput;
  /**
   * Footprint from building-footprint atoms. Absent when the BFF did not
   * copy it. Never populated from bake / CAD / GIS / tx_building_footprint.
   */
  buildingFootprintFact?: BuildingFootprintFactCardInput;
  /**
   * Boundary from property-boundary-edge atoms. Absent when the BFF did
   * not copy it. Never populated from bake / CAD / GIS / txgio_parcel /
   * parcel ring.
   */
  boundaryEdgeFact?: BoundaryEdgeFactCardInput;
  /**
   * Owner from owner-fact atoms. Absent when the BFF did not copy it.
   * Never populated from bake / CAD / cad-parcel-roll / GIS owner.
   * Identified-session only.
   */
  ownerFact?: OwnerFactCardInput;
  /**
   * City limits from tx_city_boundary PIP (P-76). Absent when the BFF did
   * not copy it. Never populated from situsCity / bake city.
   */
  cityLimitsFact?: CityLimitsFactCardInput;
  /**
   * School district from school-district-fact atoms (acquire-wave12).
   * Absent when the BFF did not copy it.
   */
  schoolDistrictFact?: SchoolDistrictFactCardInput;
  /**
   * Utility service from utility-service-fact atoms (acquire-wave12).
   * Absent when the BFF did not copy it. Distinct from `whoServes`.
   */
  utilityServiceFact?: UtilityServiceFactCardInput;
  /**
   * Overlay districts from overlay-districts-fact atoms (acquire-wave12).
   * Absent when the BFF did not copy it.
   */
  overlayDistrictsFact?: OverlayDistrictsFactCardInput;
  /**
   * Agricultural valuation from ag-valuation-fact atoms (acquire-wave12).
   * Absent when the BFF did not copy it.
   */
  agValuationFact?: AgValuationFactCardInput;
  /**
   * Max impervious cover percentage from max-impervious-cover-fact atoms
   * (acquire-wave12). Absent when the BFF did not copy it.
   */
  maxImperviousCoverPctFact?: MaxImperviousCoverPctFactCardInput;
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

/** Cortex inspect GET land-use determination (s7). Root sibling of facets. */
export type LandUseFactCardInput = {
  state?: string;
  landUseCode?: unknown;
  landUseLabel?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  source?: unknown;
  sourceVintage?: unknown;
  taxYear?: unknown;
};

/** Cortex inspect GET special-district determination (P-48). Root sibling. */
export type SpecialDistrictFactCardInput = {
  state?: string;
  districtId?: unknown;
  districtType?: unknown;
  districtName?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  source?: unknown;
  entityId?: unknown;
};

/** Cortex inspect GET pipeline determination (P-49). Root sibling. */
export type PipelineFactCardInput = {
  state?: string;
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
  entityId?: unknown;
};

/** Cortex inspect GET well determination (P-50). Root sibling. */
export type WellFactCardInput = {
  state?: string;
  apiNumber14?: unknown;
  wellStatus?: unknown;
  operatorName?: unknown;
  parcelRelation?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  reason?: unknown;
  source?: unknown;
  entityId?: unknown;
};

/** Cortex inspect GET footprint determination (P-51). Root sibling. */
export type BuildingFootprintFactCardInput = {
  state?: string;
  structureRole?: unknown;
  footprintId?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  reason?: unknown;
  source?: unknown;
  entityId?: unknown;
};

/** Cortex inspect GET boundary determination (P-53). Root sibling. */
export type BoundaryEdgeFactCardInput = {
  state?: string;
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
  entityId?: unknown;
};

/** Cortex inspect GET owner determination (P-54). Root sibling. */
export type OwnerFactCardInput = {
  state?: string;
  taxYear?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  reason?: unknown;
  source?: unknown;
  entityId?: unknown;
};

/** Cortex inspect GET city limits determination (P-76). Root sibling. */
export type CityLimitsFactCardInput = {
  status?: string;
  etjStatus?: string;
  source?: string;
  basis?: string;
  cityName?: string;
  geoId?: string;
  gnis?: string | null;
};

/** Cortex inspect GET school district determination (acquire-wave12). Root sibling. */
export type SchoolDistrictFactCardInput = {
  state?: string;
  districtName?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  source?: unknown;
  entityId?: unknown;
};

/** Cortex inspect GET utility service determination (acquire-wave12). Root sibling. */
export type UtilityServiceFactCardInput = {
  state?: string;
  water?: unknown;
  sewer?: unknown;
  electric?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  source?: unknown;
  entityId?: unknown;
};

/** Cortex inspect GET overlay districts determination (acquire-wave12). Root sibling. */
export type OverlayDistrictsFactCardInput = {
  state?: string;
  districts?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  source?: unknown;
  entityId?: unknown;
};

/** Cortex inspect GET ag valuation determination (acquire-wave12). Root sibling. */
export type AgValuationFactCardInput = {
  state?: string;
  entries?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  source?: unknown;
  entityId?: unknown;
};

/** Cortex inspect GET max impervious cover determination (acquire-wave12). Root sibling. */
export type MaxImperviousCoverPctFactCardInput = {
  state?: string;
  percent?: unknown;
  watershedType?: unknown;
  inRechargeZone?: unknown;
  crosswalkCitation?: unknown;
  absence?: { kind?: string; reason?: string } | null;
  code?: unknown;
  source?: unknown;
  entityId?: unknown;
};

/**
 * Reason on sheet.specialDistrict when the inspect payload had no
 * specialDistrictFact. sheet-to-card-model maps this to CardFacet unknown
 * so InspectCard hides the row.
 */
export const SPECIAL_DISTRICT_FACT_MISSING_REASON =
  "specialDistrictFact was not on the inspect payload";

/**
 * Reason on sheet.pipeline when the inspect payload had no pipelineFact.
 * sheet-to-card-model maps this to CardFacet unknown so InspectCard hides the row.
 */
export const PIPELINE_FACT_MISSING_REASON =
  "pipelineFact was not on the inspect payload";

/**
 * Reason on sheet.well when the inspect payload had no wellFact.
 * sheet-to-card-model maps this to CardFacet unknown so InspectCard hides the row.
 */
export const WELL_FACT_MISSING_REASON =
  "wellFact was not on the inspect payload";

/**
 * Reason on sheet.footprint when the inspect payload had no
 * buildingFootprintFact. sheet-to-card-model maps this to CardFacet unknown
 * so InspectCard hides the row.
 */
export const BUILDING_FOOTPRINT_FACT_MISSING_REASON =
  "buildingFootprintFact was not on the inspect payload";

/**
 * Reason on sheet.boundary when the inspect payload had no
 * boundaryEdgeFact. sheet-to-card-model maps this to CardFacet unknown
 * so InspectCard hides the row.
 */
export const BOUNDARY_EDGE_FACT_MISSING_REASON =
  "boundaryEdgeFact was not on the inspect payload";

/**
 * Reason on sheet.owner when the inspect payload had no ownerFact.
 * sheet-to-card-model maps this to CardFacet unknown so InspectCard hides
 * the row.
 */
export const OWNER_FACT_MISSING_REASON =
  "ownerFact was not on the inspect payload";

/**
 * Reason on sheet.cityLimits when the inspect payload had no cityLimitsFact.
 * sheet-to-card-model maps this to CardFacet unknown so InspectCard hides
 * the row.
 */
export const CITY_LIMITS_FACT_MISSING_REASON =
  "cityLimitsFact was not on the inspect payload";

/**
 * Reason on sheet.schoolDistrict when the inspect payload had no
 * schoolDistrictFact. sheet-to-card-model maps this to CardFacet unknown
 * so InspectCard hides the row.
 */
export const SCHOOL_DISTRICT_FACT_MISSING_REASON =
  "schoolDistrictFact was not on the inspect payload";

/**
 * Reason on sheet.utilityService when the inspect payload had no
 * utilityServiceFact. sheet-to-card-model maps this to CardFacet unknown
 * so InspectCard hides the row.
 */
export const UTILITY_SERVICE_FACT_MISSING_REASON =
  "utilityServiceFact was not on the inspect payload";

/**
 * Reason on sheet.overlayDistricts when the inspect payload had no
 * overlayDistrictsFact. sheet-to-card-model maps this to CardFacet unknown
 * so InspectCard hides the row.
 */
export const OVERLAY_DISTRICTS_FACT_MISSING_REASON =
  "overlayDistrictsFact was not on the inspect payload";

/**
 * Reason on sheet.agValuation when the inspect payload had no
 * agValuationFact. sheet-to-card-model maps this to CardFacet unknown so
 * InspectCard hides the row.
 */
export const AG_VALUATION_FACT_MISSING_REASON =
  "agValuationFact was not on the inspect payload";

/**
 * Reason on sheet.maxImperviousCoverPct when the inspect payload had no
 * maxImperviousCoverPctFact. sheet-to-card-model maps this to CardFacet
 * unknown so InspectCard hides the row.
 */
export const MAX_IMPERVIOUS_COVER_PCT_FACT_MISSING_REASON =
  "maxImperviousCoverPctFact was not on the inspect payload";

/**
 * Reason on sheet.flood when the inspect payload had no floodHazardFact.
 * sheet-to-card-model maps this to CardFacet unknown so InspectCard hides the row.
 */
export const FLOOD_HAZARD_FACT_MISSING_REASON =
  "floodHazardFact was not on the inspect payload";

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
  /** Doc 19 layer absence provenance when cortex served a typed verdict. */
  layerAbsence?: import("./layer-absence").LayerAbsenceProvenance;
  /** Empty chain with no verdict — defect, not honest absence (P-63). */
  silentEmpty?: boolean;
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
   * (FactRow hides it). Never derived from tier2.flood.
   */
  flood: CardFacet<string>;
  /** Structural living area (doc 19 layer wire). Hidden when unknown. */
  livingArea: CardFacet<string>;
  /**
   * CAD structural year with its source, or hidden. A bare number is refused.
   * Never a listing year.
   */
  yearBuilt: CardFacet<string>;
  /**
   * Special district row from specialDistrictFact only. `unknown` when the
   * field is missing (FactRow hides it). Never derived from bake / CAD /
   * mud-pid.
   */
  specialDistrict: CardFacet<string>;
  /**
   * Pipeline row from pipelineFact only. `unknown` when the field is missing
   * (FactRow hides it). Never derived from bake / CAD / texas-rrc GIS.
   */
  pipeline: CardFacet<string>;
  /**
   * Well row from wellFact only. `unknown` when the field is missing
   * (FactRow hides it). Never derived from bake / CAD / texas-rrc GIS /
   * tx_rrc_well. Gold atom-miss stays visible and does not paint a well.
   */
  well: CardFacet<string>;
  /**
   * Footprint row from buildingFootprintFact only. `unknown` when the field
   * is missing (FactRow hides it). Never derived from bake / CAD / GIS /
   * tx_building_footprint. Gold atom-miss stays visible and does not paint
   * a footprint or :primary. structureRole is body.structureRole.
   */
  footprint: CardFacet<string>;
  /**
   * Boundary row from boundaryEdgeFact only. `unknown` when the field is
   * missing (FactRow hides it). Never derived from bake / CAD / GIS /
   * txgio_parcel / parcel ring. Gold present shows role=front and cites
   * property-boundary-edge. Do not paint a GIS outline as the atom.
   */
  boundary: CardFacet<string>;
  /**
   * Owner row from ownerFact only. `unknown` when the field is missing
   * (FactRow hides it). Never derived from bake / CAD / cad-parcel-roll /
   * GIS owner. Anonymous / identified-session-required has no owner body.
   * Identified present cites owner-fact 48021:34137:2025 taxYear=2025.
   */
  owner: CardFacet<string>;
  /**
   * City limits row from cityLimitsFact only. `unknown` when the field is
   * missing (FactRow hides it). Never derived from situsCity / bake city.
   * ETJ unresolved is typed absence, not a buffer ring.
   */
  cityLimits: CardFacet<string>;
  /**
   * School district row from schoolDistrictFact only. `unknown` when the
   * field is missing (FactRow hides it). Never derived from bake / CAD.
   */
  schoolDistrict: CardFacet<string>;
  /**
   * Utility service row from utilityServiceFact only. `unknown` when the
   * field is missing (FactRow hides it). Distinct from `whoServes` — never
   * derived from that lookup.
   */
  utilityService: CardFacet<string>;
  /**
   * Overlay districts row from overlayDistrictsFact only. `unknown` when
   * the field is missing (FactRow hides it). Never derived from the zoning
   * district code alone.
   */
  overlayDistricts: CardFacet<string>;
  /**
   * Ag valuation row from agValuationFact only. `unknown` when the field is
   * missing (FactRow hides it). Never derived from a bake / CAD ag-exemption
   * flag.
   */
  agValuation: CardFacet<string>;
  /**
   * Max impervious cover row from maxImperviousCoverPctFact only. `unknown`
   * when the field is missing (FactRow hides it). Distinct from the
   * per-axis setback rule's own `maxImperviousPct` — never derived from
   * that.
   */
  maxImperviousCoverPct: CardFacet<string>;
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
export function zoningLayerToCardFacet(
  zoning: BakedFacetPayload["zoning"],
  covZoning: boolean | undefined,
  zoningDecline: string | null,
): CardFacet<string> {
  if (isLayerAbsenceWire(zoning)) {
    return {
      state: "absent",
      value: layerAbsenceDisplayLabel(zoning.verdict),
      layerAbsence: layerAbsenceProvenanceFromWire(zoning),
    };
  }
  if (covZoning === true && zoning && typeof zoning === "object" && "district" in zoning) {
    const district = (zoning as { district?: string }).district;
    if (typeof district === "string" && district.trim()) {
      return present(district.trim());
    }
  }
  if (zoningDecline === "atom_path_pending") {
    return pending("Loading zoning…");
  }
  if (zoningDecline === "no-zoning-stamp") {
    return absent("no zoning stamp here");
  }
  if (zoningDecline === "zoning-absent" || zoningDecline === "no-setback-table") {
    return absent("no zoning here");
  }
  return absent<string>();
}

export function yearBuiltLayerToCardFacet(
  payload: BakedFacetPayload,
  source: string | null,
): CardFacet<string> {
  const mapped = layerWireToCardFacet(payload.yearBuilt, (year) =>
    typeof year === "number" && Number.isFinite(year)
      ? source && source.trim()
        ? `${year} (${source.trim()})`
        : null
      : null,
  );
  // Refuse a bare number: hide the row. Absent-null would paint
  // "Not stamped here"; the patch test is row not present.
  if (mapped.state === "absent" && mapped.value == null && !mapped.layerAbsence) {
    return { state: "unknown", value: null };
  }
  return mapped as CardFacet<string>;
}

export function livingAreaLayerToCardFacet(payload: BakedFacetPayload): CardFacet<string> {
  if (isSilentEmptyStructuralLayer(payload)) {
    return {
      state: "absent",
      value: "structural layer undeclared",
      silentEmpty: true,
    };
  }
  const mapped = layerWireToCardFacet(payload.livingAreaSqft, (sqft) =>
    typeof sqft === "number" && Number.isFinite(sqft) && sqft > 0
      ? `${sqft.toLocaleString("en-US")} sqft`
      : null,
  );
  return mapped as CardFacet<string>;
}

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
export function deriveBakedCardModel(payload: BakedFacetPayload): BakedCardModel {
  const bf = payload.baseFacts ?? {};
  const cov = payload.facetCoverage ?? {};
  const env = payload.envelope ?? null;

  const apn =
    typeof bf.apn === "string" && bf.apn.trim()
      ? present(bf.apn.trim())
      : absent<string>();

  const situsAddress = isUsableSitusAddress(
    typeof bf.situsAddress === "string" ? bf.situsAddress : null,
  )
    ? present((bf.situsAddress as string).trim())
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
  const zoning = zoningLayerToCardFacet(payload.zoning, cov.zoning, zoningDecline);

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
    flood: { state: "unknown", value: null },
    livingArea: livingAreaLayerToCardFacet(payload),
    yearBuilt: yearBuiltLayerToCardFacet(payload, payload.yearBuiltSource ?? null),
    specialDistrict: { state: "unknown", value: null },
    pipeline: { state: "unknown", value: null },
    well: { state: "unknown", value: null },
    footprint: { state: "unknown", value: null },
    boundary: { state: "unknown", value: null },
    owner: { state: "unknown", value: null },
    cityLimits: { state: "unknown", value: null },
    schoolDistrict: { state: "unknown", value: null },
    utilityService: { state: "unknown", value: null },
    overlayDistricts: { state: "unknown", value: null },
    agValuation: { state: "unknown", value: null },
    maxImperviousCoverPct: { state: "unknown", value: null },
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

const CLIENT_FACETS_ATTEMPTS = 3;
const CLIENT_FACETS_BACKOFF_MS = [500, 1_200, 2_000];

/**
 * Per-attempt bound on one facets request. Without it a hung BFF socket (a
 * spine function stalled on a cold Cloud Run upstream) holds `resolve()` —
 * and therefore the "Reading this parcel…" state — open for the full
 * function maxDuration per attempt, unbounded from the card's point of view.
 * A timed-out attempt is a TRANSIENT (retried with backoff), never an error
 * and never an absence.
 */
const CLIENT_FACETS_TIMEOUT_MS = 30_000;

/** Test seam + tuning knobs; production callers pass nothing. */
export interface FacetsFetchOptions {
  timeoutMs?: number;
  attempts?: number;
  backoffMs?: number[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** AbortSignal.timeout where the runtime has it; older Safari degrades to no bound. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(ms)
    : undefined;
}

async function fetchBakedNodeFacetsOnce(
  parcelNodeId: string,
  facetsBase: string,
  timeoutMs: number,
): Promise<BakedFacetsFetchResult> {
  const id = parcelNodeId.trim();
  if (!id) return { kind: "error", message: "parcelNodeId required", status: 0 };
  const base = facetsBase.replace(/\/$/, "");
  const url = base.includes("/property-atoms")
    ? `${base}/${encodeURIComponent(id)}/facets`
    : `${base}/brokerage/v1/place/node/${encodeURIComponent(id)}/facets`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: timeoutSignal(timeoutMs),
    });
  } catch (err) {
    // Network failure AND per-attempt timeout both land here: transient.
    return {
      kind: "transient",
      message: err instanceof Error ? err.message : String(err),
      status: 0,
    };
  }
  if (res.status === 404) return { kind: "not_found" };
  // 500 is retryable here: this BFF never returns 500 by design, so a 500 is
  // a platform-level function failure (FUNCTION_INVOCATION_FAILED), the same
  // recoverable class as a 502/504 — and the GET is idempotent.
  if (
    res.status === 503 ||
    res.status === 502 ||
    res.status === 504 ||
    res.status === 500 ||
    res.status === 429
  ) {
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
  options: FacetsFetchOptions = {},
): Promise<BakedFacetsFetchResult> {
  const attempts = options.attempts ?? CLIENT_FACETS_ATTEMPTS;
  const backoff = options.backoffMs ?? CLIENT_FACETS_BACKOFF_MS;
  const timeoutMs = options.timeoutMs ?? CLIENT_FACETS_TIMEOUT_MS;
  let last: BakedFacetsFetchResult = {
    kind: "error",
    message: "facets unset",
    status: 0,
  };
  for (let i = 0; i < attempts; i++) {
    const result = await fetchBakedNodeFacetsOnce(parcelNodeId, facetsBase, timeoutMs);
    if (result.kind === "ok" || result.kind === "not_found" || result.kind === "error") {
      return result;
    }
    last = result;
    if (i < attempts - 1) await sleep(backoff[i] ?? 3_000);
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
