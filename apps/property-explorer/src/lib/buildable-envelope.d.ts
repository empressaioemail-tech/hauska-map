// Type shim for the ported buildable-envelope client (JS source).
export interface EnvelopeSelection {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/**
 * Optional atom-provenance references the backend attaches to the
 * brokeragePlaceBuildableEnvelope atom-chain response (legacy-design-tools
 * `feat/envelope-provenance-refs`). Additive / hand-written — no field here
 * is ever required, so a response without it renders identically to today.
 */
export interface EnvelopeProvenanceRefs {
  zoning?: { atomDid: string };
  setback?: { atomDid: string };
  envelope?: { atomDid: string };
  codeSections?: Array<{
    atomDid: string;
    sectionNumber: string;
    title?: string;
  }>;
}

/**
 * One governing-rule reference for a conditional setback cell (Elgin
 * setback-table ratification, 2026-08-04: "conditional cells route users to
 * the governing answer"). Mirrors the engine's `governed_by` shape on
 * setback-table cells: either a single condition object or a `conditions`
 * array (e.g. an I-district's 25/30 ft split). Optional and additive — a
 * response without it renders identically to today (a bare not-specified
 * dash).
 */
export interface GovernedByCondition {
  /** Plain-language condition label, e.g. "if adjoining a dwelling district". */
  condition?: string | null;
  /** The governing district code, when the rule routes to another district's
   *  table row (e.g. C-2 -> C-1). */
  district?: string | null;
  /** Code citation for the governing rule — ALWAYS present when governed_by
   *  is present; a resolved value with no section_number is not renderable
   *  per the ratification's citation requirement. */
  section_number?: string | null;
  /** Free-text rule detail for the X-ray/detail surface. */
  note?: string | null;
  /** Resolved numeric value, when the condition is mechanical (e.g. the
   *  I-district 25 ft/30 ft split) rather than a routing-only reference. */
  value_ft?: number | null;
}

export interface GovernedBy {
  condition?: string | null;
  district?: string | null;
  section_number?: string | null;
  note?: string | null;
  value_ft?: number | null;
  conditions?: GovernedByCondition[];
}

/** Per-axis governed_by + provenance-note passthrough for a setback cell.
 *  Every field optional / independently absent — graceful degradation per
 *  axis, not an all-or-nothing block. */
export interface SetbackFieldProvenance {
  front?: GovernedBy | null;
  side?: GovernedBy | null;
  rear?: GovernedBy | null;
  sideCorner?: GovernedBy | null;
}

/** Per-axis free-text provenance note (the fuller rule text carried in the
 *  ratified table's per-field provenance notes — one-vs-two-story splits,
 *  corner cases, formula rears) for the X-ray/detail surface. Distinct from
 *  governedBy: a field can carry an explanatory note without being a
 *  cross-district routing case. */
export interface SetbackFieldNotes {
  front?: string | null;
  side?: string | null;
  rear?: string | null;
  sideCorner?: string | null;
}

export interface BuildableEnvelopeResult {
  ok: boolean;
  status: string;
  empty?: boolean;
  reason?: string | null;
  geometry?: unknown;
  properties?: Record<string, unknown> | null;
  setbacks?: {
    front_ft: number | null;
    side_ft: number | null;
    rear_ft: number | null;
    district: string | null;
    /** Per-axis governing-rule references, present only when the served
     *  table carries them (Elgin-shaped tables onward). */
    governedBy?: SetbackFieldProvenance | null;
    /** Per-axis provenance notes for the X-ray/detail surface. */
    fieldNotes?: SetbackFieldNotes | null;
  } | null;
  summary?: Record<string, unknown> | null;
  disclosure?: string | null;
  confidence?: { value?: number; kind?: string } | null;
  notSurveyGrade?: boolean;
  approximate?: boolean;
  citationUrl?: string | null;
  parcelNodeId?: string | null;
  provenanceRefs?: EnvelopeProvenanceRefs;
  [k: string]: unknown;
}

export function envelopeRequestBody(sel: EnvelopeSelection): object | null;
export function parsePlaceKey(placeKey: string | null | undefined): { lat: number; lng: number } | null;
export function parcelNodeIdFromEnvelope(
  json: unknown,
  payload: unknown,
  props: unknown,
): string | null;
export function setbacksFromProps(props: unknown): BuildableEnvelopeResult["setbacks"];
export function envelopeSummaryFromProps(props: unknown, wrapper: unknown): Record<string, unknown>;
export function fetchBuildableEnvelope(
  sel: EnvelopeSelection,
  cortexBase: string,
  fetchImpl?: typeof fetch,
): Promise<BuildableEnvelopeResult>;
