// apps/property-explorer/src/lib/layer-absence.ts
//
// Doc 19 §Layer absence verdicts on property inspect (P-63 Track B).
// Vocabulary matches Smart Files / instrument contract — no PE-local strings.

/** Fixed absence verdict union per 19_the_instrument_contract.md §Layer. */
export type LayerAbsenceVerdict =
  | "absent-verified"
  | "lookup-failed"
  | "not-applicable";

/** Cortex layer wire when status === "absent". */
export interface LayerAbsenceWire {
  status: "absent";
  verdict: LayerAbsenceVerdict;
  authority: string;
  scopeSearched: string;
  asOf: string;
  basis: string;
}

export interface PopulatedLayerWire<T> {
  status: "populated";
  value: T;
}

export type LayerWire<T> = PopulatedLayerWire<T> | LayerAbsenceWire;

/** Provenance carried on a card facet for chip rendering. */
export interface LayerAbsenceProvenance {
  verdict: LayerAbsenceVerdict;
  authority: string;
  scopeSearched: string;
  asOf: string;
  basis: string;
}

const LAYER_ABSENCE_VERDICTS: readonly LayerAbsenceVerdict[] = [
  "absent-verified",
  "lookup-failed",
  "not-applicable",
];

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Type guard: cortex layer absence object (doc 19 required fields). */
export function isLayerAbsenceWire(value: unknown): value is LayerAbsenceWire {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  if (o.status !== "absent") return false;
  const verdict = o.verdict;
  if (
    typeof verdict !== "string" ||
    !(LAYER_ABSENCE_VERDICTS as readonly string[]).includes(verdict)
  ) {
    return false;
  }
  return (
    nonEmptyString(o.authority) &&
    nonEmptyString(o.scopeSearched) &&
    nonEmptyString(o.asOf) &&
    nonEmptyString(o.basis)
  );
}

export function isPopulatedLayerWire<T>(
  value: unknown,
): value is PopulatedLayerWire<T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as { status?: unknown }).status === "populated";
}

/** Primary row label — verdict string is always visible; never collapsed to atom-miss. */
export function layerAbsenceDisplayLabel(verdict: LayerAbsenceVerdict): string {
  return verdict;
}

export function layerAbsenceProvenanceFromWire(
  wire: LayerAbsenceWire,
): LayerAbsenceProvenance {
  return {
    verdict: wire.verdict,
    authority: wire.authority.trim(),
    scopeSearched: wire.scopeSearched.trim(),
    asOf: wire.asOf.trim(),
    basis: wire.basis.trim(),
  };
}

export interface LayerFacetLike {
  state: "present" | "absent" | "pending" | "unknown";
  value: string | null;
  layerAbsence?: LayerAbsenceProvenance;
  silentEmpty?: boolean;
}

/** Map a layer wire → inspect card facet. */
export function layerWireToCardFacet<T>(
  wire: LayerWire<T> | null | undefined,
  formatValue: (value: T) => string | null,
): LayerFacetLike {
  if (wire == null) {
    return { state: "unknown", value: null };
  }
  if (isLayerAbsenceWire(wire)) {
    return {
      state: "absent",
      value: layerAbsenceDisplayLabel(wire.verdict),
      layerAbsence: layerAbsenceProvenanceFromWire(wire),
    };
  }
  if (isPopulatedLayerWire<T>(wire)) {
    const rendered = formatValue(wire.value);
    return rendered
      ? { state: "present", value: rendered }
      : { state: "absent", value: null };
  }
  return { state: "unknown", value: null };
}

/**
 * Metro structural empty-success detector (P-63 WDLL item 4 PE companion).
 * When the payload declares structural coverage but carries neither a value
 * nor a typed absence verdict, the read is a defect — not honest absence.
 *
 * Track A (cortex) must ship the verdict wire; until then this returns true
 * for metro-shaped fixtures with silent empty chains.
 */
export function isSilentEmptyStructuralLayer(payload: {
  livingAreaSqft?: LayerWire<number> | null;
  facetCoverage?: { structural?: boolean };
}): boolean {
  if (payload.facetCoverage?.structural !== true) return false;
  const wire = payload.livingAreaSqft;
  if (wire == null) return true;
  if (isLayerAbsenceWire(wire)) return false;
  if (isPopulatedLayerWire<number>(wire)) {
    const v = wire.value;
    return typeof v !== "number" || !Number.isFinite(v) || v <= 0;
  }
  return true;
}
