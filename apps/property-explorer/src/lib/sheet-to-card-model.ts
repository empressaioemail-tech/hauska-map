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
  type ParcelFactSheet,
  type SetbackAxis,
  type Setbacks,
} from "@empressaio/parcel-fact-sheet";
import type {
  BakedCardModel,
  CardFacet,
} from "./baked-facets";
import type {
  EnvelopeProvenanceRefs,
  SetbackFieldNotes,
  SetbackFieldProvenance,
} from "./buildable-envelope.js";

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

/** A setback axis -> the card's own display fragment. */
function axisText(axis: SetbackAxis, label: string): string {
  // A NOT-SPECIFIED axis carries a non-finite distance and a governing rule;
  // `formatMeasurement` renders that as "not measured", and it must never
  // render as a real 0 ft.
  const measured = Number.isFinite(axis.distance.value);
  if (!measured) {
    return axis.governedBy ? `${label} ${axis.governedBy}` : `${label} not specified`;
  }
  return `${label} ${formatMeasurement(axis.distance, "us")}`;
}

export function setbackDisplayFromSheet(setbacks: Setbacks): string {
  const parts = [
    axisText(setbacks.front, "F"),
    setbacks.cornerSide &&
    Number.isFinite(setbacks.cornerSide.distance.value) &&
    setbacks.cornerSide.distance.value !== setbacks.side.distance.value
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
 * KNOWN FIDELITY LIMIT, reported to the planner: `atomDids` is a bare string
 * list, so the pairing between a code-section atom and its section NUMBER is
 * not carried. The first DID on a fact fills that fact's named role; any
 * further DIDs become code-section chips whose label falls back to the axis's
 * governing rule when there is exactly one, and to a generic label otherwise.
 * A chip still resolves its atom through `fetchAtomByDid`; only the label
 * degrades. Nothing is invented.
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

  const extras = setbackDids.slice(1);
  const governing = isPresent(sheet.setbacks)
    ? [
        sheet.setbacks.value.front.governedBy,
        sheet.setbacks.value.side.governedBy,
        sheet.setbacks.value.rear.governedBy,
      ].filter((g): g is string => typeof g === "string" && g.trim().length > 0)
    : [];

  const refs: EnvelopeProvenanceRefs = {};
  if (zoningDids[0]) refs.zoning = { atomDid: zoningDids[0] };
  if (setbackDids[0]) refs.setback = { atomDid: setbackDids[0] };
  if (envelopeDids[0]) refs.envelope = { atomDid: envelopeDids[0] };
  if (extras.length) {
    refs.codeSections = extras.map((did) => ({
      atomDid: did,
      sectionNumber:
        extras.length === 1 && governing.length === 1 ? governing[0] : "code",
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
export function bakedCardModelFromSheet(sheet: ParcelFactSheet): BakedCardModel {
  const env = sheet.envelope;

  const buildablePct: CardFacet<string> =
    env.kind === "derived"
      ? Number.isFinite(env.areaPctOfLot)
        ? present(`${Math.round(env.areaPctOfLot)}%`)
        : present(formatMeasurement(env.area, "us"))
      : env.kind === "consumed"
        ? present("0%")
        : sheet.setbacks.state === "unresolved"
          ? pending("pending")
          : absent();

  const lotAcres = sheet.geometry.lotArea.value / 43560;

  return {
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
    acreage: Number.isFinite(lotAcres)
      ? present(`${Math.round(lotAcres * 10000) / 10000} ac`)
      : absent(),
    setbacks: facetFrom(sheet.setbacks, setbackDisplayFromSheet),
    buildablePct,
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
  };
}

/** The envelope state the card's live-path renderers read. */
export function envelopeStateFromSheet(sheet: ParcelFactSheet): CardEnvelopeState {
  const env = sheet.envelope;
  const setbacks = isPresent(sheet.setbacks) ? sheet.setbacks.value : null;
  const axisFt = (a: SetbackAxis | null | undefined): number | null =>
    a && Number.isFinite(a.distance.value) ? a.distance.value : null;

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
        parcelAreaSqFt: sheet.geometry.lotArea.value,
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
