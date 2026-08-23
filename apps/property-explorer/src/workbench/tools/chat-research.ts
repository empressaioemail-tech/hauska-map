// apps/property-explorer/src/workbench/tools/chat-research.ts
//
// W3 — the AI-chat request/outcome seam, a FLOW port of the brief-extension's
// research chat (src/lib/research-api.js + research-app.js callLiveResearch)
// rebuilt PE-native. Same backend, same contract:
//
//   POST api/brokerage/v1/research/chat (cortex, ldt brokerageBrief.ts
//   RESEARCH_CHAT_BODY): { message (required), history (last-8 turns),
//   presentationMode, starterPromptId?, personaBucket?, areaContext?, address? }.
//   The run selector accepts runId | address | workspaceDid | areaContext
//   (scope=area OR non-empty visibleParcels). `mapContext` is NOT in the
//   schema — never sent.
//
// PE v1 scoping: PE has no brokerage brief runs (its R1 brief is the separate
// property-explorer baked-snapshot report), so the ONLY selector that always
// resolves is `areaContext`. We send the subject parcel as the single
// `visibleParcels` row (the honest expression of "this one parcel is in
// focus" — and the eligibility anchor), plus the extension's real F4 seam:
// the subject's setbacks/envelope under `areaContext.subject`
// (parcel-node-store.js getSubjectAreaContext shape — FIELD NAMES ARE
// LOAD-BEARING, they match the BE zod in brokerageResearchAreaContext.ts).
// `address` also rides top-level when known.
//
// Auth: through the PE deep proxy (user-session Bearer — postDeepResearch),
// NEVER the service key and NEVER the extension's X-Hauska-Install-Id /
// public-key wedge.

import { postDeepResearch } from "../../lib/auth";
import {
  fetchBakedNodeFacetsOrNull,
  type BakedFacetPayload,
  type BakedFacetsResponse,
  type FloodHazardFactCardInput,
  type LandUseFactCardInput,
} from "../../lib/baked-facets";
import {
  isLayerAbsenceWire,
  zoningDistrictFromPayload,
} from "../../lib/layer-absence";
import { PE_FACETS_PROXY_BASE } from "../../lib/config";
import {
  refsFromChatResponse,
  type ChatRef,
  type ChatResponsePayload,
} from "./chat-citations";

export const CHAT_ENDPOINT = "api/brokerage/v1/research/chat";

/** 402 value line — the unified unlock flow renders under it (R1: no
 *  Pro-hardcoded copy; the flow offers the $15 property unlock AND Pro). */
export const CHAT_PAYWALL_MESSAGE =
  "Unlimited cited AI chat on this property — every answer cites the municipal-code atoms it rests on.";

/** 402 free_messages_exhausted value line (the chat wall). */
export const CHAT_FREE_EXHAUSTED_MESSAGE =
  "You've used your free messages on this property. Unlock it for unlimited AI chat plus every report.";

/** WB6 save-chat AI summary — classified as PAID chat (R1). */
export const CHAT_SUMMARY_LOCK_MESSAGE =
  "Saving this chat with an AI summary is part of paid chat on this property.";

// ---------------------------------------------------------------------------
// Starter prompts — INVESTOR_STARTER_PROMPTS ported VERBATIM from the
// extension (src/lib/lay-render.js). Atom-seeded chips are deferred by spec;
// this static set is the v1 surface. `factorMatch` rides along verbatim even
// though PE v1 does not do factor matching (kept so a later wave inherits the
// full definition, not a lossy copy).
// ---------------------------------------------------------------------------

export interface StarterPrompt {
  id: string;
  chip: string;
  question: string;
  personaBucket: string;
  factorMatch: RegExp;
}

export const INVESTOR_STARTER_PROMPTS: StarterPrompt[] = [
  {
    id: "unit_subdivide",
    chip: "Can I add a unit or subdivide?",
    question:
      "Can this parcel support an additional unit, ADU, or subdivision under current zoning?",
    personaBucket: "investor",
    factorMatch: /unit|subdivide|adu|zoning|density|lot split|duplex/i,
  },
  {
    id: "pencil",
    chip: "Does it pencil?",
    question:
      "Does this deal pencil on conservative buy-and-hold or flip assumptions?",
    personaBucket: "investor",
    factorMatch: /pencil|numbers|cap|noi|arv|margin|rent|cash.?flow/i,
  },
  {
    id: "killers",
    chip: "What kills this deal?",
    question: "What are the top deal killers or show-stoppers on this parcel?",
    personaBucket: "investor",
    factorMatch: /kill|dead|flood|environment|title|easement|risk|pass/i,
  },
  {
    id: "rehab",
    chip: "Rehab reality check",
    question:
      "What rehab or condition issues would change the investor verdict?",
    personaBucket: "investor",
    factorMatch: /rehab|condition|repair|structural|age|deferred/i,
  },
  {
    id: "insurance",
    chip: "Insurance and flood cost?",
    question:
      "What should I budget for insurance and flood-related costs on this property?",
    personaBucket: "investor",
    factorMatch: /insur|flood|fema|premium/i,
  },
];

// ---------------------------------------------------------------------------
// Starter-id remap — ported from the extension (src/lib/research-api.js:17-29).
// The backend's starterPromptId is a closed z.enum; UNKNOWN VALUES 400. The
// investor chip ids are remapped to the nearest brokerage starter; unmappable
// ids (e.g. "pencil") OMIT the field entirely.
// ---------------------------------------------------------------------------

/** cortex-api z.enum — invalid ids cause HTTP 400 on /research/chat */
const BROKERAGE_STARTER_PROMPT_IDS = new Set([
  "adu",
  "flood",
  "schools",
  "str",
  "setbacks",
  "red_flags",
]);

/** Map investor-radar chip ids to nearest brokerage starter for GTM + retrieval hints */
const INVESTOR_TO_BROKERAGE_STARTER: Record<string, string> = {
  unit_subdivide: "adu",
  killers: "red_flags",
  insurance: "flood",
  rehab: "red_flags",
};

export function resolveBrokerageStarterPromptId(
  starterPromptId: string | null | undefined,
): string | undefined {
  if (!starterPromptId) return undefined;
  if (BROKERAGE_STARTER_PROMPT_IDS.has(starterPromptId)) return starterPromptId;
  return INVESTOR_TO_BROKERAGE_STARTER[starterPromptId];
}

// ---------------------------------------------------------------------------
// Subject context — the F4 seam shape (extension parcel-node-store.js
// getSubjectAreaContext), fed from what PE actually knows about the active
// property: the stored R1 brief's zoning + setbacks-envelope sections and the
// inspect card's situs address (host seam). All fields honest-nullable.
// ---------------------------------------------------------------------------

export interface ChatSubjectSetbacks {
  front_ft: number | null;
  side_ft: number | null;
  rear_ft: number | null;
  district: string | null;
}

export interface ChatSubjectEnvelope {
  buildableAreaSqFt: number | null;
  buildableAreaPct: number | null;
  maxHeightFt: number | null;
  maxLotCoveragePct: number | null;
  maxFootprintSqFt: number | null;
  notSurveyGrade: boolean;
  approximate: boolean;
  edgeSignal: string | null;
  disclosure: string | null;
  citationUrl: string | null;
}

export interface ChatSubjectParcelFacts {
  acreageAc: number | null;
  acreageSqft: number | null;
  livingAreaSqft: number | null;
  floodZoneLabel: string | null;
  landUseCode: string | null;
  landUseDescription: string | null;
  zoningDistrict: string | null;
}

export interface ChatSubjectContext {
  parcelNodeId: string;
  address: string | null;
  /** Drives backend atom retrieval (citations) — from the brief's zoning section. */
  jurisdictionKey: string | null;
  setbacks: ChatSubjectSetbacks | null;
  envelope: ChatSubjectEnvelope | null;
  parcelFacts: ChatSubjectParcelFacts;
}

function emptyParcelFacts(
  zoningDistrict: string | null = null,
): ChatSubjectParcelFacts {
  return {
    acreageAc: null,
    acreageSqft: null,
    livingAreaSqft: null,
    floodZoneLabel: null,
    landUseCode: null,
    landUseDescription: null,
    zoningDistrict,
  };
}

function acreageFromFacets(
  facets: BakedFacetPayload,
): Pick<ChatSubjectParcelFacts, "acreageAc" | "acreageSqft"> {
  const ac = facets.baseFacts?.acreage;
  if (!ac || typeof ac.value !== "number" || !Number.isFinite(ac.value)) {
    return { acreageAc: null, acreageSqft: null };
  }
  return {
    acreageAc: ac.value,
    acreageSqft:
      typeof ac.sqft === "number" && Number.isFinite(ac.sqft) ? ac.sqft : null,
  };
}

function livingAreaSqftFromFacets(facets: BakedFacetPayload): number | null {
  const wire = facets.livingAreaSqft;
  if (!wire || typeof wire !== "object" || isLayerAbsenceWire(wire)) return null;
  if (
    wire.status === "populated" &&
    typeof wire.value === "number" &&
    Number.isFinite(wire.value) &&
    wire.value > 0
  ) {
    return wire.value;
  }
  return null;
}

function floodZoneLabelFromFact(
  flood: FloodHazardFactCardInput | null | undefined,
): string | null {
  if (!flood || typeof flood !== "object") return null;
  const state = str(flood.state);
  if (state !== "present") return null;

  const zones = Array.isArray(flood.zones) ? flood.zones : null;
  if (zones && zones.length > 0) {
    const codes = zones
      .map((z) => {
        const row = asRecord(z);
        return row ? (str(row.floodZone) ?? str(row.zone)) : null;
      })
      .filter((c): c is string => !!c);
    if (codes.length > 1) return `Zones ${codes.join(", ")}`;
    if (codes.length === 1) return `Zone ${codes[0]}`;
  }

  const zone = str(flood.floodZone);
  if (zone) return `Zone ${zone}`;
  if (flood.inSpecialFloodHazardArea === true) {
    return "Inside SFHA (zone unstated)";
  }
  return null;
}

function landUseFromFacetsResponse(
  facets: BakedFacetPayload,
  landUseFact: LandUseFactCardInput | null | undefined,
): Pick<ChatSubjectParcelFacts, "landUseCode" | "landUseDescription"> {
  if (landUseFact && typeof landUseFact === "object") {
    const state = str(landUseFact.state);
    if (state === "present") {
      return {
        landUseCode: str(landUseFact.landUseCode),
        landUseDescription: str(landUseFact.landUseLabel),
      };
    }
    return { landUseCode: null, landUseDescription: null };
  }

  const lu = facets.baseFacts?.landUse ?? null;
  if (!lu) return { landUseCode: null, landUseDescription: null };
  return {
    landUseCode: str(lu.code),
    landUseDescription: str(lu.description),
  };
}

function buildParcelFactsFromFacetsResponse(
  facets: BakedFacetPayload,
  response: BakedFacetsResponse | null,
  zoningDistrict: string | null,
): ChatSubjectParcelFacts {
  const { acreageAc, acreageSqft } = acreageFromFacets(facets);
  const { landUseCode, landUseDescription } = landUseFromFacetsResponse(
    facets,
    response?.landUseFact,
  );
  return {
    acreageAc,
    acreageSqft,
    livingAreaSqft: livingAreaSqftFromFacets(facets),
    floodZoneLabel: floodZoneLabelFromFact(response?.floodHazardFact),
    landUseCode,
    landUseDescription,
    zoningDistrict,
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Minimal structural view of the stored R1 brief (brief-view-model shapes). */
interface BriefLike {
  brief?: { sections?: Array<{ id?: string; data?: unknown }> };
}

/**
 * Build the subject context from the ACTIVE property's stored R1 brief (when
 * present) + the inspect card address. Absent pieces stay null — the backend
 * prompt honestly says setbacks "aren't resolved" rather than fabricating.
 */
export function buildChatSubjectContext(
  parcelNodeId: string,
  brief: BriefLike | null | undefined,
  address: string | null,
): ChatSubjectContext {
  const sections = brief?.brief?.sections ?? [];
  const zoning = asRecord(sections.find((s) => s?.id === "zoning")?.data);
  const env = asRecord(
    sections.find((s) => s?.id === "setbacks-envelope")?.data,
  );
  const sb = env ? asRecord(env.setbacks) : null;

  const district = (env ? str(env.district) : null) ?? (zoning ? str(zoning.district) : null);
  const setbacks: ChatSubjectSetbacks | null = sb
    ? {
        front_ft: num(sb.front_ft),
        side_ft: num(sb.side_ft),
        rear_ft: num(sb.rear_ft),
        district,
      }
    : null;

  // Only a derived (non-declined) envelope carries numbers worth sending.
  const envelope: ChatSubjectEnvelope | null =
    env && str(env.status) && str(env.status) !== "declined"
      ? {
          buildableAreaSqFt: num(env.buildableAreaSqFt),
          buildableAreaPct: num(env.buildableAreaPct),
          maxHeightFt: num(env.maxHeightFt),
          maxLotCoveragePct: num(env.maxLotCoveragePct),
          maxFootprintSqFt: num(env.maxFootprintSqFt),
          notSurveyGrade: true, // PE envelopes are never survey grade.
          approximate: env.approximate !== false,
          edgeSignal: str(env.edgeSignal),
          disclosure: str(env.disclosure),
          citationUrl: str(env.citationUrl),
        }
      : null;

  return {
    parcelNodeId,
    address,
    jurisdictionKey: zoning ? str(zoning.jurisdictionKey) : null,
    setbacks,
    envelope,
    parcelFacts: emptyParcelFacts(district),
  };
}

// ---------------------------------------------------------------------------
// SELF-SUFFICIENT subject context (workbench polish). Root cause of the "I
// don't have zoning information" defect: the subject was built ONLY from the
// stored R1 brief, which is empty unless the user opened the Brief tool first
// — while the inspect card was showing zoning/setbacks from the BAKED FACETS
// the whole time. The chat tool now sources its own context: the baked facets
// are the PRIMARY source (fetched once per property, module-cached below) and
// the stored brief is a SUPPLEMENT when present — never a prerequisite.
// Honest omissions stay null; nothing is fabricated.
// ---------------------------------------------------------------------------

/**
 * Defensive jurisdiction read: the typed facets payload does not carry a
 * jurisdiction key today, but the wire payload may (zoning.jurisdictionKey /
 * top-level jurisdictionKey / jurisdiction). Honest null when absent.
 */
export function jurisdictionKeyFromFacets(
  facets: BakedFacetPayload,
): string | null {
  const rec = facets as unknown as Record<string, unknown>;
  const zoning = asRecord(rec.zoning);
  const jurisdiction = asRecord(rec.jurisdiction);
  return (
    (zoning
      ? (str(zoning.jurisdictionKey) ?? str(zoning.jurisdiction))
      : null) ??
    str(rec.jurisdictionKey) ??
    (jurisdiction
      ? (str(jurisdiction.key) ?? str(jurisdiction.jurisdictionKey))
      : str(rec.jurisdiction))
  );
}

/**
 * Build the subject from the property's BAKED FACETS (the inspect card's own
 * data — primary), supplemented by the stored R1 brief when present and the
 * host's inspect-card address as the last address fallback.
 *
 * not_specified setback axes are nulled (build-to-line governs — sending the
 * placeholder number would fabricate a scalar setback the code does not carry).
 */
export function buildChatSubjectFromFacets(
  parcelNodeId: string,
  facetsResponse: BakedFacetsResponse | null,
  brief: BriefLike | null | undefined,
  address: string | null,
): ChatSubjectContext {
  const facets = facetsResponse?.facets ?? null;
  // The brief-derived subject (may be all-null when no brief was ever opened).
  const fromBrief = buildChatSubjectContext(parcelNodeId, brief, address);
  if (!facets) return fromBrief;

  const env = facets.envelope ?? null;
  const envUsable = !!env && env.status !== "declined";
  const district =
    (envUsable ? str(env.district) : null) ??
    str(zoningDistrictFromPayload(facets.zoning)?.district) ??
    fromBrief.setbacks?.district ??
    null;

  const s = envUsable ? (env.setbacks ?? null) : null;
  const ns = s?.not_specified ?? {};
  const facetSetbacks: ChatSubjectSetbacks | null = s
    ? {
        front_ft: ns.front ? null : num(s.front_ft),
        side_ft: ns.side ? null : num(s.side_ft),
        rear_ft: ns.rear ? null : num(s.rear_ft),
        district,
      }
    : null;
  const setbacks =
    facetSetbacks ??
    fromBrief.setbacks ??
    // District known without setback scalars: still say WHICH district — the
    // honest partial (numbers stay null; the backend prompt says so).
    (district
      ? { front_ft: null, side_ft: null, rear_ft: null, district }
      : null);

  const briefEnv = fromBrief.envelope;
  const envelope: ChatSubjectEnvelope | null = envUsable
    ? {
        buildableAreaSqFt:
          num(env.buildableAreaSqFt) ?? briefEnv?.buildableAreaSqFt ?? null,
        buildableAreaPct:
          num(env.buildableAreaPct) ?? briefEnv?.buildableAreaPct ?? null,
        // Not on the baked facets — brief-only supplements.
        maxHeightFt: briefEnv?.maxHeightFt ?? null,
        maxLotCoveragePct: briefEnv?.maxLotCoveragePct ?? null,
        maxFootprintSqFt: briefEnv?.maxFootprintSqFt ?? null,
        notSurveyGrade: true, // PE envelopes are never survey grade.
        approximate: env.approximate !== false,
        edgeSignal: briefEnv?.edgeSignal ?? null,
        disclosure: str(env.disclosure) ?? briefEnv?.disclosure ?? null,
        citationUrl: str(env.citationUrl) ?? briefEnv?.citationUrl ?? null,
      }
    : briefEnv;

  return {
    parcelNodeId,
    address:
      str(facets.baseFacts?.situsAddress) ?? fromBrief.address,
    jurisdictionKey:
      jurisdictionKeyFromFacets(facets) ?? fromBrief.jurisdictionKey,
    setbacks,
    envelope,
    parcelFacts: buildParcelFactsFromFacetsResponse(
      facets,
      facetsResponse,
      district,
    ),
  };
}

// ---------------------------------------------------------------------------
// Per-property facets cache — fetch ONCE per property, not per message. The
// promise is cached so concurrent sends share one in-flight fetch; a failed /
// empty fetch is evicted so a later message retries instead of pinning the
// property to "no context" forever.
// ---------------------------------------------------------------------------

const chatFacetsCache = new Map<string, Promise<BakedFacetsResponse | null>>();

async function defaultChatFacetsFetcher(
  parcelNodeId: string,
): Promise<BakedFacetsResponse | null> {
  return fetchBakedNodeFacetsOrNull(parcelNodeId, PE_FACETS_PROXY_BASE);
}

/** Facets for the active property, module-cached per parcelNodeId. */
export function getChatPropertyFacets(
  parcelNodeId: string,
  fetcher: (
    parcelNodeId: string,
  ) => Promise<BakedFacetsResponse | null> = defaultChatFacetsFetcher,
): Promise<BakedFacetsResponse | null> {
  const cached = chatFacetsCache.get(parcelNodeId);
  if (cached) return cached;
  const inFlight = fetcher(parcelNodeId).then(
    (response) => {
      if (response == null) chatFacetsCache.delete(parcelNodeId);
      return response;
    },
    () => {
      chatFacetsCache.delete(parcelNodeId);
      return null;
    },
  );
  chatFacetsCache.set(parcelNodeId, inFlight);
  return inFlight;
}

/** Test seam — clear the per-property facets cache. */
export function resetChatPropertyFacetsCache(): void {
  chatFacetsCache.clear();
}

// ---------------------------------------------------------------------------
// Request builder.
// ---------------------------------------------------------------------------

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** History window the backend accepts — last 8 turns (extension parity). */
export const CHAT_HISTORY_WINDOW = 8;

export function buildChatRequestBody(input: {
  message: string;
  /** PRIOR turns (the new message is NOT in history — it rides as `message`). */
  history: ChatTurn[];
  subject: ChatSubjectContext;
  /** RAW chip id (investor set) — remapped/omitted per the extension rules. */
  starterPromptId?: string;
  personaBucket?: string;
  /** R1 entitlement classification: summary calls declare themselves so the
   *  server gates them as PAID chat (402 upgrade_required unless entitled). */
  purpose?: "summary";
}): Record<string, unknown> {
  const { message, subject } = input;
  const starter = resolveBrokerageStarterPromptId(input.starterPromptId);
  const address = str(subject.address);

  // The subject parcel as the single visible parcel: the honest "one parcel in
  // focus" statement AND the areaContext run-selector eligibility anchor (PE
  // has no brokerage brief runs to select by address/runId). Carries the
  // zoning district when known (RESEARCH_AREA_VISIBLE_PARCEL.zoning).
  const zoningDistrict = str(subject.setbacks?.district ?? null);
  const visibleParcel: Record<string, unknown> = {
    parcelId: subject.parcelNodeId,
    ...(address ? { address } : {}),
    ...(zoningDistrict ? { zoning: zoningDistrict } : {}),
  };

  return {
    message,
    history: input.history
      .slice(-CHAT_HISTORY_WINDOW)
      .map((t) => ({ role: t.role, content: t.content })),
    // R2: the workbench chat serves the PRO ICP — "pro" keeps inline [n]
    // citation markers in the answer text (the backend z.enum is
    // ["consumer","pro"]; consumer mode strips the markers, which suppresses
    // the inline citation layer). LOCK ruling 2026-07-29.
    presentationMode: "pro",
    ...(input.purpose ? { purpose: input.purpose } : {}),
    ...(starter ? { starterPromptId: starter } : {}),
    ...(input.personaBucket ? { personaBucket: input.personaBucket } : {}),
    ...(address ? { address } : {}),
    // NOTE: no `mapContext` — it is not in the RESEARCH_CHAT_BODY schema.
    areaContext: {
      scope: "property",
      ...(subject.jurisdictionKey
        ? { jurisdictionKey: subject.jurisdictionKey }
        : {}),
      visibleParcels: [visibleParcel],
      subject: {
        parcelNodeId: subject.parcelNodeId,
        address,
        setbacks: subject.setbacks,
        envelope: subject.envelope,
        parcelFacts: subject.parcelFacts,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Turn runner — honest status mapping (the brief tool's idiom):
//   401                → sign-in state
//   402                → paywall (caller opens the PaywallGate)
//   400 / 404          → "could not scope to this property" + server message
//   5xx                → retryable honest error
//   200 + message      → the answer turn (plain text + normalized citation refs)
//   anything else      → the server's message or the status line
//   network throw      → unreachable (retryable)
// ---------------------------------------------------------------------------

export interface ChatAnswer {
  message: string;
  refs: ChatRef[];
  disclaimer: string | null;
  confidence: number | null;
  generatedAt: string | null;
  method: string | null;
}

/** The pinned R1 chat-402 contract: after the 3rd free message the server
 *  responds { error: "free_messages_exhausted", freeMessagesUsed,
 *  freeMessagesLimit }; paid-classified calls (summary) 402 with
 *  "upgrade_required" unless entitled. Anything else 402 → upgrade_required. */
export type ChatPaywallReason = "free_messages_exhausted" | "upgrade_required";

export type ChatTurnOutcome =
  | { kind: "answer"; answer: ChatAnswer }
  | { kind: "sign-in" }
  | {
      kind: "paywall";
      reason: ChatPaywallReason;
      freeMessagesUsed: number | null;
      freeMessagesLimit: number | null;
    }
  | { kind: "scope-failed"; text: string }
  | { kind: "retryable"; text: string }
  | { kind: "message"; text: string }
  | { kind: "unreachable" };

export async function runChatTurn(
  input: {
    message: string;
    history: ChatTurn[];
    subject: ChatSubjectContext;
    starterPromptId?: string;
    personaBucket?: string;
    purpose?: "summary";
  },
  post: (
    path: string,
    body: Record<string, unknown>,
  ) => Promise<Response> = postDeepResearch,
): Promise<ChatTurnOutcome> {
  try {
    const res = await post(CHAT_ENDPOINT, buildChatRequestBody(input));
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      freeMessagesUsed?: number;
      freeMessagesLimit?: number;
    } & ChatResponsePayload;
    if (res.status === 401) return { kind: "sign-in" };
    if (res.status === 402) {
      return {
        kind: "paywall",
        reason:
          body.error === "free_messages_exhausted"
            ? "free_messages_exhausted"
            : "upgrade_required",
        freeMessagesUsed: num(body.freeMessagesUsed),
        freeMessagesLimit: num(body.freeMessagesLimit),
      };
    }
    if (res.status === 400 || res.status === 404) {
      // Run-selector / areaContext rejection (or no brokerage run resolved):
      // the honest "could not scope" state, carrying the server's own words.
      return {
        kind: "scope-failed",
        text: body.message ?? `Chat request returned ${res.status}.`,
      };
    }
    if (res.status >= 500) {
      return {
        kind: "retryable",
        text: body.message ?? `Research service error (${res.status}).`,
      };
    }
    if (res.ok && typeof body.message === "string" && body.message.trim()) {
      return {
        kind: "answer",
        answer: {
          message: body.message,
          refs: refsFromChatResponse(body),
          disclaimer: str(body.disclaimer),
          confidence: num(body.confidence),
          generatedAt: str(body.generatedAt),
          method: str(body.method),
        },
      };
    }
    return {
      kind: "message",
      text: body.message ?? `Chat request returned ${res.status}.`,
    };
  } catch {
    return { kind: "unreachable" };
  }
}

/** Human copy for non-answer outcomes (rendered in the thread, never stored). */
export function chatOutcomeNotice(
  outcome: Exclude<ChatTurnOutcome, { kind: "answer" }>,
): string {
  switch (outcome.kind) {
    case "sign-in":
      return "Sign in to unlock AI chat on this parcel.";
    case "paywall":
      return outcome.reason === "free_messages_exhausted"
        ? CHAT_FREE_EXHAUSTED_MESSAGE
        : CHAT_PAYWALL_MESSAGE;
    case "scope-failed":
      return "Chat could not scope to this property.";
    case "retryable":
    case "message":
      return outcome.text;
    case "unreachable":
      return "Could not reach the research service.";
  }
}
