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
