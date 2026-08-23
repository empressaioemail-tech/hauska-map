// apps/property-explorer/src/lib/sheet-to-card-model.ts
//
// THE INSPECT CARD'S DATA SOURCE (invariant I2), projected from the ONE sealed
// sheet.
//
// The card used to run two fetches of its own — `fetchBakedNodeFacets` and
// `fetchBuildableEnvelope` — which made it one of the five paths that answered
// the same parcel questions separately. It now renders a projection of the
// subject's sheet and issues no lookup of its own.
//
// This is a PROJECTION, not a second derivation. Every value is read straight
// off the sheet; nothing here queries, and nothing here decides what is true.
// It exists at all because the card's render shapes (`BakedCardModel` and its
// envelope state) belong to a lane that owns the card's presentation, and
// keeping those shapes byte-compatible is what lets the data source change
// without touching a line of rendering.
//
// The two shapes it fills were previously only fillable by the two fetches:
//   - BakedCardModel        (src/lib/baked-facets.ts) — the facet rows
//   - CardEnvelopeState     (mirrors InspectCard's local EnvelopeState)
//
// AMENDMENT 1 is what makes this possible at all. Before it, `Provenance` could
// not name the atoms behind a fact and `Setbacks` was four bare numbers, so a
// swap would have silently deleted the AtomChip popovers and the setback X-ray
// disclosure. Both are reconstructed here from the amended types.

import {
  formatMeasurement,
  isPresent,
  type Fact,
  type FloodDetermination,
  type ParcelFactSheet,
  type SetbackAxis,
  type Setbacks,
} from "@empressaio/parcel-fact-sheet";
import {
  FLOOD_HAZARD_FACT_MISSING_REASON,
  PIPELINE_FACT_MISSING_REASON,
  SPECIAL_DISTRICT_FACT_MISSING_REASON,
  WELL_FACT_MISSING_REASON,
  BUILDING_FOOTPRINT_FACT_MISSING_REASON,
  BOUNDARY_EDGE_FACT_MISSING_REASON,
  OWNER_FACT_MISSING_REASON,
  type BakedCardModel,
  type BakedFacetPayload,
  type CardFacet,
  livingAreaLayerToCardFacet,
  zoningLayerToCardFacet,
} from "./baked-facets";
import { isLayerAbsenceWire } from "./layer-absence";
import type {
  EnvelopeProvenanceRefs,
  SetbackFieldNotes,
  SetbackFieldProvenance,
} from "./buildable-envelope.js";

/** P-63 verdict layer wires copied from the facets payload at seal time. */
export type VerdictLayerSnapshot = Pick<
  BakedFacetPayload,
  "livingAreaSqft" | "zoning" | "facetCoverage"
> & {
  zoningDecline?: string | null;
};

/** Parcel fact sheet plus optional P-63 verdict layer snapshot from facets. */
export type ParcelFactSheetWithVerdictLayers = ParcelFactSheet & {
  verdictLayers?: VerdictLayerSnapshot;
};

function verdictLayersToCardFacets(
  layers: VerdictLayerSnapshot | undefined,
): Partial<Pick<BakedCardModel, "livingArea" | "zoning">> | null {
  if (!layers) return null;
  const hasStructural =
    layers.facetCoverage?.structural === true ||
    layers.livingAreaSqft != null;
  const hasZoningVerdict = isLayerAbsenceWire(layers.zoning);
  if (!hasStructural && !hasZoningVerdict) return null;

  const payload: BakedFacetPayload = {
    livingAreaSqft: layers.livingAreaSqft,
    zoning: layers.zoning,
    facetCoverage: layers.facetCoverage,
  };
  const out: Partial<Pick<BakedCardModel, "livingArea" | "zoning">> = {
    livingArea: livingAreaLayerToCardFacet(payload),
  };
  if (hasZoningVerdict) {
    out.zoning = zoningLayerToCardFacet(
      layers.zoning,
      layers.facetCoverage?.zoning,
      layers.zoningDecline ?? null,
    );
  }
  return out;
}

/** Mirrors InspectCard's local EnvelopeState. Structural, so no type import. */
export interface CardEnvelopeState {
  status: "idle" | "loading" | "ok" | "empty" | "error";
  setbacks?: {
    front_ft: number | null;
    side_ft: number | null;
    rear_ft: number | null;
    side_interior_ft?: number | null;
    side_corner_ft?: number | null;
    district: string | null;
    governedBy?: SetbackFieldProvenance | null;
    fieldNotes?: SetbackFieldNotes | null;
  } | null;
  summary?: Record<string, unknown> | null;
  disclosure?: string | null;
  reason?: string | null;
  district?: string | null;
  provenanceRefs?: EnvelopeProvenanceRefs | null;
}

function present<T>(value: T): CardFacet<T> {
  return { state: "present", value };
}
function absent(message?: string): CardFacet<string> {
  return { state: "absent", value: message ?? null };
}
function pending(message: string): CardFacet<string> {
  return { state: "pending", value: message };
}

/** A Fact -> the card's four-state facet vocabulary, wording preserved. */
function facetFrom<T>(fact: Fact<T>, render: (value: T) => string): CardFacet<string> {
  if (fact.state === "present") return present(render(fact.value));
  // I4: a FAILED read is not an absence. The card's `pending` vocabulary is
  // the one that does not say "not verified here".
  if (fact.state === "unresolved") return pending(fact.reason);
  return absent(fact.reason);
}

/**
 * Flood row from sheet.flood, which the resolver fills from floodHazardFact
 * only. Missing wire field → unknown (InspectCard hides the row). Never
 * invented from tier2.flood.
 */
export function floodFacetFromSheet(
  flood: Fact<FloodDetermination>,
): CardFacet<string> {
  if (
    flood.state === "absent-uncovered" &&
    flood.reason === FLOOD_HAZARD_FACT_MISSING_REASON
  ) {
    return { state: "unknown", value: null };
  }
  if (flood.state === "present") {
    const codes = flood.value.zones
      .map((z) => z.zone.trim())
      .filter((z) => z.length > 0);
    if (codes.length > 1) return present(`Zones ${codes.join(", ")}`);
    if (codes.length === 1) return present(`Zone ${codes[0]}`);
    if (flood.value.inSfha) {
      return present("Flood determination present (zone unstated)");
    }
    return present("Flood determination present (zone unstated)");
  }
  return facetFrom(flood, () => "");
}

/**
 * Special district row from sheet.specialDistrict, which the resolver fills
 * from specialDistrictFact only. Missing field → unknown (InspectCard hides
 * the row). Typed absence stays visible. Never invented from bake / CAD /
 * mud-pid.
 */
export function specialDistrictFacetFromSheet(
  specialDistrict:
    | Fact<{ districtType: string | null; districtName: string | null }>
    | undefined,
): CardFacet<string> {
  if (!specialDistrict) {
    return { state: "unknown", value: null };
  }
  if (
    specialDistrict.state === "absent-uncovered" &&
    specialDistrict.reason === SPECIAL_DISTRICT_FACT_MISSING_REASON
  ) {
    return { state: "unknown", value: null };
  }
  if (specialDistrict.state === "present") {
    const type = (specialDistrict.value.districtType ?? "").trim();
    const name = (specialDistrict.value.districtName ?? "").trim();
    if (type && name) return present(`${type} — ${name}`);
    if (name) return present(name);
    if (type) return present(type);
    return absent("special-district-fact present with no districtType or districtName");
  }
  return facetFrom(specialDistrict, () => "");
}

/**
 * Pipeline row from sheet.pipeline, which the resolver fills from
 * pipelineFact only. Missing field → unknown (InspectCard hides the row).
 * Gold present-outside uses the resolver's outside-buffer wording and never
 * carries ENERGY TRANSFER. Present-near shows operator / permit / distance
 * from the atom. Typed absence stays visible.
 */
export function pipelineFacetFromSheet(
  pipeline:
    | Fact<{
        nearPipeline: boolean;
        operatorName: string | null;
        t4permit: string | null;
        nearestPipelineDistanceMeters: number | null;
        display: string;
      }>
    | undefined,
): CardFacet<string> {
  if (!pipeline) {
    return { state: "unknown", value: null };
  }
  if (
    pipeline.state === "absent-uncovered" &&
    pipeline.reason === PIPELINE_FACT_MISSING_REASON
  ) {
    return { state: "unknown", value: null };
  }
  if (pipeline.state === "present") {
    const display = (pipeline.value.display ?? "").trim();
    if (display) return present(display);
    return absent("rrc-pipeline-fact present with no display");
  }
  return facetFrom(pipeline, () => "");
}

/**
 * Well row from sheet.well, which the resolver fills from wellFact only.
 * Missing field → unknown (InspectCard hides the row). Gold atom-miss
 * cites well-fact and never carries apiNumber14 / :none / a well. Present
 * fixture shows apiNumber14 from the atom. Typed absence stays visible.
 */
export function wellFacetFromSheet(
  well:
    | Fact<{
        apiNumber14: string | null;
        wellStatus: string | null;
        operatorName: string | null;
        parcelRelation: string | null;
        display: string;
      }>
    | undefined,
): CardFacet<string> {
  if (!well) {
    return { state: "unknown", value: null };
  }
  if (
    well.state === "absent-uncovered" &&
    well.reason === WELL_FACT_MISSING_REASON
  ) {
    return { state: "unknown", value: null };
  }
  if (well.state === "present") {
    const display = (well.value.display ?? "").trim();
    if (display) return present(display);
    return absent("well-fact present with no display");
  }
  return facetFrom(well, () => "");
}

/**
 * Footprint row from sheet.footprint, which the resolver fills from
 * buildingFootprintFact only. Missing field → unknown (InspectCard hides
 * the row). Gold atom-miss cites building-footprint and never carries
 * structureRole / :primary / a footprint. Present fixture shows
 * structureRole from the body. Typed absence stays visible.
 */
export function footprintFacetFromSheet(
  footprint:
    | Fact<{
        structureRole: string | null;
        entityId: string | null;
        display: string;
      }>
    | undefined,
): CardFacet<string> {
  if (!footprint) {
    return { state: "unknown", value: null };
  }
  if (
    footprint.state === "absent-uncovered" &&
    footprint.reason === BUILDING_FOOTPRINT_FACT_MISSING_REASON
  ) {
    return { state: "unknown", value: null };
  }
  if (footprint.state === "present") {
    const display = (footprint.value.display ?? "").trim();
    if (display) return present(display);
    return absent("building-footprint present with no display");
  }
  return facetFrom(footprint, () => "");
}

/**
 * Boundary row from sheet.boundary, which the resolver fills from
 * boundaryEdgeFact only. Missing field → unknown (InspectCard hides
 * the row). Gold present cites property-boundary-edge and shows
 * role=front. Never a GIS outline / txgio_parcel / bake ring. Last
 * entity_id token is never the role. Typed absence stays visible.
 */
export function boundaryFacetFromSheet(
  boundary:
    | Fact<{
        role: string | null;
        entityId: string | null;
        display: string;
      }>
    | undefined,
): CardFacet<string> {
  if (!boundary) {
    return { state: "unknown", value: null };
  }
  if (
    boundary.state === "absent-uncovered" &&
    boundary.reason === BOUNDARY_EDGE_FACT_MISSING_REASON
  ) {
    return { state: "unknown", value: null };
  }
  if (boundary.state === "present") {
    const display = (boundary.value.display ?? "").trim();
    if (display) return present(display);
    return absent("property-boundary-edge present with no display");
  }
  return facetFrom(boundary, () => "");
}

/**
 * Owner row from sheet.owner, which the resolver fills from ownerFact
 * only. Missing field → unknown (InspectCard hides the row). Identified
 * present cites owner-fact and shows taxYear. Anonymous /
 * identified-session-required has no owner body. Never a CAD-roll /
 * cad-parcel-roll / GIS owner.
 */
export function ownerFacetFromSheet(
  owner:
    | Fact<{
        entityId: string | null;
        taxYear: number | null;
        display: string;
      }>
    | undefined,
): CardFacet<string> {
  if (!owner) {
    return { state: "unknown", value: null };
  }
  if (
    owner.state === "absent-uncovered" &&
    owner.reason === OWNER_FACT_MISSING_REASON
  ) {
    return { state: "unknown", value: null };
  }
  if (owner.state === "present") {
    const display = (owner.value.display ?? "").trim();
    if (display) return present(display);
    return absent("owner-fact present with no display");
  }
  return facetFrom(owner, () => "");
}

/** A setback axis -> the card's own display fragment. */
function axisText(axis: SetbackAxis, label: string): string {
  // AMENDMENT 2: a NOT-SPECIFIED axis carries a NULL distance. The absence is
  // in the type, so there is no sentinel for a later reader to mistake for a
  // bug and "fix" to 0 — which would print a 0 ft setback and reintroduce the
  // build-to-line error this treatment exists to prevent.
  if (axis.distance === null) {
    return axis.governedBy ? `${label} ${axis.governedBy}` : `${label} not specified`;
  }
  return `${label} ${formatMeasurement(axis.distance, "us")}`;
}

export function setbackDisplayFromSheet(setbacks: Setbacks): string {
  const parts = [
    axisText(setbacks.front, "F"),
    setbacks.cornerSide?.distance != null &&
    setbacks.cornerSide.distance.value !== setbacks.side.distance?.value
      ? `${axisText(setbacks.side, "S")} · ${axisText(setbacks.cornerSide, "Corner")}`
      : axisText(setbacks.side, "S"),
    axisText(setbacks.rear, "R"),
  ];
  return parts.join(" · ");
}

/** The per-axis X-ray notes, straight off the amended SetbackAxis. */
export function setbackFieldNotesFromSheet(
  setbacks: Setbacks | null,
): SetbackFieldNotes | null {
  if (!setbacks) return null;
  const notes: SetbackFieldNotes = {
    front: setbacks.front.note,
    side: setbacks.side.note,
    rear: setbacks.rear.note,
    sideCorner: setbacks.cornerSide?.note ?? null,
  };
  const any = Object.values(notes).some(
    (n) => typeof n === "string" && n.trim().length > 0,
  );
  return any ? notes : null;
}

/**
 * Atom provenance refs for the AtomChip popovers, reconstructed from
 * `Provenance.atomDids` (AMENDMENT 1).
 *
 * AMENDMENT 2 closed the label gap: an `AtomRef` carries its own display label,
 * so a code-section chip reads as its section number again. A ref with a null
 * label renders unlabelled rather than guessed — the earlier
 * infer-from-the-governing-rule fallback is GONE, because a renderer cannot
 * tell a guessed label from a real one, and a null one it can handle.
 */
export function provenanceRefsFromSheet(
  sheet: ParcelFactSheet,
): EnvelopeProvenanceRefs | null {
  const zoningDids = isPresent(sheet.zoning) ? sheet.zoning.provenance.atomDids : [];
  const setbackDids = isPresent(sheet.setbacks)
    ? sheet.setbacks.provenance.atomDids
    : [];
  const envelopeDids =
    sheet.envelope.kind === "derived" || sheet.envelope.kind === "consumed"
      ? sheet.envelope.provenance.atomDids
      : [];

  // The named role is the fact's OWN atom; anything further is a code section,
  // which is what the shipped renderer labels with a section number.
  const extras = setbackDids.slice(1);

  const refs: EnvelopeProvenanceRefs = {};
  if (zoningDids[0]) refs.zoning = { atomDid: zoningDids[0].did };
  if (setbackDids[0]) refs.setback = { atomDid: setbackDids[0].did };
  if (envelopeDids[0]) refs.envelope = { atomDid: envelopeDids[0].did };
  const labelled = extras.filter((ref) => ref.label !== null);
  if (labelled.length) {
    refs.codeSections = labelled.map((ref) => ({
      atomDid: ref.did,
      sectionNumber: ref.label as string,
    }));
  }
  return Object.keys(refs).length ? refs : null;
}

/**
 * The card's facet view-model, projected from the sheet.
 *
 * Deliberately preserves the card's own wording so a lane that owns the
 * rendering is unaffected: "present" values read as they did, an honest absence
 * still carries its reason, and a FAILED read uses the `pending` vocabulary
 * rather than the "not verified here" treatment.
 */
export function bakedCardModelFromSheet(
  sheet: ParcelFactSheetWithVerdictLayers,
): BakedCardModel {
  const env = sheet.envelope;

  // AMENDMENT 4: `areaPctOfLot` is NULLABLE. With no lot area there is no
  // percentage, so the card shows the AREA — the fact that is actually known —
  // rather than a computed-looking figure standing in for a missing one.
  //
  // The "consumed" 0% is NOT a sentinel: that variant means the setbacks
  // genuinely consume the lot, so zero buildable area is the measured truth.
  const buildablePct: CardFacet<string> =
    env.kind === "derived"
      ? env.areaPctOfLot !== null && Number.isFinite(env.areaPctOfLot)
        ? present(`${Math.round(env.areaPctOfLot)}%`)
        : present(formatMeasurement(env.area, "us"))
      : env.kind === "consumed"
        ? present("0%")
        : sheet.setbacks.state === "unresolved"
          ? pending("pending")
          : absent();

  // AMENDMENT 3: a null lot area is an ABSENCE, not a zero and not a NaN. It
  // was being divided unguarded, which produced NaN acreage silently.
  const lotAcres =
    sheet.geometry.lotArea === null
      ? null
      : sheet.geometry.lotArea.value / 43560;

  const model: BakedCardModel = {
    parcelNodeId: sheet.identity.parcelNodeId,
    apn: facetFrom(sheet.identity.apn, (v) => v),
    situsAddress: facetFrom(sheet.identity.situsAddress, (v) => v),
    // county is NOT a Fact on the sheet, so this can never read "not on file".
    county: present(
      `${sheet.identity.county.name} County (${sheet.identity.county.fips})`,
    ),
    landUse: facetFrom(sheet.landUse, (v) =>
      v.description ? `${v.code} — ${v.description}` : v.code,
    ),
    zoning: facetFrom(sheet.zoning, (v) => v.code),
    // I3: the acreage VALUE only. Provenance renders in the disclosure, never
    // welded into the string the way formatAcreageDisplay used to weld it.
    acreage:
      lotAcres !== null && Number.isFinite(lotAcres)
        ? present(`${Math.round(lotAcres * 10000) / 10000} ac`)
        : absent(),
    setbacks: facetFrom(sheet.setbacks, setbackDisplayFromSheet),
    buildablePct,
    flood: floodFacetFromSheet(sheet.flood),
    specialDistrict: specialDistrictFacetFromSheet(sheet.specialDistrict),
    pipeline: pipelineFacetFromSheet(sheet.pipeline),
    well: wellFacetFromSheet(sheet.well),
    footprint: footprintFacetFromSheet(sheet.footprint),
    boundary: boundaryFacetFromSheet(sheet.boundary),
    owner: ownerFacetFromSheet(sheet.owner),
    envelopeApproximate: env.kind === "derived" ? env.approximate : env.kind === "consumed",
    envelopeStatus:
      env.kind === "derived" ? "ok" : env.kind === "consumed" ? "no-buildable-area" : "declined",
    envelopeEmptyReason: env.kind === "consumed" ? env.reason : null,
    envelopeDeclineReason: env.kind === "not-derived" ? env.reason : null,
    disclosure: null,
    buildableDisplayKind:
      env.kind === "derived"
        ? "buildable-with-area"
        : env.kind === "consumed"
          ? "declined-consume"
          : sheet.setbacks.state === "unresolved"
            ? "pending"
            : "absent",
    // The sheet id IS the cross-surface agreement token: two surfaces showing
    // the same parcel with different tokens is now visible to the reader.
    buildableAgreementToken: sheet.factSheetId,
    provenance: {
      parcelSource: isPresent(sheet.identity.apn)
        ? sheet.identity.apn.provenance.source
        : null,
      landUseSource: isPresent(sheet.landUse) ? sheet.landUse.provenance.source : null,
      landUseGateBlocked:
        sheet.landUse.state === "absent-uncovered" &&
        sheet.landUse.reason.includes("not served"),
      vintage: isPresent(sheet.identity.apn)
        ? sheet.identity.apn.provenance.vintage
        : null,
    },
    bakedAt: isPresent(sheet.identity.apn)
      ? sheet.identity.apn.provenance.retrievedAt
      : null,
    provenanceRefs: provenanceRefsFromSheet(sheet),
    // The rich per-axis governedBy structure is flattened to a string on the
    // amended SetbackAxis, so the card's structured slot is left null and the
    // governing text rides the setback display line instead. Reported.
    setbackGovernedBy: null,
    setbackFieldNotes: setbackFieldNotesFromSheet(
      isPresent(sheet.setbacks) ? sheet.setbacks.value : null,
    ),
    livingArea: { state: "unknown", value: null },
  };

  const verdictFacets = verdictLayersToCardFacets(sheet.verdictLayers);
  if (verdictFacets) {
    if (verdictFacets.livingArea) {
      model.livingArea = verdictFacets.livingArea;
    }
    if (verdictFacets.zoning) {
      model.zoning = verdictFacets.zoning;
    }
  }

  return model;
}

/** The envelope state the card's live-path renderers read. */
export function envelopeStateFromSheet(sheet: ParcelFactSheet): CardEnvelopeState {
  const env = sheet.envelope;
  const setbacks = isPresent(sheet.setbacks) ? sheet.setbacks.value : null;
  const axisFt = (a: SetbackAxis | null | undefined): number | null =>
    a?.distance ? a.distance.value : null;

  const wire = setbacks
    ? {
        front_ft: axisFt(setbacks.front),
        side_ft: axisFt(setbacks.side),
        rear_ft: axisFt(setbacks.rear),
        side_interior_ft: axisFt(setbacks.side),
        side_corner_ft: axisFt(setbacks.cornerSide),
        district: isPresent(sheet.zoning) ? sheet.zoning.value.code : null,
        governedBy: null,
        fieldNotes: setbackFieldNotesFromSheet(setbacks),
      }
    : null;

  const provenanceRefs = provenanceRefsFromSheet(sheet);

  if (env.kind === "derived") {
    return {
      status: "ok",
      setbacks: wire,
      summary: {
        buildableAreaSqFt: env.area.value,
        buildableAreaPct: env.areaPctOfLot,
        // AMENDMENT 3: the absence is in the type now, so this is a straight
        // read. It still matches the old envelope wire's `?? null` convention.
        parcelAreaSqFt: sheet.geometry.lotArea?.value ?? null,
        notSurveyGrade: true,
        approximate: env.approximate,
      },
      disclosure: null,
      district: wire?.district ?? null,
      provenanceRefs,
    };
  }
  if (env.kind === "consumed") {
    return {
      status: "empty",
      setbacks: wire,
      reason: env.reason,
      district: wire?.district ?? null,
      provenanceRefs,
    };
  }
  return {
    status: "error",
    setbacks: wire,
    reason: env.reason,
    district: wire?.district ?? null,
    provenanceRefs,
  };
}
