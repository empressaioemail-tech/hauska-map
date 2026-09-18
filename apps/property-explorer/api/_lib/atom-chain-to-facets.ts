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
  envelopeHuman,
  type SetbackConflictSecondSourceInput,
} from "@empressaio/atom-contract/display";

import {
  resolveCodifiedSetbacksForStamp,
  type CodifiedSetbackScalars,
} from "./codified-setback-from-zoning.js";
import { plannedDevelopmentSetbackRefusal } from "./planned-development-district.js";
import { setbackPendingDisclosure } from "./setback-decline-wording.js";
/** P-339: the one composition site for the warm-verify-decline table sentence. */
import { codifiedTableEnvelopeDisclosure } from "./setback-table-envelope-wording.js";
import {
  anyNotSpecified,
  buildToLineDisclosure,
  lookupNotSpecified,
  type NotSpecifiedAxes,
} from "./setback-not-specified.js";
import {
  disclosureWithCitationVintage,
  readSetbackDateAtSource,
  setbackCitationVintageRow,
  stateFromWireBasis,
  type SetbackCitationVintageRow,
  type SetbackDateRead,
} from "./setback-citation-vintage.js";
import { withVerdictLayerFields } from "./verdict-layer-merge.js";
// P-332 (OPS-24 wave 1): the ONE writer for the panel's ETJ state. Imported
// rather than reimplemented here — see that module's header for why the
// determination needed a single owner across both adoption points.
import {
  isEtjStatus,
  normalizeAdoptedCityLimitsEtj,
  type EtjConflictWire,
  type EtjFactWire,
  type EtjStatus,
} from "./pe-etj-determination.js";
// P-272: one definition of a readable situs, shared with the client modules
// (`fact-sheet-resolver.ts`, `live-envelope-augment.ts`, `baked-facets.ts`) and
// with `buildable-envelope.js`'s request-body guard. Re-exported below so this
// module's existing export surface is unchanged.
import { isUsableSitusAddress } from "../../src/lib/situs-address.js";
export { isUsableSitusAddress };

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
  /**
   * P-154 wave 6 (R-1) — the effective date read on THIS row's own source,
   * how it was established, and the followed row's own citation. Absent on
   * rows minted before wave 6, in which case the card prints no source
   * clause rather than inventing one.
   */
  sourceDate?: string | null;
  dateBasis?: string;
  datePrecision?: "day" | "year";
  citationUrl?: string;
  /**
   * R25 / P-154 wave 6 — the second source that disagrees with the followed
   * value. `conflict` is the disagreement AS DATA, read verbatim from the
   * atom; the card hands it to `setbackConflictNote` from
   * `@empressaio/atom-contract/display` so the panel, the MCP and the PDF
   * print one character-identical sentence (OPS-23 R-6, P-167's pattern).
   */
  secondSource?: {
    source: string;
    note: string;
    citationUrl?: string;
    conflict?: SetbackConflictSecondSourceInput | null;
  };
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
  /** P-303: the atom's own DID, carried on the wire — named in the withheld-figure disclosure. */
  atomDid?: string;
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

/**
 * A cad-roll dollar/sqft field's three-state wire, mirrored from
 * legacy-design-tools' cadRollValue.ts CadRollValueWire. "present" (v>0),
 * "zero" (a real stored $0, e.g. vacant land), "absent" (no value) — never
 * collapse zero into absent.
 */
export type CadRollValueWire =
  | { state: "present"; v: number; source?: string; vintage?: string | null; valueBasis?: string }
  | { state: "zero"; v: 0; source?: string; vintage?: string | null; valueBasis?: string; basis?: string }
  | { state: "absent"; source?: string; vintage?: string | null; basis?: string }
  /**
   * P152-PANEL fix: cortex gates the four dollar rails to Studio/Team/
   * Property-Unlock and emits exactly this shape per field
   * (legacy-design-tools `cadRollValue.ts` `studioGatedCadRollValuationRefusal`)
   * for anyone else. This wire previously had no "refused" member, so
   * `isCadRollValueWire` rejected it and `cadRollField` (below) silently
   * collapsed it to `null` — indistinguishable on the wire from "no CAD
   * roll data exists" and from the county's own absence. The client
   * (`fact-sheet-resolver.ts` `cadRollFieldState`/`taxValuationFromCadRoll`)
   * already has a `kind: "refused"` branch that renders the correct
   * upgrade cue; it was simply unreachable through this BFF. Never
   * collapsed to null again — see the P152-PANEL close falsifier
   * ("an anonymous read never carries a cadRoll dollar... a Studio read
   * carries exactly what it carried before").
   */
  | { state: "refused"; code: "studio-gated"; reason?: string };

function isCadRollValueWire(v: unknown): v is CadRollValueWire {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (r.state === "present" || r.state === "zero") {
    return typeof r.v === "number" && Number.isFinite(r.v);
  }
  if (r.state === "refused") {
    return r.code === "studio-gated";
  }
  return r.state === "absent";
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
    /**
     * PARCEL-B-SLATE2 cad-roll dollar-rail overlay (marketValue/assessedValue/
     * landValue/improvementValue only — yearBuilt is sourced separately and
     * not part of this shape). Mirrors legacy-design-tools'
     * artifacts/api-server/src/lib/cadRollValue.ts CadRollValueWire — a
     * three-state wire, not a bare number: "present" (v>0), "zero" (a real
     * stored $0, e.g. vacant land — never collapsed to absent), "absent"
     * (no value). Carried through unflattened so a future consumer can
     * render the distinction; this repo does not read `.v` directly anywhere
     * today, so flattening here would only destroy information for no gain.
     */
    cadRoll?: {
      marketValue?: CadRollValueWire | null;
      assessedValue?: CadRollValueWire | null;
      landValue?: CadRollValueWire | null;
      improvementValue?: CadRollValueWire | null;
    } | null;
  };
  /**
   * `provenance` (P-167 wave 5, OPS-23 R-4): the parcel_record
   * `zoningProvenance` rail's own citation string (e.g.
   * "bastrop-development-code:2026-06-ordinance"), composed by
   * `composeZoningSetbackOverride` / `applyZoningOverride` in
   * pe-record-to-facets.ts / pe-property-atoms.ts. Distinct from
   * `envelope.citationUrl` (a different rail, `setbackRules`). Optional:
   * absent whenever the record does not serve this rail, exactly like
   * `jurisdictionKey`.
   */
  zoning?: { district: string; jurisdictionKey?: string; provenance?: string } | null;
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
    /**
     * P-341 (OPS-24, ruling 16). Every impervious-cover figure that applies to
     * this parcel, each with the source it came from. Present only where two
     * figures APPLY (the zoning rule's own sub-field beside the watershed
     * fact's percent); absent where only one figure applies, where the two
     * agree, or where this payload predates the lane — so an unaffected
     * payload stays byte-identical. `maxImperviousPct` above is the STRICTER
     * (lower) of these where two apply, never their average and never the
     * higher.
     */
    maxImperviousPctSources?: Array<{
      source: "zoning-setback-rule" | "max-impervious-cover-fact";
      percent: number;
      citationUrl?: string;
      sourceDate?: string;
      watershedType?: string;
    }>;
    minLotSize?: string;
    /** R26 — dominant district + minor zones on a split-zoned parcel. */
    splitZoneMinorZones?: Array<{ districtCode: string | null; shapeArea?: number }>;
    /**
     * R25 / P-154 wave 6 — the second source whose values disagree with the
     * followed row. Present only where the atom carries one.
     */
    secondSource?: {
      source: string;
      note: string;
      citationUrl?: string;
      /** The disagreement as data; the card composes the one conflict sentence from it. */
      conflict?: SetbackConflictSecondSourceInput | null;
    };
    /**
     * P-154 wave 6 (R-1) — the followed row's own citation and the effective
     * date read AT SOURCE, with the basis for that date. Absent on rows
     * minted before wave 6: the card then prints no source clause at all,
     * rather than a citation it does not have.
     */
    sourceCitationUrl?: string | null;
    sourceDate?: string | null;
    sourceDateBasis?: string | null;
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
    /**
     * P-270 (OPS-24 X11). The conflict row for a citation being served
     * WITHOUT a readable effective date. Present only in that case; absent
     * when the date was read at source (a readable date is not a conflict)
     * and absent when there is no citation at all. Written by
     * `companionSetbackRulesMeta` -> `applyEnvelopeSetbackOverride`
     * (pe-record-to-facets.ts / pe-property-atoms.ts) on the record rail, and
     * by the `dm` block below on the property atom chain. The sentence it
     * carries is identical in legacy-design-tools' copy — see
     * `setback-citation-vintage.ts`'s module doc for the vocabulary law.
     */
    citationVintage?: SetbackCitationVintageRow;
    geojson?: unknown;
    /**
     * P-249 (2026-09-16). Mirrors `BakedFacetPayload.envelope.figureWithheld`
     * in src/lib/baked-facets.ts, and is set on exactly one branch: an
     * unverified `no-buildable-area` atom (see this file's P-216/P-249 comment
     * inside `adaptAtomChainToBakedFacets`). The polygon still draws — status
     * "ok" plus real setback scalars is what makes the live labelEdges+derive
     * pass fire — but the AREA FIGURE stays withheld, because operator ruling
     * A-180 allows a buildable-area figure only when a VERIFIED atom backs it.
     * Read by `live-envelope-augment.ts` (which must not re-stamp its own
     * recomputed area onto the payload) and by `fact-sheet-resolver.ts` (which
     * maps the withheld payload to the sheet's `modelled` envelope — polygon,
     * no area — instead of measuring an area off the rings).
     */
    figureWithheld?: boolean;
    /**
     * P-303 (2026-09-17). Which source supplied this envelope's setback
     * scalars. Absent means the atom-chain path (the historical default, so
     * every existing payload keeps its meaning). `"parcel-record"` is set on
     * exactly one branch: a no-district-class chain whose district and
     * setback table were served by the parcel record (the XD-2 Waco case) —
     * read by `applyEnvelopeSetbackOverride` in `pe-property-atoms.ts` so its
     * overlay note does not claim the un-overridden axes are
     * "atom-chain-sourced" when every axis on the envelope came from the
     * record.
     */
    setbackSource?: "atom-chain" | "parcel-record";
    /**
     * P-339 (OPS-24, ruling 15). Names the surface that OWNS this envelope's
     * reason, so no reader has to infer it from the sentence. Set only where
     * this payload is mirroring the drawing route's own answer
     * (`POST /api/brokerage/v1/place/buildable-envelope`); absent everywhere
     * this payload is still the composer of its own reason, which is the
     * honest reading of an older payload.
     *
     * Nothing downstream may re-compose a reason for an envelope carrying this
     * marker: the route's answer is the answer.
     */
    reasonOwner?: "place/buildable-envelope";
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
 * `tx_city_boundary`, not an atom. No ETJ buffer ring on this wire.
 *
 * P-332 (OPS-24 wave 1, measured live 2026-09-18). Until this lane the type
 * read `etjStatus: "unresolved"` — a single-member literal — and the guard
 * below enforced it, so a cortex fact carrying a REAL ETJ determination was
 * rejected whole (status, cityName, queryPoint and the nested `etjFact`
 * block with it) one layer before the record composers ever saw it. The
 * authoritative route has served a real determination since P-296
 * (2026-09-17); the four states are now representable and the fact is
 * normalised on adoption by `normalizeAdoptedCityLimitsEtj` rather than
 * silently dropped or forwarded raw as a contradiction.
 *
 * `queryPoint` (F21, 2026-09-13): the point-in-polygon subject point cortex
 * stamps onto this fact — was already present on the wire (carried through
 * `withCityLimitsFact`/`cityLimitsFactFromCortexRoot` from cortex's raw
 * JSON, a structural pass-through that never checked this field's name
 * against the type) but never DECLARED here, so nothing in this file could
 * reference it by name. Declared now because P152-RAILS's own
 * `applyRecordPatch` needs to preserve it explicitly across the record-path
 * overwrite (see that file) — P-151 seeds placement from this field, and
 * the record-composed `composeCityLimits` (pe-record-to-facets.ts) has no
 * way to construct it (it is not part of the retrieval reader's cityLimits
 * cell), so it must be carried through rather than recomposed.
 */
export type CityLimitsFactWire = {
  status: "incorporated" | "unincorporated" | "unmeasured";
  /**
   * Four states, not a boolean (P-332). `conflicting` is DERIVED, never read:
   * it is emitted only when `status` is `incorporated` and the ETJ read is
   * `present`, because a Texas extraterritorial jurisdiction is by definition
   * unincorporated land outside a city's limits. The rule lives in
   * `pe-etj-determination.ts` and nowhere else.
   */
  etjStatus: EtjStatus;
  source: "tx_city_boundary";
  basis: string;
  cityName?: string;
  geoId?: string;
  gnis?: string | null;
  queryPoint?: { longitude: number; latitude: number } | null;
  /**
   * P-332: cortex's RAW ETJ determination (`etjFact` nested inside the root
   * `cityLimitsFact` by P-296 — NOT a root sibling). Carried through
   * untouched so `status` here never drifts, and so the reason/ring/vintage
   * of the ETJ read survives the record path's wholesale replacement of this
   * object.
   */
  etjFact?: EtjFactWire | null;
  /** P-332: present only when `etjStatus === "conflicting"`. Names both sources and both bases. */
  etjConflict?: EtjConflictWire | null;
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
 * on main as of the PR #608 merge (83fb2a1e). `state` stays top-level on a
 * flat object exactly as `isUtilityServiceFactWire` below already expects
 * — the field is NOT list-shaped or array-wrapped at the wire boundary, so
 * that guard never rejected it. The actual defect was one layer down: the
 * resolver (fact-sheet-resolver.ts) previously read nonexistent
 * `provider`/`serviceType` keys instead of the real `water`/`sewer`
 * companion-row slots, so a `present` fact was silently mischaracterized
 * as absent rather than hidden. Water, sewer, and electric are independent
 * slots — see the real source file's module doc — any or all `null`, never
 * all three null on `present`. Electric was added in PARCEL wave 2 (PR
 * #608, merged after this fact was first modeled here); it tiles the
 * entire state so it is present for effectively every parcel.
 */
export type UtilityServiceFactWire = {
  state: "present" | "absent" | "refused";
  water?: unknown;
  sewer?: unknown;
  electric?: unknown;
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
 * CONFIRMED SHAPE (2026-09-04), verified first-hand against
 * legacy-design-tools
 * `artifacts/api-server/src/lib/overlayDistrictsFactRead.ts` on branch
 * `feat/b-acquire-wave12-serve-utilityservice`, HEAD `f3ca65e8` — this
 * code is NOT reachable from `main` despite PR #601 showing as merged (it
 * merged into that stale feature branch instead, a separate git-process
 * defect outside this lane; confirmed via `compare/main...` diff). No
 * live exposure today, but the real key is `districts` (an array of
 * `{city, attributes}`), not `names` — the prior model read a key that
 * does not exist on the real wire at all, so this is fixed now regardless
 * of when/whether that merge-target mistake gets corrected upstream.
 */
export type OverlayDistrictsFactWire = {
  state: "present" | "absent" | "refused";
  districts?: unknown;
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
  /**
   * "record" (P-152 PANEL, lane 2 of 2): at least one rail on this response
   * was composed directly from the Hauska retrieval service's
   * `GET /property-nodes/:id/record` rather than from the cortex facets
   * merge. Set whenever that fetch succeeds, regardless of whether any
   * individual field actually changed value (the reader was genuinely
   * consulted) — see the P152-PANEL close falsifier.
   */
  /**
   * "record-unavailable" (P152-RAILS, OPS-23 P-152 lane 3): the `/record`
   * fetch was attempted and FAILED (non-2xx, timeout, or invalid JSON) —
   * distinct from "atom-chain"/"atom-chain-warm", which mean `/record` was
   * never reached to begin with vs. reached-and-refused-us. Declares the
   * outage on the wire rather than silently keeping whatever the cortex
   * merge already produced for a rail this lane's composer owns (R-6: never
   * fall to legacy silently). See pe-record-to-facets.ts composeRecordUnavailablePatch.
   */
  readPath: "atom-chain" | "atom-chain-warm" | "record" | "record-unavailable";
  /** True when baked cortex base facts were merged onto the atom-chain read. */
  baseFactsMerged?: boolean;
  /**
   * Per-rail `{serve, atomBacked}` for every rail this lane's BFF looked at
   * on the retrieval `/record` response (P152-PANEL). Additive — the wire
   * shape the sheet resolver already reads is unchanged; P-167's vocabulary
   * module will supply the display words once it lands (dispatch item 1).
   */
  recordRailStates?: Record<string, { serve: "record" | "refused" | "legacy-transitional"; atomBacked: boolean }>;
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

export function apnFromNodeId(parcelNodeId: string): string | undefined {
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
  // P-332: was `o.etjStatus !== "unresolved"`, which rejected any fact carrying
  // a real determination. The guard now admits all four served states; the
  // determination itself is validated where it is read (readEtjFact).
  if (!isEtjStatus(o.etjStatus)) return false;
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
  // P-332: normalise on ADOPTION, not only on composition. A parcel whose
  // `cityLimits` rail is not slated `record` gets no record patch at all, so
  // this is the only place that can stop cortex's own
  // `{status: "incorporated", etjStatus: "present"}` contradiction from being
  // forwarded verbatim as two clean and contradictory facts. `basis` is left
  // alone here — cortex's basis already ends with its own `ETJ: ...` segment.
  return { ...atomResponse, cityLimitsFact: normalizeAdoptedCityLimitsEtj(fact) };
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

  // PARCEL-B-SLATE2 cad-roll dollar rails. Each field is cortex's own
  // three-state CadRollValueWire (present/zero/absent), NOT a bare number —
  // carried through unflattened (isCadRollValueWire guards malformed input
  // to an honest null, same shape as landUse/acreage above) so "zero" (a
  // real stored $0) is never conflated with "absent" (no value). yearBuilt
  // is deliberately NOT carried here: its live provenance is ambiguous
  // between this overlay and the older structuralFact atom path, and
  // conflating the two here would risk masking that open question.
  const bakedCadRoll = bakedBase.cadRoll ?? null;
  const cadRollField = (key: keyof NonNullable<typeof bakedCadRoll>): CadRollValueWire | null => {
    const v = bakedCadRoll?.[key];
    return isCadRollValueWire(v) ? v : null;
  };
  const marketValue = cadRollField("marketValue");
  const assessedValue = cadRollField("assessedValue");
  const landValue = cadRollField("landValue");
  const improvementValue = cadRollField("improvementValue");

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
        cadRoll:
          marketValue != null || assessedValue != null || landValue != null || improvementValue != null
            ? { marketValue, assessedValue, landValue, improvementValue }
            : null,
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

/**
 * P-303 (2026-09-17) — THE NO-DISTRICT DECLINE CLASS.
 *
 * WHY THIS EXISTS. Before this block, the adapter had exactly one place where
 * an absence of zoning became an envelope refusal: the `absenceKind ===
 * "no-zoning-stamp"` branch below, which fires FIRST in the decision tree and
 * therefore pre-empts every district-and-table branch under it. Live proof
 * (2026-09-17, `_inbox/2026-09-17_p249_canary_proof.md`): Waco `48309:103015`
 * carries a breadth-bake zoning-fact whose `absence.kind` is
 * `no-zoning-stamp` ("No zoning district observed for parcel") and a
 * buildable-envelope atom whose basis is the engine's cascade code
 * `no-district-on-record` ("no district on record — jurisdiction not yet
 * onboarded"), while the SAME payload's zoning facet holds district `R-1B`
 * (jurisdiction `waco-tx`, from the city's own GIS layer, served by the
 * parcel record) and the parcel record also serves its setback axes. The
 * panel printed `no-zoning-stamp` and drew nothing, so map/MCP/PDF/panel
 * disagreed — LDT's route draws that parcel (P-249 canary: `ok`, polygon
 * drawn) because it reads the record, and the panel did not.
 *
 * THE CLASS IS A STAMP GAP, NOT A ZONING ABSENCE. hauska-engine's own
 * cascade module says it in its doc comment
 * (`packages/engine-core/src/property-reasoning/cascade-unzoned-envelope-decline.ts`):
 * it "targets every absence-zoning parcel county-wide, including parcels
 * inside an incorporated city that IS zoned but simply has not been stamped
 * yet … the jurisdiction is zoned, only unonboarded". So a member of this
 * class is never proof that the parcel has no zoning. The verdict the map
 * owes each member is recorded in {@link NO_DISTRICT_DECLINE_SOURCES}: the
 * class declines honestly while NO district exists anywhere in the payload,
 * and must re-route to the P-249 `envelope-unverified` branch (drawn, figure
 * withheld) once the parcel record stamps a district and serves the setback
 * table. The district is never invented here — it is read off the payload's
 * own record-composed zoning facet passed in by the caller.
 */
export const NO_DISTRICT_DECLINE_REASON = "no-zoning-stamp" as const;

/**
 * hauska-engine's cascade codes for this cohort (`CASCADE_DECLINE_CODES`):
 * the in-city-but-unonboarded variant and the unincorporated variant. The
 * adapter previously never read them (`mapWarmVerifyDeclineEnvelope` is
 * gated behind `hasDistrict`, which a member of this class cannot have on
 * the chain), which is why they had no effect on the panel.
 */
export const NO_DISTRICT_ENVELOPE_CODES = [
  "no-district-on-record",
  "unzoned-no-district-basis",
] as const;

/**
 * Absence kinds that put a chain in this class. `no-zoning-stamp` is the
 * only kind hauska-engine mints for a null/empty district
 * (`emit-zoning-fact.ts`); `zoning-absent` is the adapter's OWN fallback
 * reason for an absence whose kind is missing (the `!hasDistrict` branch
 * below). Both already render as an ABSENT zoning row and the fact sheet
 * collapses them into one branch (`fact-sheet-resolver.ts`); the class
 * predicate makes the adapter agree with them rather than the reverse.
 */
export const NO_DISTRICT_ABSENCE_KINDS = ["no-zoning-stamp", "zoning-absent"] as const;

/** Breadth-bake reason TEXT for the same cohort (the LDT fixture's declared `reason` values). */
const NO_DISTRICT_TEXT_RE = /no[ -]?district|not[ -]?onboarded|unzoned/i;

/**
 * THE INVENTORY (P-303 step 5): every input that routes a parcel to the
 * panel's `no-zoning-stamp` decline, with the verdict this codebase owes it.
 * `genuineAbsence` answers one question only — "does this input prove the
 * parcel has no zoning district?" — and no member of the class answers yes:
 * each is either a breadth-bake observation made at its own read time
 * (2026-07-24 for the Waco atom) or an explicit onboarding gap. The class
 * therefore declines only while the payload holds no district; a
 * record-stamped district contradicts every member.
 */
export const NO_DISTRICT_DECLINE_SOURCES: ReadonlyArray<{
  from: NoDistrictDeclineBasis["from"];
  value: string;
  genuineAbsence: false;
  why: string;
}> = [
  {
    from: "zoning-absence-kind",
    value: "no-zoning-stamp",
    genuineAbsence: false,
    why: "The engine's honest-absence kind for a null/empty district at bake time ('No zoning district observed for parcel'). Absence of a STAMP, not of zoning: the same atom's jurisdiction is often zoned and simply unstamped (live: Waco R-1B, stamped in the parcel record 2026-09-10).",
  },
  {
    from: "envelope-decline-code",
    value: "no-district-on-record",
    genuineAbsence: false,
    why: "hauska-engine cascade code whose reason text is 'jurisdiction not yet onboarded' (city-signal cohort). A stamp gap by construction.",
  },
  {
    from: "envelope-decline-code",
    value: "unzoned-no-district-basis",
    genuineAbsence: false,
    why: "hauska-engine cascade code for the unincorporated/no-situs-signal cohort ('unzoned jurisdiction — no district basis'). The only member that asserts unzoned; it is a county-wide cascade inference from a postal-city proxy, and a record-stamped district contradicts it.",
  },
  {
    from: "envelope-decline-reason",
    value: "unzoned",
    genuineAbsence: false,
    why: "Breadth-bake reason text (the shared envelope-verification fixture's `unzoned` case, 208,868 of 490,185 six-county atoms). Same stamp gap, older vocabulary.",
  },
  {
    from: "envelope-decline-reason",
    value: "not onboarded",
    genuineAbsence: false,
    why: "Breadth-bake reason text (the shared fixture's `not-onboarded` case, 153,775 of 490,185). The XD-2 cohort; LDT's route already draws it.",
  },
  {
    from: "zoning-absence-kind",
    value: "zoning-absent",
    genuineAbsence: false,
    why: "The adapter's own fallback reason for an absence with no kind recorded — absence of information, not of zoning.",
  },
];

export interface NoDistrictDeclineBasis {
  from: "zoning-absence-kind" | "envelope-decline-code" | "envelope-decline-reason";
  token: string;
  genuineAbsence: boolean;
}

/**
 * Classify a chain's no-district decline basis, or null when the chain is not
 * in the class. Reads the zoning absence kind first (the panel's own token),
 * then the envelope atom's machine code, then its human reason text. Pure and
 * side-effect free: no district is ever derived here.
 */
export function noDistrictDeclineBasis(input: {
  zoningAbsenceKind?: string | null;
  envelopeDeclineCode?: string | null;
  envelopeDeclineReason?: string | null;
}): NoDistrictDeclineBasis | null {
  const kind = (input.zoningAbsenceKind ?? "").trim().toLowerCase();
  if (kind && (NO_DISTRICT_ABSENCE_KINDS as readonly string[]).includes(kind)) {
    return { from: "zoning-absence-kind", token: kind, genuineAbsence: false };
  }
  const code = (input.envelopeDeclineCode ?? "").trim();
  if (code && (NO_DISTRICT_ENVELOPE_CODES as readonly string[]).includes(code)) {
    return { from: "envelope-decline-code", token: code, genuineAbsence: false };
  }
  const reason = (input.envelopeDeclineReason ?? "").trim();
  if (reason && NO_DISTRICT_TEXT_RE.test(reason)) {
    return { from: "envelope-decline-reason", token: reason, genuineAbsence: false };
  }
  return null;
}

/**
 * The record-composed evidence the caller may pass in: the parcel record's
 * own zoning stamp and setback axes (P152-RAILS / OPS-23, `parcel_record_cell`).
 * Structural on purpose — the caller's `ZoningSetbackOverride` already has
 * these fields and no cross-module type import is needed.
 */
export interface RecordZoningSetbackEvidence {
  district?: string;
  jurisdictionKey?: string;
  setbackAxisOverrides?: {
    front_ft?: number;
    side_ft?: number;
    rear_ft?: number;
    side_corner_ft?: number;
  };
}

/**
 * A record setback table is only a table when every PRIMARY axis is served.
 * An envelope inset needs front, side and rear; drawing one from a partial
 * row would invent the missing insets, which is the fabrication this
 * codebase's honest-absence doctrine exists to prevent. The corner axis is
 * genuinely optional (`side_interior_ft`/`side_corner_ft` are optional in
 * the facet shape) and is carried when served.
 */
export function recordSetbackTable(
  axes: RecordZoningSetbackEvidence["setbackAxisOverrides"] | null | undefined,
): { front_ft: number; side_ft: number; rear_ft: number; side_corner_ft?: number } | null {
  if (!axes) return null;
  const front = axes.front_ft;
  const side = axes.side_ft;
  const rear = axes.rear_ft;
  if (typeof front !== "number" || typeof side !== "number" || typeof rear !== "number") {
    return null;
  }
  return {
    front_ft: front,
    side_ft: side,
    rear_ft: rear,
    ...(typeof axes.side_corner_ft === "number" ? { side_corner_ft: axes.side_corner_ft } : {}),
  };
}

/**
 * P-249 branch shape, ONE definition (the adapter's own unverified branch and
 * the P-303 record-stamped branch below must not drift). `status: "ok"` is
 * what makes `facetsNeedLiveEnvelopeDerive` fetch the modelled polygon;
 * `figureWithheld` is what keeps the area figure off every surface.
 */
function envelopeUnverifiedBranch(input: {
  district: string;
  setbacks: NonNullable<NonNullable<PeBakedFacetPayload["envelope"]>["setbacks"]>;
  /** The withheld-figure clause naming WHY this envelope is unverified. */
  basisClause: string;
  /** Provenance of the setback scalars carried on this envelope. */
  setbackSource?: "atom-chain" | "parcel-record";
}): PeBakedFacetPayload["envelope"] {
  return {
    status: "ok",
    declineReason: "envelope-unverified",
    figureWithheld: true,
    district: input.district,
    setbacks: input.setbacks,
    ...(input.setbackSource ? { setbackSource: input.setbackSource } : {}),
    approximate: true,
    provisional: true,
    disclosure:
      "Buildable area withheld — this parcel's buildable-envelope outcome has " +
      `not passed ground-truth verification (${input.basisClause}). ` +
      "The envelope outline is modelled from the setback table on record and " +
      "drawn for reference; the area figure stays withheld until a verified " +
      "atom backs it.",
  };
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
  opts?: {
    /** Live layer-23 scalars for a per-parcel-only jurisdiction (e.g. Bastrop city), pre-fetched by the caller. */
    perParcelSetback?: CodifiedSetbackScalars | null;
    /**
     * P-303 (2026-09-17) — the parcel record's own zoning stamp and setback
     * axes for this parcel, fetched and composed by the caller BEFORE this
     * call (`pe-property-atoms.ts`, `composeZoningSetbackOverride`). Consulted
     * for exactly one decision: whether a chain in the no-district decline
     * class should take the P-249 `envelope-unverified` branch instead of the
     * earlier `no-zoning-stamp` decline. It never supplies a district to a
     * chain that is not in that class, and never overrides a chain district.
     */
    recordZoningSetback?: RecordZoningSetbackEvidence | null;
  },
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
  const chainDistrict =
    !absenceKind && typeof zf?.district === "string" && zf.district.trim().length > 0
      ? (zf.district as string).trim()
      : null;

  /**
   * P-303 (2026-09-17) — the no-district decline class (see
   * NO_DISTRICT_DECLINE_SOURCES above) plus the parcel record's own stamp.
   *
   * The record's district is consulted ONLY here and ONLY when (a) the chain's
   * own envelope basis is in the class and (b) the chain carries no district of
   * its own — i.e. exactly the case where a chain-only adapter had nothing to
   * draw from and printed `no-zoning-stamp` for a parcel the ledger stamps.
   * A chain that already has a district is never touched by this, and no
   * district is ever invented: the value comes off the payload's own
   * record-composed zoning facet, which the caller passed in.
   */
  const noDistrictBasis = noDistrictDeclineBasis({
    zoningAbsenceKind: absenceKind || null,
    envelopeDeclineCode:
      envAtom && typeof envAtom.warmVerifyDeclineCode === "string"
        ? envAtom.warmVerifyDeclineCode
        : null,
    envelopeDeclineReason:
      (envAtom && typeof envAtom.warmVerifyDecline === "string"
        ? envAtom.warmVerifyDecline
        : "") ||
      (envAtom?.outcome && typeof envAtom.outcome.reason === "string"
        ? envAtom.outcome.reason
        : ""),
  });
  const recordStamp = opts?.recordZoningSetback ?? null;
  const recordDistrict =
    noDistrictBasis &&
    !chainDistrict &&
    typeof recordStamp?.district === "string" &&
    recordStamp.district.trim().length > 0
      ? recordStamp.district.trim()
      : null;
  const district = chainDistrict ?? recordDistrict;
  const hasDistrict = district !== null;
  // The stamped corpus jurisdiction key (from the zoning source adapter), so
  // chat atom-retrieval sends areaContext.jurisdictionKey and the answer can
  // carry cited atoms. Null when the adapter has no jurisdiction suffix.
  const jurisdictionKey = jurisdictionKeyFromSourceAdapter(zoningSourceAdapter);
  /**
   * P-257 — a planned-development code is not a Euclidean district (A-164).
   *
   * Computed HERE, before any scalar is read, so a `PD`/`PUD` code can reach no
   * branch that serves a setback value: the codified table path, the
   * per-parcel-record path (`recordTable`, which is where the measured defect's
   * 20/100/100/100 came from) and the atom-chain path all read `null` for a
   * member. The parcel's own stored record cannot launder a PUD back into a
   * table row, because the gate keys on the DISTRICT CODE the payload carries
   * rather than on where the numbers came from.
   */
  const plannedDevelopment = plannedDevelopmentSetbackRefusal({
    districtCode: district,
    jurisdictionKey,
  });
  /**
   * The record-served setback table (primary axes only — see
   * {@link recordSetbackTable}). Computed only for a class member whose
   * district came from the record, so no other branch in the tree can start
   * consuming record scalars as a side effect of this lane. Never for a
   * planned-development district: the record's axes are Euclidean by
   * construction, which is the whole defect.
   */
  const recordTable =
    recordDistrict && !plannedDevelopment
      ? recordSetbackTable(recordStamp?.setbackAxisOverrides)
      : null;

  const setbacks = plannedDevelopment ? null : mapSetbacks(rule, district);
  const tableSetbacks =
    plannedDevelopment || setbacks
      ? null
      : hasDistrict && jurisdictionKey
        ? resolveCodifiedSetbacksForStamp(
            jurisdictionKey,
            district,
            opts?.perParcelSetback,
          )
        : null;
  const effectiveSetbacks = plannedDevelopment
    ? undefined
    : (setbacks ?? tableSetbacks ?? undefined);
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
        // P-154 wave 6 (R-1): the followed row's own citation + effective
        // date travel with the values they belong to, so the panel can print
        // "30/10/30/20 … Ord. 2026-06, eff. 2026-04-14" instead of a value
        // with no citation (the wave-6 falsifier: a value with no citation
        // means the disclosure is missing).
        ...(dm?.citationUrl ? { sourceCitationUrl: dm.citationUrl } : {}),
        ...(dm?.sourceDate ? { sourceDate: dm.sourceDate } : {}),
        ...(dm?.dateBasis ? { sourceDateBasis: dm.dateBasis } : {}),
      }
      : {};
  // P-270 (OPS-24 X11): the atom-chain producer's own copy of the vintage
  // decision. Until this lane the two lines below wrote the date only when it
  // existed and wrote NO state when it did not, so an atom-chain citation with
  // no readable date rendered as a plain citation. `stateFromWireBasis` keeps
  // "nobody consulted a date at all" (an atom minted before P-154 wave 6, no
  // `dateBasis` on the wire) apart from "the source's own basis says
  // unreadable", and deliberately never invents a date.
  const dmDateRead: SetbackDateRead = dm?.sourceDate
    ? readSetbackDateAtSource({ present: true, value: dm.sourceDate })
    : stateFromWireBasis(dm?.dateBasis);
  const dmCitationVintage = setbackCitationVintageRow({
    date: dmDateRead,
    citationUrl: dm?.citationUrl,
    sourceLabel: dm?.citationUrl ? `property atom chain setback-rule (${dm.dateBasis ?? "no basis on wire"})` : null,
  });
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

  if (plannedDevelopment) {
    // P-257 / A-164 — a planned-development district is not a Euclidean
    // district, so no setback table is emitted and nothing is drawn from one.
    // This branch is placed FIRST among the envelope branches on purpose: it
    // must win over the P-303 record-stamped branch below, which is the exact
    // path the measured defect took (48021:70907: chain declines on the zoning
    // axis, the record stamps district `PD` and supplies Euclidean axes, and
    // the record's axes were computed through legacy-design-tools'
    // `mapDistrict`, whose loose prefix matcher crossed the two-character code
    // `PD` into Smithville's `PD-Z Zero Lot Line Garden Home District` row and
    // served its not_specified sentinels as real feet: 20/100/100/100).
    envelope = {
      status: "declined",
      declineReason: plannedDevelopment.declineReason,
      district: plannedDevelopment.district,
      approximate: true,
      provisional: true,
      disclosure: plannedDevelopment.reason,
    };
    envelopeCovered = false;
  } else if (noDistrictBasis && !hasDistrict) {
    // Align with cortex absentZoningHonesty / declineReason vocabulary.
    // P-167 wave 5 (OPS-23 R-4): the atom's own absence.reason (read into
    // absenceReason above) already carries a human sentence for the common
    // case, so this rarely falls through — but when it does (an atom with
    // no reason recorded), the fallback now reads the shared vocabulary's
    // own no-zoning-stamp humanization instead of a fourth, separately
    // hand-typed sentence, so hauska-map, the MCP (tool-honesty.ts calls
    // the same envelopeHuman generically) and hauska-engine's PDF (author.ts
    // falls back to the identical envelopeHuman(kind) call) converge on one
    // string for this edge case too.
    //
    // P-303 (2026-09-17): the class predicate replaces the literal
    // `absenceKind === "no-zoning-stamp"` test so a chain whose basis is one
    // of the engine's cascade CODES (or a breadth-bake reason string) lands
    // on the same class token instead of the adapter-only `zoning-absent`
    // fallback. Both tokens render as an ABSENT zoning row and the fact sheet
    // collapses them into one branch (`fact-sheet-resolver.ts`); the visible
    // difference for a member whose zoning fact carried no absence kind is
    // the row's absence LABEL, which becomes this branch's "no zoning stamp
    // here" instead of "no zoning here" — the panel's own vocabulary for this
    // cohort. Every chain that used to take THIS branch is unchanged: a
    // zoning absence always implied `!hasDistrict` here.
    envelope = {
      status: "declined",
      declineReason: "no-zoning-stamp",
      approximate: true,
      provisional: true,
      disclosure:
        absenceReason ||
        envelopeHuman("no-zoning-stamp") ||
        "No zoning stamp on this parcel — honest absence; no district invented.",
    };
    envelopeCovered = false;
  } else if (noDistrictBasis && recordDistrict) {
    // P-303 (2026-09-17) — THE STAMPED GAP. The chain declines on the zoning
    // axis, but the payload's own record-composed zoning facet stamps a
    // district for this parcel and the parcel record serves its setback
    // table. The class is a stamp gap, not a zoning absence (see
    // NO_DISTRICT_DECLINE_SOURCES), so the envelope takes the SAME P-249
    // branch a district-bearing chain takes: `status: "ok"` so the live
    // derive fetches the modelled polygon, the area figure withheld, and a
    // disclosure that names the unverified atom and its own basis. Live XD-2
    // (Waco `48309:103015`, 2026-09-17) is this case.
    if (recordTable) {
      const atomName = (envAtom?.atomDid ?? "").trim() || "the buildable-envelope atom";
      const atomCode = (envAtom?.warmVerifyDeclineCode ?? "").trim();
      envelope = envelopeUnverifiedBranch({
        district: recordDistrict,
        setbacks: recordTable,
        setbackSource: "parcel-record",
        basisClause:
          `${atomName} is unverified for this parcel and declines on the zoning axis ` +
          `(${noDistrictBasis.token}` +
          (atomCode && atomCode !== noDistrictBasis.token ? `; envelope atom code ${atomCode}` : "") +
          `) while the parcel record stamps district ${recordDistrict}` +
          (recordStamp?.jurisdictionKey ? ` (${recordStamp.jurisdictionKey})` : "") +
          " and serves the setback table this outline is modelled from",
      });
      envelopeCovered = true;
    } else {
      // District stamped, no complete primary-axis table served (yet, or only
      // partially — see recordSetbackTable). An inset cannot be drawn without
      // inventing the missing axes, so the decline stands — but the reason
      // moves off `no-zoning-stamp`, which is no longer true once a district
      // is on the payload.
      envelope = {
        status: "declined",
        declineReason: "setback-rule-pending",
        district: recordDistrict,
        approximate: true,
        provisional: true,
        disclosure: setbackPendingDisclosure({
          jurisdictionKey,
          district: recordDistrict,
        }),
      };
      envelopeCovered = false;
    }
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
        // P-339 (OPS-24, ruling 15): the drawing route owns this envelope's
        // reason and this payload mirrors it. The sentence is composed by ONE
        // exported function so its wording is testable against the probe's own
        // phrase lists (see the test beside this file).
        envelope = {
          status: "ok",
          district: district ?? undefined,
          setbacks: effectiveSetbacks,
          approximate: true,
          provisional: true,
          reasonOwner: "place/buildable-envelope",
          disclosure: codifiedTableEnvelopeDisclosure({
            jurisdictionKey,
            servedFromAtomChainRule: setbacks !== null,
            warmVerifyDeclineReason: warmDecline.declineReason ?? null,
          }),
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
      disclosure: setbackPendingDisclosure({
        jurisdictionKey,
        district,
      }),
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
  } else if (!envelope && outcomeKind === "no-buildable-area" && depthWarm) {
    envelope = {
      status: "no-buildable-area",
      district: district ?? undefined,
      setbacks: effectiveSetbacks,
      // Honest zero — setbacks consume the lot (QA-3: not "not verified").
      // Gated on depthWarm (ground-truth verified, see checkEnvelopeGroundTruth
      // in hauska-engine) — see the sibling `declined`/`envelope-unverified`
      // branch below for the unverified case this predicate exists to exclude.
      buildableAreaPct: 0,
      approximate: true,
      provisional: true,
      emptyReason: "Setbacks consume the lot — no buildable area remains.",
      ...(typeof areaSqFt === "number" ? { buildableAreaSqFt: areaSqFt } : {}),
      ...(geojson !== undefined ? { geojson } : {}),
    };
    envelopeCovered = true;
  } else if (!envelope && outcomeKind === "no-buildable-area") {
    // P-216 (2026-09-15): a "no-buildable-area" atom outcome that never passed
    // depth-warm/ground-truth promotion (checkEnvelopeGroundTruth) is a
    // shape-only computation with no confirmed road-frontage edge labeling —
    // exactly the state the 2026-09-11 "no approximation" ruling (Ruling 2,
    // `_decisions/2026-09-11_not_specified_semantics_and_no_approximation_state.md`)
    // and R-2 (`_decisions/2026-09-11_ruling_b_reversed_polygon_only.md`)
    // refuse: buildable area is a substantive negative claim about a specific
    // parcel and stays refused until a verified atom backs it. A shape-only
    // ring can mislabel GIS-artifact vertices as `side` and collapse a long
    // narrow lot to a false zero (confirmed live on 48209:97658 and siblings,
    // a nine-edge ring with five `side`-labelled edges). Setback DISTANCES
    // are separately ruled and stay served; only the area figure and the
    // definitive zero verdict are withheld.
    //
    // P-249 (2026-09-16): the refusal used to be a `declined` envelope with no
    // geometry, which also killed the DRAWING — `facetsNeedLiveEnvelopeDerive`
    // requires status "ok" plus real setback scalars, so nothing ever fetched
    // the modelled polygon, and the card read as "envelope declined" for a lot
    // that has a district and a table. That over-refused: the 2026-09-11
    // ruling (R-2, `_decisions/2026-09-11_ruling_b_reversed_polygon_only.md`)
    // reversed Ruling B for the POLYGON only — draw it wherever a district and
    // a setback table exist, and let only the AREA wait for a verified atom.
    // So this branch now serves the modelled envelope WITHOUT a figure:
    //   - `status: "ok"` + the real setback scalars is exactly what the
    //     client's `facetsNeedLiveEnvelopeDerive` needs to fire the live
    //     labelEdges+derive pass that supplies the polygon (the atom carries
    //     no geometry, so the live derive is the only source of a shape — see
    //     the CP1 read in this lane's close);
    //   - NO `buildableAreaSqFt` / `buildableAreaPct` — the unverified atom's
    //     zero is never served (A-180), and `figureWithheld` stops the
    //     augmentation that follows from stamping its own recomputed area on
    //     the payload (`live-envelope-augment.ts`);
    //   - `declineReason` stays `envelope-unverified` as the stable branch
    //     token every surface and the divergence fixture read, even though the
    //     status is now "ok" — it is not a decline, and no reader that guards
    //     on `status === "declined"` (the card's decline row, the zoning
    //     decline stamp) treats it as one.
    // P-303 (2026-09-17): the branch SHAPE has one definition
    // (`envelopeUnverifiedBranch`) shared with the record-stamped branch
    // above, so the two cannot drift on status/declineReason/figureWithheld.
    // The clause stays byte-identical to the text this branch has served
    // since P-249 (the panel's card and the share brief print it verbatim).
    envelope = envelopeUnverifiedBranch({
      district: district as string,
      setbacks: effectiveSetbacks,
      basisClause: "no confirmed road-frontage edge labeling",
    });
    // The setback distances and the modelled outline ARE served (the ruling
    // above), so the envelope facet is covered; only the figure is not.
    envelopeCovered = true;
  } else if (!envelope && (outcomeKind === "buildable" || effectiveSetbacks)) {
    // Proof atoms may omit geojson / pct — honest partial OK; do not fabricate.
    // When pct is absent, baked-facets marks buildable as pending (QA-3).
    // When silent axes exist, never publish a pct that treated them as 0 ft.
    // depthWarm-gated for the same reason as the no-buildable-area branch
    // above (P-216, Ruling 2 / R-2) — an unverified atom's positive area is
    // exactly as unfounded as its zero.
    const pctFromAtom =
      depthWarm &&
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
      // not_specified axes as 0 ft (the false consume-lot class). depthWarm-
      // gated (P-216, Ruling 2 / R-2): an unverified atom's area is unfounded.
      ...(typeof areaSqFt === "number" && areaSqFt > 0 && depthWarm
        ? { buildableAreaSqFt: areaSqFt }
        : {}),
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
  // P-270 (OPS-24 X11): applied HERE, once, after every branch above — so a
  // citation the atom chain serves without a readable effective date is
  // declared whichever branch produced the envelope, and the declaration
  // cannot be forgotten by a branch added later. `dmCitationVintage` is null
  // when the date was read at source (the agreeing control) or when the atom
  // chain cites nothing, so the branch-neutral placement cannot add a note to
  // a payload that has nothing to declare.
  if (envelope && dmCitationVintage) {
    envelope = {
      ...envelope,
      citationVintage: dmCitationVintage,
      disclosure: disclosureWithCitationVintage(envelope.disclosure ?? null, dmCitationVintage),
    };
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
