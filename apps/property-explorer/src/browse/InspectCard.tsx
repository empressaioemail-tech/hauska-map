// apps/property-explorer/src/browse/InspectCard.tsx
//
// INSPECT-IN-PLACE card. Drawn on the map when the user clicks a parcel.
//
// SOURCE PREFERENCE (instant, zero-AI, zero-live-compute):
//   1. PREFERRED — the BAKED node facets. Keyed on the clicked parcel's stable
//      `parcelNodeId`, read from `place_layer_snapshots` via the same-origin
//      spine proxy (anonymous). Base facts + land-use + zoning + setbacks /
//      buildable envelope render INSTANTLY as a pure read. No brief, no model,
//      no live adapter fetch on this path.
//   2. FALLBACK — the live buildable-envelope client. Used ONLY when a node has
//      NO baked snapshot (the endpoint 404s), so an un-baked parcel still shows
//      zoning/setbacks by resolving them live.
//
// HONESTY (commitment #1 / service-elevation thesis): a facet that is
// legitimately absent (Comal land-use, a gate-blocked county, a declined
// envelope, un-stamped zoning) renders as an EXPLICIT designed state, never a
// blank cell and never a fabricated value. Any present envelope is Tier-1
// (shape-only, no roads), so the card always carries the "approximate — not
// survey grade" treatment when envelope facets are shown.
//
// CONSUMER VOICE (lane SS-W2, 2026-08-18). Two operator QA findings drove the
// current shape of this file, and both were about PRESENTATION rather than
// data:
//
//   1. The card shipped internal engineering vocabulary to customers — a
//      hardcoded work-item note ("WDLL 31 hold"), a dev mount probe, the
//      "gate-passed" gate vocabulary, and raw pipeline source keys welded into
//      the middle of values. Provenance is now DEMOTED into a disclosure, per
//      contract invariant I3: selling reasoning rather than data means the
//      citation IS the product, it just does not belong shouting on the card
//      face. Demoted, never deleted.
//
//   2. "the data box on the left of the screen looks like its displaying error
//      messages." That card was CORRECT. Three grey italic "not verified here"
//      rows were the system honestly refusing to invent facts outside stamped
//      coverage, styled identically to a failure. Per contract invariant I4 a
//      failure is not an absence: absent-covered, absent-uncovered and
//      unresolved now render in three distinct registers (quiet / hatched /
//      alarm), and an uncovered absence names what would fill it.
//
// Bake owner is NEVER shown: the baked payload carries none (the bake never
// wrote it, the endpoint strips it). The inspect Owner row reads cortex-root
// ownerFact only (P-54 / WDLL 7). Anonymous / identified-session-required
// has no owner body. CAD-roll / GIS owner is not the atom.

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { ParcelCardData } from "./liveGis";
import { inspectCardShellStyle } from "./mobile-layout";
import { useMobilePanel } from "./MobilePanelContext";
import {
  type EnvelopeProvenanceRefs,
  type SetbackFieldProvenance,
  type SetbackFieldNotes,
} from "../lib/buildable-envelope.js";
import {
  type BakedCardModel,
  type CardFacet,
} from "../lib/baked-facets";
import type { LayerAbsenceProvenance } from "../lib/layer-absence";
import { factSheetResolver, FactSheetResolveError, isUsableSitusAddress } from "../lib/fact-sheet-resolver";
import { usePropertyEntitlement } from "../lib/usePropertyEntitlement";
import { gateOwnerPresentation } from "../lib/owner-paint";
import {
  loadWhoServesPresentation,
  whoServesQueryPointFromCentroid,
  type WhoServesCardPresentation,
} from "../lib/pe-who-serves-client";
import {
  bakedCardModelFromSheet,
  envelopeStateFromSheet,
  type ParcelFactSheetWithVerdictLayers,
} from "../lib/sheet-to-card-model";
import { Button } from "../components/Button";
import { BriefTool } from "../workbench/tools/BriefTool";
import {
  getSavedProperty,
  removeSavedProperty,
  subscribeSavedPropertiesChanged,
} from "../lib/savedPropertiesClient";
import {
  AtomChip,
  AtomDetailPopover,
  ATOM_ACCENT_BORDER,
} from "../shared/atom-chip";

const CARD_BG = "var(--surface-card-translucent, rgba(13,17,23,0.94))";
const MUTED = "var(--surface-muted, #94A3B8)";
const TEXT = "var(--text-strong, #e6edf3)";
// I4 palette. Three absences, three registers — the whole point is that they
// do not look alike.
//   quiet   — we cover this area and this parcel simply carries no value.
//   hatched — this area is not stamped. Names what would fill it.
//   alarm   — the lookup FAILED. This is the only one that is an error.
const ABSENT = "var(--semantic-absence, #7C8BA0)";
const ABSENT_BG = "var(--semantic-absence-bg, rgba(124,139,160,0.12))";
const ABSENT_BORDER = "var(--semantic-absence-border, rgba(124,139,160,0.35))";
const ERROR = "var(--semantic-error, #EF4444)";

interface EnvelopeState {
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

export type InspectCardSource = "loading" | "baked" | "live";

type Source = InspectCardSource;

/**
 * Resolve outcome → card fetch state. Unplaceable is not a load failure:
 * it used to set env.status === "error" and paint facets-load-error.
 */
export type InspectResolveOutcome =
  | { kind: "sheet"; sheet: ParcelFactSheetWithVerdictLayers }
  | { kind: "unplaceable"; reason: string }
  | { kind: "failed"; message: string }
  | { kind: "no-id" };

export function inspectCardStateFromResolve(outcome: InspectResolveOutcome): {
  source: Source;
  baked: BakedCardModel | null;
  env: EnvelopeState;
  queryPoint: { lat: number; lng: number } | null;
} {
  if (outcome.kind === "no-id") {
    return {
      source: "live",
      baked: null,
      env: {
        status: "error",
        reason: "This selection carries no parcel id, so its record cannot be read.",
      },
      queryPoint: null,
    };
  }
  if (outcome.kind === "unplaceable") {
    return {
      source: "live",
      baked: null,
      env: { status: "idle", reason: outcome.reason },
      queryPoint: null,
    };
  }
  if (outcome.kind === "failed") {
    return {
      source: "live",
      baked: null,
      env: { status: "error", reason: outcome.message },
      queryPoint: null,
    };
  }
  return {
    source: "baked",
    baked: bakedCardModelFromSheet(outcome.sheet),
    env: envelopeStateFromSheet(outcome.sheet),
    queryPoint: whoServesQueryPointFromCentroid(outcome.sheet.geometry.centroid),
  };
}

/** Map who-serves BFF state onto the inspect card row vocabulary. */
export function whoServesFactPresentation(
  presentation: WhoServesCardPresentation | null,
): FactPresentation | null {
  if (!presentation) return null;
  if (presentation.state === "loading") {
    return { state: "pending", label: "Loading who serves…" };
  }
  if (presentation.state === "error") {
    return {
      state: "pending",
      label: presentation.error ?? "who-serves read failed",
    };
  }
  if (presentation.state === "absent") {
    return {
      state: "absent-covered",
      reason: presentation.summary ?? "Who serves unmeasured",
      provenance: null,
    };
  }
  const summary = (presentation.summary ?? "").trim();
  const residual = (presentation.residual ?? "").trim();
  const value =
    summary && residual ? `${summary} — ${residual}` : summary || residual;
  if (!value) return null;
  return { state: "present", value, provenance: null };
}

/** The red box is a failed hop only. Unplaceable / declined must not trip it. */
export function showsFacetsLoadError(
  source: Source,
  env: Pick<EnvelopeState, "status">,
): boolean {
  return source === "live" && env.status === "error";
}

export const INSPECT_RESOLVE_MAX_ATTEMPTS = 3;
export const INSPECT_RESOLVE_RETRY_BACKOFF_MS = [600, 1_200] as const;

function defaultInspectRetrySleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry transient facet/read failures before painting the red card.
 * fetchBakedNodeFacets already retries; this covers cold cortex + PE race
 * without treating a recoverable hop as permanent "not verified".
 */
export async function resolveSheetWithTransientRetry<T>(
  run: () => Promise<T>,
  opts?: {
    maxAttempts?: number;
    backoffMs?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? INSPECT_RESOLVE_MAX_ATTEMPTS;
  const backoff = opts?.backoffMs ?? INSPECT_RESOLVE_RETRY_BACKOFF_MS;
  const sleep = opts?.sleep ?? defaultInspectRetrySleep;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await run();
    } catch (err) {
      lastErr = err;
      const retryable =
        err instanceof FactSheetResolveError && err.retryable === true;
      if (!retryable || attempt >= maxAttempts - 1) throw err;
      await sleep(backoff[attempt] ?? 1_000);
    }
  }
  throw lastErr;
}

/* ------------------------------------------------------------------ */
/* The render-side fact contract (I3 + I4).                            */
/* ------------------------------------------------------------------ */

/**
 * The render mirror of `Fact<T>` in the FROZEN parcel fact sheet contract
 * (`_catalog/parcel_fact_sheet_contract/parcel-fact-sheet.ts`).
 *
 * The first four members are that contract's four states, one for one. Two
 * deliberate differences, both stated rather than smuggled:
 *
 *  - `value`/`reason` are already display strings here. This is the RENDER
 *    boundary; the typed `Fact<T>` lives on the sheet, which lane W1 is
 *    building. When `packages/parcel-fact-sheet` lands, this union is deleted
 *    and its import takes over — nothing else in this file changes, because
 *    the states are identical.
 *
 *  - `pending` is a FIFTH state that the contract does not have, and it is not
 *    an absence. `baked-facets.ts` models "upstream facts are live but a
 *    derived field is not computed yet" and warns in its own doc comment never
 *    to render that as "not verified" (the Gate C bounce bug). Folding it into
 *    any absence would re-buy a defect this codebase has already paid for.
 */
export type FactPresentation =
  | {
      state: "present";
      value: string;
      provenance: string | null;
      layerAbsence?: LayerAbsenceProvenance;
      silentEmpty?: boolean;
    }
  | {
      state: "absent-covered";
      reason: string;
      provenance: string | null;
      layerAbsence?: LayerAbsenceProvenance;
      silentEmpty?: boolean;
    }
  | {
      state: "absent-uncovered";
      reason: string;
      wouldBeFilledBy: string;
      layerAbsence?: LayerAbsenceProvenance;
      silentEmpty?: boolean;
    }
  | {
      state: "unresolved";
      reason: string;
      retryable: boolean;
      layerAbsence?: LayerAbsenceProvenance;
      silentEmpty?: boolean;
    }
  | {
      state: "pending";
      label: string;
      layerAbsence?: LayerAbsenceProvenance;
      silentEmpty?: boolean;
    };

/**
 * Per-row instructions for mapping today's `CardFacet` onto the four contract
 * states. Explicit and per row on purpose: the information needed to tell
 * absent-covered from absent-uncovered lives in `deriveBakedCardModel`'s
 * choice of absence LABEL, which is a convention rather than a type, so it is
 * read here deliberately instead of guessed generically.
 */
export interface FactRowSpec {
  /**
   * I4: "An honest absence that cannot say what would fill it is not honest,
   * it is just empty." Required — there is no default.
   */
  wouldBeFilledBy: string;
  /**
   * True when a LABELLED absence from the deriver means "this area is covered
   * and this parcel carries no value" (absent-covered), as opposed to "this
   * area is not stamped" (absent-uncovered).
   *
   * `deriveBakedCardModel` writes `absent("no land-use value on record here")`
   * only when `facetCoverage.landUse === true`, and bare `absent<string>()`
   * otherwise — so for land use and acreage the label IS the coverage signal.
   * Zoning's labels ("no zoning stamp here", "no zoning here") are the
   * opposite: they describe an UNSTAMPED area, so zoning leaves this false.
   */
  labelledAbsenceIsCovered?: boolean;
  /**
   * I3: unpack a provenance string that `baked-facets.ts` welded into the end
   * of the value. Deliberately narrow.
   *
   *  - "machine-key": split a trailing parenthetical that is a source key or a
   *    key list — "(cad-roll · data-export-01.14.2026)", "(shoelace-wgs84)".
   *    A parenthetical that is ordinary prose ("(rural)") is LEFT ALONE, so
   *    the failure mode is a missed demotion, never a mangled value.
   *  - "fips": split a trailing 5-digit county FIPS — "Bastrop County (48021)".
   *
   * Inert once a real `provenance` sibling exists, so this cannot double-split
   * after lane P-39 lands the typed split.
   */
  splitProvenance?: "machine-key" | "fips";
  /**
   * Whether an uncovered absence on this row belongs in the card's coverage
   * block. Only rows that are STAMPED do.
   *
   * `buildable` is derived from zoning and setbacks, so listing it would say
   * "buildable fills in from zoning setbacks for this parcel" beside the rows
   * that are already saying exactly that — circular, and it inflates a
   * one-cause gap into a three-item list. `apn` and `county` are identity, not
   * coverage: per the frozen contract a sheet that cannot name its county is
   * malformed rather than honestly absent. The rows still render their state;
   * they just do not claim to be a coverage gap.
   *
   * The resulting set — land use, zoning, setbacks — is the same three fields
   * the retired `bakedHasHonestAbsence` used. Same scope, different treatment.
   */
  inCoverageBlock?: boolean;
}

/** A trailing parenthetical that reads as a machine source key or key list. */
const MACHINE_KEY_PAREN =
  /^\s*\(([a-z0-9]+(?:[-_.][a-z0-9]+)+(?:\s*·\s*[a-z0-9]+(?:[-_.][a-z0-9]+)*)*)\)\s*$/i;
/** A trailing parenthetical that is a bare 5-digit county FIPS. */
const FIPS_PAREN = /^\s*\((\d{5})\)\s*$/;

/**
 * Split a welded "value (provenance)" string into its two halves (I3).
 * Exported as a test seam: this is the shim the frozen contract exists to
 * delete, so its exact boundaries need to be pinned rather than described.
 */
export function splitWeldedProvenance(
  display: string,
  mode: "machine-key" | "fips" | undefined,
): { value: string; provenance: string | null } {
  if (!mode) return { value: display, provenance: null };
  const open = display.lastIndexOf("(");
  if (open <= 0 || !display.trimEnd().endsWith(")")) {
    return { value: display, provenance: null };
  }
  const head = display.slice(0, open).trim();
  const tail = display.slice(open);
  if (!head) return { value: display, provenance: null };
  const m = mode === "fips" ? FIPS_PAREN.exec(tail) : MACHINE_KEY_PAREN.exec(tail);
  if (!m) return { value: display, provenance: null };
  return {
    value: head,
    provenance: mode === "fips" ? `FIPS ${m[1]}` : m[1],
  };
}

/**
 * Map today's `CardFacet` onto the contract's states. Exported test seam.
 *
 * This is a SHIM with a named deletion condition: lane P-39 is splitting
 * `Fact.value` from `Fact.provenance` in `baked-facets.ts`, at which point the
 * card takes `FactPresentation` (or the real `Fact<T>`) straight through and
 * this function goes away. It issues no lookup of its own — invariant I2
 * forbids re-deriving, and unpacking a string the deriver welded together is
 * not a second derivation.
 */
export function toFactPresentation(
  facet: CardFacet<string>,
  spec: FactRowSpec,
): FactPresentation | null {
  if (facet.state === "unknown") return null;
  if (facet.silentEmpty) {
    return {
      state: "absent-covered",
      reason: facet.value ?? "structural layer undeclared",
      provenance: null,
      silentEmpty: true,
    };
  }
  if (facet.layerAbsence) {
    return {
      state: "absent-covered",
      reason: facet.value ?? facet.layerAbsence.verdict,
      provenance: null,
      layerAbsence: facet.layerAbsence,
    };
  }
  if (facet.state === "pending") {
    return { state: "pending", label: facet.value ?? "Working…" };
  }
  if (facet.state === "present") {
    const { value, provenance } = splitWeldedProvenance(
      facet.value ?? "",
      spec.splitProvenance,
    );
    return { state: "present", value, provenance };
  }
  // absent. The deriver's label choice carries the covered/uncovered signal.
  const label = facet.value;
  if (label && spec.labelledAbsenceIsCovered) {
    return { state: "absent-covered", reason: label, provenance: null };
  }
  return {
    state: "absent-uncovered",
    reason: label ?? "Not stamped here",
    wouldBeFilledBy: spec.wouldBeFilledBy,
  };
}

/**
 * The per-row specs. Every uncovered absence names what would fill it, in
 * customer language rather than pipeline language — that naming is what makes
 * an absence honest rather than merely empty (I4).
 */
export const ROW_SPECS: Record<string, FactRowSpec> = {
  apn: {
    wouldBeFilledBy: "a parcel number on the county appraisal roll",
  },
  landUse: {
    wouldBeFilledBy: "a land-use code on the county appraisal roll",
    labelledAbsenceIsCovered: true,
    splitProvenance: "machine-key",
    inCoverageBlock: true,
  },
  county: {
    wouldBeFilledBy: "a county record for this parcel",
    splitProvenance: "fips",
  },
  acreage: {
    wouldBeFilledBy: "a recorded lot size on the county appraisal roll",
    labelledAbsenceIsCovered: true,
    splitProvenance: "machine-key",
  },
  livingArea: {
    wouldBeFilledBy: "a structural living area on the county record",
    labelledAbsenceIsCovered: true,
  },
  zoning: {
    wouldBeFilledBy: "a zoning district stamp from this parcel's city or county",
    inCoverageBlock: true,
  },
  setbacks: {
    wouldBeFilledBy: "a published setback table for this parcel's zoning district",
    inCoverageBlock: true,
  },
  buildable: {
    // Derived, never stamped — see FactRowSpec.inCoverageBlock.
    wouldBeFilledBy: "zoning setbacks for this parcel",
  },
  flood: {
    wouldBeFilledBy: "a flood-hazard-fact atom on this parcel",
    labelledAbsenceIsCovered: true,
  },
  specialDistrict: {
    wouldBeFilledBy: "a special-district-fact atom on this parcel",
    labelledAbsenceIsCovered: true,
  },
  pipeline: {
    wouldBeFilledBy: "an rrc-pipeline-fact atom on this parcel",
    labelledAbsenceIsCovered: true,
  },
  well: {
    wouldBeFilledBy: "a well-fact atom on this parcel",
    labelledAbsenceIsCovered: true,
  },
  footprint: {
    wouldBeFilledBy: "a building-footprint atom on this parcel",
    labelledAbsenceIsCovered: true,
  },
  boundary: {
    wouldBeFilledBy: "a property-boundary-edge atom on this parcel",
    labelledAbsenceIsCovered: true,
  },
  owner: {
    wouldBeFilledBy: "an owner-fact atom on this parcel for a Studio or Team session",
    labelledAbsenceIsCovered: true,
  },
  cityLimits: {
    wouldBeFilledBy: "a city-limits determination from the Texas city boundary layer",
    labelledAbsenceIsCovered: true,
  },
  whoServes: {
    wouldBeFilledBy: "utility territory staging loaded for this coordinate",
    labelledAbsenceIsCovered: true,
  },
};

/** One provenance chip: a labeled atom reference tappable to open detail. */
interface ProvenanceChip {
  did: string;
  label: string;
}

interface LayerProvenanceChip {
  id: string;
  label: string;
  detail: string;
}

/** Doc 19 layer-absence provenance chips (authority / scope / asOf / basis). */
export function chipsForLayerAbsence(
  prov: LayerAbsenceProvenance | null | undefined,
): LayerProvenanceChip[] {
  if (!prov) return [];
  return [
    { id: "authority", label: "authority", detail: prov.authority },
    { id: "scope", label: "scope", detail: prov.scopeSearched },
    { id: "asOf", label: "asOf", detail: prov.asOf },
    { id: "basis", label: "basis", detail: prov.basis },
  ];
}

/**
 * Provenance chips for one row, derived from the unified provenanceRefs
 * block (whichever source served it). Absent ref / absent block → empty
 * array → the row renders exactly as it does today (graceful absence).
 *
 * Exported (test seam, chat-tool.test.tsx precedent): renderToStaticMarkup
 * doesn't run effects, so a fixture-driven render of the full InspectCard
 * can't reach source==="baked"/"live" — this + FacetRow/Row let the
 * provenance-chip contract be pinned directly, the same way ChatTool.tsx's
 * presentational pieces are tested.
 */
export function chipsForRow(
  refs: EnvelopeProvenanceRefs | null | undefined,
  row: "zoning" | "setback" | "buildable",
): ProvenanceChip[] {
  if (!refs) return [];
  const chips: ProvenanceChip[] = [];
  if (row === "zoning" && refs.zoning?.atomDid) {
    chips.push({ did: refs.zoning.atomDid, label: "zoning" });
  }
  if (row === "setback" && refs.setback?.atomDid) {
    chips.push({ did: refs.setback.atomDid, label: "setback" });
  }
  if (row === "buildable" && refs.envelope?.atomDid) {
    chips.push({ did: refs.envelope.atomDid, label: "envelope" });
  }
  // Code-section refs apply to every row they support citing — the setback
  // and buildable rows both draw from setback-rule + code sections, so
  // surface code-section chips alongside setback and buildable (never
  // zoning, which is a district lookup with no code-section citation here).
  if ((row === "setback" || row === "buildable") && refs.codeSections?.length) {
    for (const cs of refs.codeSections) {
      if (!cs?.atomDid || !cs.sectionNumber) continue;
      chips.push({ did: cs.atomDid, label: cs.sectionNumber });
    }
  }
  return chips;
}

/** Find the tapped chip's label across all rows, for the popover title. */
function findOpenChip(
  refs: EnvelopeProvenanceRefs | null,
  did: string,
): ProvenanceChip | null {
  const all = [
    ...chipsForRow(refs, "zoning"),
    ...chipsForRow(refs, "setback"),
    ...chipsForRow(refs, "buildable"),
  ];
  const seen = new Map<string, ProvenanceChip>();
  for (const c of all) if (!seen.has(c.did)) seen.set(c.did, c);
  return seen.get(did) ?? null;
}

/** Failed hop only. Unplaceable / declined must not mount this. */
export function FacetsLoadErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-testid="facets-load-error"
      data-state="unresolved"
      style={{
        marginTop: 8,
        padding: "6px 8px",
        borderRadius: 6,
        background: "rgba(239,68,68,0.10)",
        border: `0.5px solid ${ERROR}`,
        fontSize: 10.5,
        lineHeight: 1.45,
        color: TEXT,
      }}
    >
      <span style={{ color: ERROR, fontWeight: 700 }}>Could not load </span>
      this parcel&apos;s details. This is a loading problem, not a gap in
      what we know about the parcel.
      <button
        type="button"
        data-testid="facets-retry"
        onClick={onRetry}
        style={{
          display: "block",
          marginTop: 4,
          background: "transparent",
          border: "none",
          color: ERROR,
          cursor: "pointer",
          fontSize: 10.5,
          fontWeight: 600,
          padding: 0,
          textDecoration: "underline",
        }}
      >
        Try again
      </button>
    </div>
  );
}

export function InspectCard({
  card,
  parcelNodeId = null,
  isSubject = false,
  isSaved,
  onClose,
  onEnvelope,
  onMakeSubject,
  onResearch,
  researchOpen = false,
  embedded = false,
  onSaveProperty,
  onUnsaveProperty,
}: {
  card: ParcelCardData;
  // The clicked parcel's stable baked-node id ("{fips}:{propId}"), the read key
  // for the baked facet snapshot. Null for a live-GIS-only selection with no
  // baked id — the card then goes straight to the live-envelope fallback.
  parcelNodeId?: string | null;
  // True when this inspected parcel is ALSO the current subject.
  isSubject?: boolean;
  /**
   * True when this parcel is already in the user's saved properties, mirroring
   * `isSubject` above. OMIT IT and the card resolves saved state itself from
   * the one saved-properties flow; pass it and the prop wins.
   *
   * The self-resolving default exists because the button used to re-offer Save
   * on an already-saved property with no way to unsave, and the component that
   * would supply this prop (`ExplorerMap.tsx`) belongs to another lane. Passing
   * the prop from there later is strictly better and costs this card nothing.
   */
  isSaved?: boolean;
  onClose: () => void;
  // Fires when the envelope resolves so the parent can fold setbacks/envelope
  // into the ported node store (the subject/inspected source of truth). The
  // second argument names the parcel node id the result belongs to, so the
  // parent can refuse click-time geometry stashed for a DIFFERENT parcel.
  onEnvelope?: (result: unknown, forParcelNodeId?: string | null) => void;
  // The DISTINCT, explicit make-subject action. Re-points the LIVE map to this
  // parcel via the persistent-map API (rebindProperty + resolveSubjectAndFit) —
  // no remount. Separate from inspect (which is passive/in-place) and from the
  // stubbed ask/report path.
  onMakeSubject: () => void;
  onResearch: () => void;
  /** When true, the cited brief mounts in this card (mobile research sheet). */
  researchOpen?: boolean;
  /** Desktop: card lives inside the brief dock. */
  embedded?: boolean;
  onSaveProperty?: () => void;
  /** Remove this parcel from saved properties. Omit and the card removes it
   *  through the same one saved-properties flow the Save button writes to. */
  onUnsaveProperty?: () => void;
}) {
  const { isMobile } = useMobilePanel();
  const entitlement = usePropertyEntitlement(parcelNodeId);
  // Baked-first source state. `source` is "loading" until we know whether a
  // baked snapshot exists; then "baked" (pure read) or "live" (fallback).
  const [source, setSource] = useState<Source>("loading");
  const [baked, setBaked] = useState<BakedCardModel | null>(null);
  const [env, setEnv] = useState<EnvelopeState>({ status: "idle" });
  // One provenance-chip popover open at a time (did of the open chip, else
  // null) — chip tap toggles; re-tapping the open chip closes it.
  const [openChipDid, setOpenChipDid] = useState<string | null>(null);
  const toggleChip = (did: string) =>
    setOpenChipDid((cur) => (cur === did ? null : did));
  const [openLayerChipId, setOpenLayerChipId] = useState<string | null>(null);
  const toggleLayerChip = (id: string) =>
    setOpenLayerChipId((cur) => (cur === id ? null : id));
  // X-ray rule-details disclosure (ratification directive 2): collapsed by
  // default, independent of the provenance-chip popover state above.
  const [xrayOpen, setXrayOpen] = useState(false);
  // I3 disclosure: sourcing is demoted here rather than shouted on the card
  // face. Collapsed by default, same idiom as the X-ray toggle.
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [whoServes, setWhoServes] = useState<WhoServesCardPresentation | null>(
    null,
  );
  const [queryPoint, setQueryPoint] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  // A failed read is retryable IN PLACE. The card used to tell the user to
  // "reselect the parcel", which is an internal workaround dressed as copy.
  const [retryNonce, setRetryNonce] = useState(0);
  // Saved state + the honest outcome of a save/remove that did not land.
  const [resolvedSaved, setResolvedSaved] = useState<boolean | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // DATA SOURCE (P-39, invariant I2): the card RENDERS the one sealed fact
  // sheet and issues no lookup of its own.
  //
  // It used to run two fetches here — fetchBakedNodeFacets, then
  // fetchBuildableEnvelope as a fallback — which made it one of the five paths
  // that answered the same parcel questions separately. That is how one X-ray
  // PDF printed "Zone AO" on sheet 1 and "Flood zone AE" on sheet 4.
  //
  // Nothing about the RENDERING changed: the projection fills the same
  // BakedCardModel and envelope-state shapes the fetches used to fill, so every
  // row, disclosure, chip and absence treatment below is untouched.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!parcelNodeId) {
        const state = inspectCardStateFromResolve({ kind: "no-id" });
        setSource(state.source);
        setBaked(state.baked);
        setEnv(state.env);
        setQueryPoint(state.queryPoint);
        setWhoServes(null);
        return;
      }
      setSource("loading");
      setBaked(null);
      setEnv({ status: "idle" });
      setWhoServes(null);
      setQueryPoint(null);
      try {
        const result = await resolveSheetWithTransientRetry(() =>
          factSheetResolver.resolve(parcelNodeId),
        );
        if (cancelled) return;
        if (result.kind === "unplaceable") {
          const state = inspectCardStateFromResolve({
            kind: "unplaceable",
            reason: result.reason,
          });
          setSource(state.source);
          setBaked(state.baked);
          setEnv(state.env);
          setQueryPoint(state.queryPoint);
          setWhoServes(null);
          return;
        }
        const { kind: _kind, ...sheet } = result;
        const state = inspectCardStateFromResolve({ kind: "sheet", sheet });
        setBaked(state.baked);
        setEnv(state.env);
        setSource(state.source);
        setQueryPoint(state.queryPoint);
        // The parent folds setbacks/envelope into the ported node store from
        // the SAME sheet, so the store and the card can never disagree. The
        // parcel node id travels with the result (identity guard upstream).
        onEnvelope?.(state.env, parcelNodeId);
      } catch (err) {
        if (cancelled) return;
        const state = inspectCardStateFromResolve({
          kind: "failed",
          message:
            err instanceof Error ? err.message : "Could not load parcel facts.",
        });
        setSource(state.source);
        setBaked(state.baked);
        setEnv(state.env);
        setQueryPoint(state.queryPoint);
        setWhoServes(null);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelNodeId, retryNonce]);

  useEffect(() => {
    if (!queryPoint) {
      setWhoServes(null);
      return;
    }
    let cancelled = false;
    setWhoServes({ state: "loading", summary: null, residual: null, error: null });
    void loadWhoServesPresentation(queryPoint.lat, queryPoint.lng).then((result) => {
      if (!cancelled) setWhoServes(result);
    });
    return () => {
      cancelled = true;
    };
  }, [queryPoint?.lat, queryPoint?.lng, parcelNodeId]);

  // SAVED STATE. Skipped entirely when the parent passes `isSaved` (the prop
  // wins) or when the card shows no save affordance at all. Reads the ONE
  // saved-properties flow and re-reads on any mutation from any entry point,
  // so saving from the workbench flips this button too. An anonymous session
  // resolves quietly to "not saved" — a 401 here is not an error state.
  const savedSelfResolves = isSaved === undefined && !!onSaveProperty && !!parcelNodeId;
  useEffect(() => {
    if (!savedSelfResolves || !parcelNodeId) {
      setResolvedSaved(null);
      return;
    }
    let cancelled = false;
    const read = () => {
      void getSavedProperty(parcelNodeId).then((outcome) => {
        if (!cancelled) setResolvedSaved(outcome.kind === "found");
      });
    };
    read();
    const unsubscribe = subscribeSavedPropertiesChanged(read);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [savedSelfResolves, parcelNodeId]);

  const saved = isSaved ?? resolvedSaved ?? false;

  const handleSaveToggle = useCallback(() => {
    setSaveNotice(null);
    if (!saved) {
      onSaveProperty?.();
      return;
    }
    if (onUnsaveProperty) {
      onUnsaveProperty();
      return;
    }
    if (!parcelNodeId) return;
    // Optimistic, then corrected by the outcome — never a silent no-op.
    setResolvedSaved(false);
    void removeSavedProperty(parcelNodeId).then((outcome) => {
      if (outcome.kind === "ok") return;
      setResolvedSaved(true);
      setSaveNotice(
        outcome.kind === "sign-in"
          ? "Sign in to change your saved properties."
          : outcome.kind === "unreachable"
            ? "Could not reach saved properties. Try again in a moment."
            : outcome.message,
      );
    });
  }, [saved, onSaveProperty, onUnsaveProperty, parcelNodeId]);

  // ---- Render fields, unified across baked and live sources. ----
  const heading = resolveCardHeading(
    baked?.situsAddress.state === "present"
      ? baked.situsAddress.value
      : card.situsAddress,
    baked?.apn.state === "present" ? baked.apn.value : card.apn,
  );

  // Unified provenance refs: whichever source served this card carries them
  // (or doesn't — both branches degrade to zero chips identically). Live
  // fallback backend PR and baked bake are independent; the card doesn't
  // care which one populated it.
  const provenanceRefs: EnvelopeProvenanceRefs | null =
    source === "baked"
      ? (baked?.provenanceRefs ?? null)
      : source === "live"
        ? (env.provenanceRefs ?? null)
        : null;
  const openChip = openChipDid
    ? findOpenChip(provenanceRefs, openChipDid)
    : null;

  // Unified setback field-notes, same baked/live pattern as provenanceRefs
  // above — whichever source served the card carries them, or doesn't (both
  // branches degrade to "no X-ray detail" identically).
  const setbackFieldNotes: SetbackFieldNotes | null =
    source === "baked"
      ? (baked?.setbackFieldNotes ?? null)
      : source === "live"
        ? (env.setbacks?.fieldNotes ?? null)
        : null;
  const hasSetbackXrayDetail =
    !!setbackFieldNotes &&
    Object.values(setbackFieldNotes).some((n) => typeof n === "string" && n.trim());

  // ONE mapping pass, consumed by the rows, the coverage footer and the
  // sources disclosure alike — so the card cannot say one thing in a row and
  // a different thing three lines below it.
  const factRows: Array<{
    key: string;
    label: string;
    fact: FactPresentation | null;
    testid?: string;
    chipRow?: "zoning" | "setback" | "buildable";
    layerVerdict?: boolean;
  }> = baked
    ? [
        { key: "apn", label: "APN", fact: toFactPresentation(baked.apn, ROW_SPECS.apn), testid: "inspect-apn" },
        { key: "landUse", label: "Land use", fact: toFactPresentation(baked.landUse, ROW_SPECS.landUse), testid: "inspect-landuse" },
        { key: "county", label: "County", fact: toFactPresentation(baked.county, ROW_SPECS.county) },
        { key: "acreage", label: "Acreage", fact: toFactPresentation(baked.acreage, ROW_SPECS.acreage) },
        {
          key: "livingArea",
          label: "Living area",
          fact: toFactPresentation(baked.livingArea, ROW_SPECS.livingArea),
          testid: "inspect-living-area",
          layerVerdict: true,
        },
        { key: "zoning", label: "Zoning", fact: toFactPresentation(baked.zoning, ROW_SPECS.zoning), testid: "inspect-zoning", chipRow: "zoning", layerVerdict: true },
        { key: "setbacks", label: "Setbacks", fact: toFactPresentation(baked.setbacks, ROW_SPECS.setbacks), testid: "inspect-setbacks", chipRow: "setback" },
        { key: "buildable", label: "Buildable", fact: toFactPresentation(baked.buildablePct, ROW_SPECS.buildable), chipRow: "buildable" },
        { key: "flood", label: "Flood", fact: toFactPresentation(baked.flood, ROW_SPECS.flood), testid: "inspect-flood" },
        { key: "specialDistrict", label: "Special district", fact: toFactPresentation(baked.specialDistrict, ROW_SPECS.specialDistrict), testid: "inspect-special-district" },
        { key: "pipeline", label: "Pipeline", fact: toFactPresentation(baked.pipeline, ROW_SPECS.pipeline), testid: "inspect-pipeline" },
        { key: "well", label: "Well", fact: toFactPresentation(baked.well, ROW_SPECS.well), testid: "inspect-well" },
        { key: "footprint", label: "Footprint", fact: toFactPresentation(baked.footprint, ROW_SPECS.footprint), testid: "inspect-footprint" },
        { key: "boundary", label: "Boundary", fact: toFactPresentation(baked.boundary, ROW_SPECS.boundary), testid: "inspect-boundary" },
        {
          key: "owner",
          label: "Owner",
          fact: gateOwnerPresentation(
            toFactPresentation(baked.owner, ROW_SPECS.owner),
            entitlement.status === "ready" ? entitlement.subscriptionTier : null,
          ),
          testid: "inspect-owner",
        },
        {
          key: "cityLimits",
          label: "City limits",
          fact: toFactPresentation(baked.cityLimits, ROW_SPECS.cityLimits),
          testid: "inspect-city-limits",
        },
        {
          key: "whoServes",
          label: "Who serves",
          fact: whoServesFactPresentation(whoServes),
          testid: "inspect-who-serves",
        },
      ]
    : [];

  // Only STAMPED rows make a coverage claim — see FactRowSpec.inCoverageBlock.
  const uncovered = factRows.filter(
    (r): r is typeof r & { fact: Extract<FactPresentation, { state: "absent-uncovered" }> } =>
      r.fact?.state === "absent-uncovered" && ROW_SPECS[r.key]?.inCoverageBlock === true,
  );
  const demotedProvenance = factRows.filter(
    (r): r is typeof r & { fact: Extract<FactPresentation, { state: "present" }> } =>
      r.fact?.state === "present" && !!r.fact.provenance,
  );

  return (
    <div
      data-testid="inspect-card"
      data-source={source}
      style={{
        ...inspectCardShellStyle(isMobile, embedded),
        background: CARD_BG,
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }} data-testid="inspect-title">
            {heading.title}
          </div>
          {/* A missing situs address is a DATA gap, not a broken card. The
              county roll carries a bare quote character for some unaddressed
              parcels, which used to render as the entire header. */}
          {!heading.isAddress && (
            <div
              data-testid="inspect-no-address"
              style={{ marginTop: 1, fontSize: 10, color: MUTED }}
            >
              No street address on the county record
            </div>
          )}
        </div>
        {!embedded && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: MUTED,
              cursor: "pointer",
              fontSize: 15,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>

      <dl
        style={{
          margin: "9px 0 0",
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "3px 10px",
        }}
      >
        {source === "baked" && baked ? (
          <>
            {factRows.map((r) => (
              <FactRow
                key={r.key}
                label={r.label}
                fact={r.fact}
                testid={r.testid}
                chips={r.chipRow ? chipsForRow(provenanceRefs, r.chipRow) : []}
                openChipDid={openChipDid}
                onChipToggle={r.chipRow ? toggleChip : undefined}
                layerOpenChipId={r.layerVerdict ? openLayerChipId : null}
                onLayerChipToggle={r.layerVerdict ? toggleLayerChip : undefined}
              />
            ))}
          </>
        ) : (
          <>
            <Row label="APN" value={card.apn} testid="inspect-apn" />
            <Row
              label="Land use"
              value={card.landUseDescription}
              testid="inspect-landuse"
            />
            <Row label="County" value={card.county} />
            {/* No acreage row on the LIVE fallback: ParcelCardData carries no
                acreage field and the live envelope compose returns no lot
                acreage — rendering one would require fabricating or newly
                fetching a value (honesty commitment #1). The baked branch
                above renders acreage from the baked base facts. */}
            <Row
              label="Zoning"
              value={env.district ?? (env.status === "loading" ? "…" : null)}
              testid="inspect-zoning"
              chips={chipsForRow(provenanceRefs, "zoning")}
              openChipDid={openChipDid}
              onChipToggle={toggleChip}
            />
            <Row
              label="Setbacks"
              value={liveSetbackLine(env) ?? (env.status === "loading" ? "…" : null)}
              testid="inspect-setbacks"
              chips={chipsForRow(provenanceRefs, "setback")}
              openChipDid={openChipDid}
              onChipToggle={toggleChip}
            />
            <Row
              label="Buildable"
              value={liveBuildablePct(env)}
              chips={chipsForRow(provenanceRefs, "buildable")}
              openChipDid={openChipDid}
              onChipToggle={toggleChip}
            />
          </>
        )}
      </dl>

      {/* Provenance chip detail — one popover open at a time, tap a chip to
          open, re-tap to close. Absent when no provenance ref is open (the
          overwhelming default — no provenanceRefs on the response). */}
      {openChip && (
        <AtomDetailPopover did={openChip.did} label={openChip.label} />
      )}

      {/* X-ray rule details (ratification directive 2, 2026-08-04): the
          modeled minimum setback scalar stays as-is above; the fuller rule
          text (one-vs-two-story side-yard splits, corner cases, formula
          rears) carried in the ratified table's per-field provenance notes
          renders here, collapsed by default. Absent whenever the served
          setback has no field notes — graceful, no empty affordance shown. */}
      {hasSetbackXrayDetail && (
        <SetbackXrayDetail
          notes={setbackFieldNotes}
          isOpen={xrayOpen}
          onToggle={() => setXrayOpen((v) => !v)}
        />
      )}

      {/* Honest coverage / disclosure states. */}
      {source === "loading" && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: MUTED }}>
          Reading this parcel…
        </div>
      )}

      {/* I4 — the coverage block. This is a DESIGNED state, not a failure, so
          it is bordered and captioned like a designed state and it NAMES what
          would fill each gap. It replaces a grey italic sentence that read as
          the third of three error messages. */}
      {source === "baked" && uncovered.length > 0 && (
        <div
          data-testid="honest-absence"
          style={{
            marginTop: 8,
            padding: "6px 8px",
            borderRadius: 6,
            background: ABSENT_BG,
            border: `0.5px dashed ${ABSENT_BORDER}`,
            fontSize: 10,
            lineHeight: 1.45,
          }}
        >
          <div style={{ color: TEXT, fontWeight: 600 }}>
            Not stamped in this area yet
          </div>
          <div style={{ color: ABSENT, marginTop: 2 }}>
            {coverageFooterLine(uncovered.map((r) => r.label))} Fills in from{" "}
            {joinList(
              [...new Set(uncovered.map((r) => r.fact.wouldBeFilledBy))],
            )}
            .
          </div>
        </div>
      )}

      {/* BAKED honest 0% — shared B3 kind declined-consume only (never when
          warm area is present; that maps to buildable-with-area). */}
      {source === "baked" &&
        baked &&
        baked.buildableDisplayKind === "declined-consume" && (
          <div
            data-testid="no-buildable-area"
            style={{ marginTop: 8, fontSize: 10.5, color: "var(--semantic-warning, #F59E0B)" }}
          >
            {baked.envelopeEmptyReason ||
              "No buildable area after setbacks — the setbacks consume the lot."}
          </div>
        )}

      {/* LIVE fallback coverage states (un-baked nodes only). */}
      {source === "live" && env.status === "loading" && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: MUTED }}>
          Reading zoning &amp; setbacks…
        </div>
      )}
      {source === "live" && env.status === "empty" && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: "var(--semantic-warning, #F59E0B)" }}>
          {env.reason || "No buildable area — setbacks consume the lot."}
        </div>
      )}
      {/* I4 — `unresolved`. The ONLY one of these states that is an error, and
          the only one styled as one. It gets a retry in place; the old copy
          told the user to reselect the parcel, which is a workaround dressed
          up as a message. */}
      {showsFacetsLoadError(source, env) && (
        <FacetsLoadErrorBanner onRetry={() => setRetryNonce((n) => n + 1)} />
      )}

      {/* Approximate / not-survey-grade treatment whenever an envelope shows. */}
      {((source === "baked" && baked?.envelopeApproximate) ||
        (source === "live" && (env.status === "ok" || env.status === "empty"))) && (
        <div style={{ marginTop: 8, fontSize: 10, color: MUTED }}>
          Approximate — not survey grade. Verify with the city.
        </div>
      )}

      {/* I3 — provenance is DEMOTED, never deleted. The card face carries the
          short verification line a customer can act on; every source key,
          vintage and derivation method sits one tap away in the disclosure.
          What used to sit here read "Verified · gate-passed · cad-roll ·
          2026-01-14", which is three pieces of pipeline vocabulary and one
          useful date. */}
      {source === "baked" && baked ? (
        <SourcesDisclosure
          isOpen={sourcesOpen}
          onToggle={() => setSourcesOpen((v) => !v)}
          asOf={baked.bakedAt ? baked.bakedAt.slice(0, 10) : null}
          entries={[
            ...demotedProvenance.map((r) => ({
              label: r.label,
              detail: r.fact.provenance as string,
            })),
            ...(baked.provenance.landUseSource
              ? [{ label: "Land-use source", detail: baked.provenance.landUseSource }]
              : []),
            ...(baked.provenance.parcelSource
              ? [{ label: "Parcel boundary", detail: baked.provenance.parcelSource }]
              : []),
            ...(baked.provenance.vintage
              ? [{ label: "Record vintage", detail: baked.provenance.vintage }]
              : []),
          ]}
        />
      ) : (
        card.provider && (
          <SourcesDisclosure
            isOpen={sourcesOpen}
            onToggle={() => setSourcesOpen((v) => !v)}
            asOf={card.retrievedAt ? card.retrievedAt.slice(0, 10) : null}
            entries={[{ label: "Parcel record", detail: card.provider }]}
          />
        )
      )}

      {/* W2: the run-a-report actions (site-plan + terrain export) moved OFF
          this card into the workbench "Reports & exports" bubble/dock — the
          card keeps its data rows + Research/Make subject/Save actions.

          SS-W2: the hardcoded ICC/WDLL-31 roadmap note that used to render
          here on EVERY parcel was deleted. It named one of our own work items
          and its blocker to customers. Internal delivery state does not belong
          on a consumer surface; it belongs in the plan of record. */}

      {/* DISTINCT explicit action: make this inspected parcel the SUBJECT.
          Active = primary (blue fill); once it IS the subject the control goes
          inert (secondary, disabled). */}
      <Button
        variant={isSubject ? "secondary" : "primary"}
        fullWidth
        type="button"
        data-testid="make-subject"
        onClick={onMakeSubject}
        disabled={isSubject}
        aria-pressed={isSubject}
        style={{ marginTop: 11 }}
      >
        {isSubject ? "Subject property" : "Make subject"}
      </Button>

      {/* Saved state mirrors the make-subject control eleven lines above: the
          control reads its own state and relabels. It does NOT go inert the
          way make-subject does, because the opposite of saving is unsaving and
          that belongs here rather than behind a trip to My Properties. */}
      {onSaveProperty && (
        <Button
          variant={saved ? "ghost" : "secondary"}
          fullWidth
          type="button"
          data-testid="save-property"
          data-saved={saved ? "true" : undefined}
          aria-pressed={saved}
          onClick={handleSaveToggle}
          style={{ marginTop: 8 }}
        >
          {saved ? "Saved · Remove" : "Save property"}
        </Button>
      )}

      {saveNotice && (
        <div
          data-testid="save-property-notice"
          style={{ marginTop: 4, fontSize: 10, color: MUTED, lineHeight: 1.45 }}
        >
          {saveNotice}
        </div>
      )}

      {!embedded && (
        <Button
          variant="ghost"
          fullWidth
          type="button"
          data-testid="research-this"
          onClick={onResearch}
          aria-expanded={researchOpen}
          style={{ marginTop: 8 }}
        >
          {researchOpen ? "Hide brief" : "Research this →"}
        </Button>
      )}

      {!embedded && researchOpen ? (
        <div
          data-testid="inspect-brief"
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: "1px solid rgba(154,166,178,0.2)",
          }}
        >
          <BriefTool />
        </div>
      ) : null}

      {/* SS-W2: `SmartFilesMountStub` was removed from here and deleted. It was
          a development isolation probe that printed a raw folder id and the
          sentence "Isolation probe, not this parcel's room. Save/share stay the
          get-by." to every customer on every parcel. The BFF route it exercised
          (`/api/pe-smart-files-mount`) is untouched, so the probe is still
          reachable without shipping it. */}
    </div>
  );
}

/** Oxford-free list join: "a", "a and b", "a, b and c". */
export function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

/** The coverage block's lead sentence — names the fields, in card labels. */
export function coverageFooterLine(labels: string[]): string {
  if (labels.length === 0) return "";
  return `We have not stamped ${joinList(labels.map((l) => l.toLowerCase()))} for this area.`;
}

/**
 * The card heading, and whether it is a real address (item 7).
 *
 * Some county rolls carry a lone quote character where an unaddressed parcel's
 * situs should be, and `selectionToCard` passes any non-blank string straight
 * through, so the header rendered a bare `"` as the entire title. A heading
 * candidate with no letter or digit in it is not an address; fall through to
 * the parcel number, then to a designed last resort. Exported test seam.
 */
export function resolveCardHeading(
  situs: string | null | undefined,
  apn: string | null | undefined,
): { title: string; isAddress: boolean } {
  const candidate = typeof situs === "string" ? situs.trim() : "";
  if (isUsableSitusAddress(candidate)) {
    return { title: candidate, isAddress: true };
  }
  const parcel = typeof apn === "string" ? apn.trim() : "";
  if (parcel) return { title: `Parcel ${parcel}`, isAddress: false };
  return { title: "Selected parcel", isAddress: false };
}

/**
 * I3's disclosure affordance: sourcing demoted off the card face but one tap
 * away, reusing the SetbackXrayDetail idiom rather than inventing a second
 * disclosure pattern. Collapsed by default.
 *
 * Exported test seam — renderToStaticMarkup never runs effects, so `isOpen` is
 * driven directly as a prop, the same way SetbackXrayDetail is.
 */
export function SourcesDisclosure({
  isOpen,
  onToggle,
  asOf,
  entries,
}: {
  isOpen: boolean;
  onToggle: () => void;
  /** The record date a customer can actually use. Stays on the card face. */
  asOf: string | null;
  entries: Array<{ label: string; detail: string }>;
}) {
  const has = entries.length > 0;
  return (
    <div style={{ marginTop: 6 }} data-testid="inspect-provenance">
      <div style={{ fontSize: 10, color: MUTED }}>
        Checked against the county record
        {asOf ? ` · as of ${asOf}` : ""}
        {has && (
          <>
            {" · "}
            <button
              type="button"
              data-testid="inspect-sources-toggle"
              aria-expanded={isOpen}
              onClick={onToggle}
              style={{
                background: "transparent",
                border: "none",
                color: MUTED,
                cursor: "pointer",
                fontSize: 10,
                padding: 0,
                textDecoration: "underline",
              }}
            >
              {isOpen ? "Hide sources" : "Sources"}
            </button>
          </>
        )}
      </div>
      {isOpen && has && (
        <div
          data-testid="inspect-sources-detail"
          style={{
            marginTop: 4,
            padding: "5px 7px",
            borderRadius: 6,
            background: "rgba(154,166,178,0.10)",
            border: `1px solid ${ATOM_ACCENT_BORDER}`,
            fontSize: 10,
          }}
        >
          {entries.map((e) => (
            <p key={`${e.label}-${e.detail}`} style={{ margin: "2px 0 0", color: MUTED }}>
              <strong style={{ color: TEXT }}>{e.label}:</strong> {e.detail}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Governed-by fragment for the live-fallback line, same citation shape as
 * setback-not-specified.ts#formatGovernedByFragment but not importing that
 * (API-route-adjacent) module from this client path — a small structural
 * duplicate, same as GovernedByAxis's own note there. Returns null when the
 * axis carries no governed_by or the reference has no section_number (no
 * cite, no renderable answer — falls back to the bare "—" dash, honest).
 */
function liveGovernedByFragment(
  g: SetbackFieldProvenance["front"] | null | undefined,
): string | null {
  if (!g) return null;
  const entries = g.conditions?.length ? g.conditions : [g];
  const rendered = entries
    .map((c) => {
      if (!c.section_number) return null;
      const value = typeof c.value_ft === "number" ? `${c.value_ft} ft` : null;
      const routed = c.district ? `${c.district} governs` : null;
      const head = value ?? routed;
      if (!head) return null;
      const condition = c.condition ? ` ${c.condition}` : "";
      return `${head}${condition} (§${c.section_number})`;
    })
    .filter((s): s is string => Boolean(s));
  return rendered.length ? rendered.join("; ") : null;
}

/** Exported test seam — the live-fallback path is only reachable through the
 *  async effect, which renderToStaticMarkup can't drive; pin the pure
 *  formatter directly, same rationale as chipsForRow/FacetRow/Row above. */
export function liveSetbackLine(env: EnvelopeState): string | null {
  const s = env.setbacks;
  if (!s || (s.front_ft == null && s.side_ft == null && s.rear_ft == null)) {
    return null;
  }
  const sideInterior = s.side_interior_ft ?? s.side_ft;
  const sideCorner = s.side_corner_ft;
  const gb = s.governedBy;
  const frontGoverned = s.front_ft == null ? liveGovernedByFragment(gb?.front) : null;
  const sideGoverned = s.side_ft == null ? liveGovernedByFragment(gb?.side) : null;
  const rearGoverned = s.rear_ft == null ? liveGovernedByFragment(gb?.rear) : null;
  const sideLabel = sideGoverned
    ? `S ${sideGoverned}`
    : sideCorner != null &&
        sideInterior != null &&
        sideInterior !== sideCorner
      ? `S ${fmtFt(sideInterior)} · Corner ${fmtFt(sideCorner)}`
      : `S ${fmtFt(s.side_ft)}`;
  const frontLabel = frontGoverned ? `F ${frontGoverned}` : `F ${fmtFt(s.front_ft)}`;
  const rearLabel = rearGoverned ? `R ${rearGoverned}` : `R ${fmtFt(s.rear_ft)}`;
  return `${frontLabel} · ${sideLabel} · ${rearLabel}`;
}

function liveBuildablePct(env: EnvelopeState): string | null {
  return env.summary && typeof env.summary.buildableAreaPct === "number"
    ? `${Math.round(env.summary.buildableAreaPct as number)}%`
    : null;
}

const XRAY_FIELD_LABELS: Record<keyof SetbackFieldNotes, string> = {
  front: "Front",
  side: "Side",
  rear: "Rear",
  sideCorner: "Side (corner)",
};

/**
 * X-ray rule-details disclosure (ratification directive 2, 2026-08-04):
 * "minimums display as modeled; details spell out in the X-ray." The
 * modeled minimum setback scalar renders unchanged in the Setbacks row
 * above; this surfaces the fuller rule text (one-vs-two-story side-yard
 * splits, corner cases, formula rears) carried in the ratified table's
 * per-field provenance notes. Collapsed by default — a tap expands it,
 * same disclosure idiom as the provenance-chip popover (reuses
 * ATOM_ACCENT_BORDER, no new visual system). Renders only fields that
 * actually carry a note — graceful per-field absence, never a placeholder
 * row for a field with nothing to say.
 *
 * Exported — same test-seam precedent as chipsForRow/FacetRow/Row above:
 * renderToStaticMarkup never runs effects, so isOpen must be driven directly
 * as a prop to pin both the collapsed and expanded render.
 */
export function SetbackXrayDetail({
  notes,
  isOpen,
  onToggle,
}: {
  notes: SetbackFieldNotes | null;
  isOpen: boolean;
  onToggle: () => void;
}) {
  if (!notes) return null;
  const entries = (Object.keys(XRAY_FIELD_LABELS) as Array<keyof SetbackFieldNotes>)
    .map((key) => ({ key, label: XRAY_FIELD_LABELS[key], note: notes[key] }))
    .filter((e): e is { key: keyof SetbackFieldNotes; label: string; note: string } =>
      typeof e.note === "string" && e.note.trim().length > 0,
    );
  if (!entries.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        data-testid="setback-xray-toggle"
        aria-expanded={isOpen}
        onClick={onToggle}
        style={{
          background: "transparent",
          border: "none",
          color: MUTED,
          cursor: "pointer",
          fontSize: 10.5,
          padding: 0,
          textDecoration: "underline",
        }}
      >
        {isOpen ? "Hide setback rule details" : "Setback rule details"}
      </button>
      {isOpen && (
        <div
          data-testid="setback-xray-detail"
          style={{
            marginTop: 4,
            padding: "5px 7px",
            borderRadius: 6,
            background: "rgba(154,166,178,0.10)",
            border: `1px solid ${ATOM_ACCENT_BORDER}`,
            fontSize: 10,
          }}
        >
          {entries.map((e) => (
            <p key={e.key} style={{ margin: "2px 0 0", color: MUTED }}>
              <strong style={{ color: "#e6edf3" }}>{e.label}:</strong> {e.note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline provenance chips appended to a row's value — absent when the row
 *  carries no refs, so a row with no chips renders byte-identical to before
 *  this feature (graceful absence). */
function RowChips({
  chips,
  openChipDid,
  onChipToggle,
}: {
  chips: ProvenanceChip[];
  openChipDid: string | null;
  onChipToggle: (did: string) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 3,
        marginLeft: 6,
        verticalAlign: "middle",
      }}
    >
      {chips.map((c) => (
        <AtomChip
          key={c.did}
          label={c.label}
          isOpen={c.did === openChipDid}
          onClick={() => onChipToggle(c.did)}
          testId="inspect-provenance-chip"
        />
      ))}
    </span>
  );
}

function LayerAbsenceChips({
  chips,
  openChipId,
  onChipToggle,
}: {
  chips: LayerProvenanceChip[];
  openChipId: string | null;
  onChipToggle: (id: string) => void;
}) {
  if (chips.length === 0) return null;
  const open = chips.find((c) => c.id === openChipId) ?? null;
  return (
    <span style={{ display: "block", marginTop: 4 }}>
      <span
        style={{
          display: "inline-flex",
          flexWrap: "wrap",
          gap: 3,
          verticalAlign: "middle",
        }}
      >
        {chips.map((c) => (
          <AtomChip
            key={c.id}
            label={c.label}
            isOpen={c.id === openChipId}
            onClick={() => onChipToggle(c.id)}
            testId="layer-absence-chip"
          />
        ))}
      </span>
      {open && (
        <div
          data-testid="layer-absence-detail"
          style={{
            marginTop: 4,
            fontSize: 10,
            color: MUTED,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {open.detail}
        </div>
      )}
    </span>
  );
}

/**
 * THE ROW RENDERER (I4). One row, five states, five registers.
 *
 * Layer-absence verdict rows (P-63) stamp `data-verdict`, `data-silent-empty`,
 * basis text, and provenance chips when cortex serves doc 19 layer wires.
 *
 * Exported test seam — see the chipsForRow note above.
 */
export function FactRow({
  label,
  fact,
  testid,
  chips = [],
  openChipDid = null,
  onChipToggle,
  layerOpenChipId = null,
  onLayerChipToggle,
}: {
  label: string;
  fact: FactPresentation | null;
  testid?: string;
  chips?: ProvenanceChip[];
  openChipDid?: string | null;
  onChipToggle?: (did: string) => void;
  layerOpenChipId?: string | null;
  onLayerChipToggle?: (id: string) => void;
}) {
  if (!fact) return null;

  const layerProv = fact.layerAbsence;
  const silentEmpty = fact.silentEmpty === true;
  const absenceChips = chipsForLayerAbsence(layerProv);

  let text: string;
  let style: CSSProperties = { margin: 0 };
  switch (fact.state) {
    case "present":
      text = fact.value;
      break;
    case "pending":
      text = fact.label;
      style = { ...style, color: MUTED, opacity: 0.7 };
      break;
    case "absent-covered":
      text = fact.reason;
      style = { ...style, color: MUTED };
      break;
    case "absent-uncovered":
      text = fact.reason;
      style = {
        ...style,
        color: ABSENT,
        borderBottom: `1px dashed ${ABSENT_BORDER}`,
        display: "inline-block",
        lineHeight: 1.35,
      };
      break;
    case "unresolved":
      text = fact.reason;
      style = { ...style, color: ERROR, fontWeight: 600 };
      break;
  }

  const verdictStyle =
    layerProv?.verdict === "lookup-failed"
      ? { color: "var(--semantic-warning, #F59E0B)" }
      : layerProv?.verdict === "not-applicable"
        ? { color: "var(--semantic-not-applicable, #A78BFA)" }
        : undefined;

  if (layerProv || silentEmpty) {
    style = {
      ...style,
      fontStyle: fact.state === "present" ? undefined : "italic",
      ...verdictStyle,
    };
  }

  return (
    <>
      <dt style={{ color: MUTED }}>{label}</dt>
      <dd
        style={style}
        data-testid={testid}
        data-state={fact.state}
        data-absent={fact.state.startsWith("absent") ? "true" : undefined}
        data-pending={fact.state === "pending" ? "true" : undefined}
        data-verdict={layerProv?.verdict}
        data-silent-empty={silentEmpty ? "true" : undefined}
      >
        {text}
        {layerProv && (
          <div
            data-testid="layer-absence-basis"
            style={{ marginTop: 3, fontSize: 10, fontStyle: "normal" }}
          >
            {layerProv.basis}
          </div>
        )}
        {onLayerChipToggle && absenceChips.length > 0 && (
          <LayerAbsenceChips
            chips={absenceChips}
            openChipId={layerOpenChipId}
            onChipToggle={onLayerChipToggle}
          />
        )}
        {onChipToggle && (
          <RowChips
            chips={chips}
            openChipDid={openChipDid}
            onChipToggle={onChipToggle}
          />
        )}
      </dd>
    </>
  );
}

/**
 * Legacy adapter: a raw `CardFacet` row. Composes FactRow through the shim so
 * there is ONE row renderer rather than two implementations of one rule.
 * Callers that can name a row spec should build a FactPresentation and use
 * FactRow directly; this exists for rows whose coverage semantics are not yet
 * known. Exported — see the chipsForRow test-seam note above.
 */
export function FacetRow({
  label,
  facet,
  spec,
  testid,
  chips = [],
  openChipDid = null,
  onChipToggle,
  layerOpenChipId = null,
  onLayerChipToggle,
}: {
  label: string;
  facet: CardFacet<string>;
  spec?: FactRowSpec;
  testid?: string;
  chips?: ProvenanceChip[];
  openChipDid?: string | null;
  onChipToggle?: (did: string) => void;
  layerOpenChipId?: string | null;
  onLayerChipToggle?: (id: string) => void;
}) {
  const resolved =
    spec ?? { wouldBeFilledBy: "a verified record for this parcel" };
  return (
    <FactRow
      label={label}
      fact={toFactPresentation(facet, resolved)}
      testid={testid}
      chips={chips}
      openChipDid={openChipDid}
      onChipToggle={onChipToggle}
      layerOpenChipId={layerOpenChipId}
      onLayerChipToggle={onLayerChipToggle}
    />
  );
}

/** Exported — see chipsForRow test-seam note above. */
export function Row({
  label,
  value,
  testid,
  chips = [],
  openChipDid = null,
  onChipToggle,
}: {
  label: string;
  value: string | null | undefined;
  testid?: string;
  chips?: ProvenanceChip[];
  openChipDid?: string | null;
  onChipToggle?: (did: string) => void;
}) {
  if (!value) return null;
  return (
    <>
      <dt style={{ color: MUTED }}>{label}</dt>
      <dd style={{ margin: 0 }} data-testid={testid}>
        {value}
        {onChipToggle && (
          <RowChips
            chips={chips}
            openChipDid={openChipDid}
            onChipToggle={onChipToggle}
          />
        )}
      </dd>
    </>
  );
}

function fmtFt(n: number | null | undefined): string {
  return typeof n === "number" ? `${n}′` : "—";
}
