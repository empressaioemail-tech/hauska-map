// apps/property-explorer/src/workbench/tools/chat-citations.ts
//
// W3 — citation → chip data, a PE-native port of the extension's inline-atom
// mechanism (src/lib/inline-atoms.js) MINUS the deprecated markup path:
//
//   - The backend emits NUMBERED [n] citations ({ n, atomDid, label, snippet }
//     via parseInlineCitations). The {{atom:...}} inline-markup shape is
//     DEPRECATED corpus-wide — this port does NOT parse or resurrect it.
//   - Chips come from merging the response's citation-ish arrays client-side
//     (the extension's mergeInlineRefs/normalizeRef flow: citations + sources
//     + any atoms.inlineRefs, deduped by did) and expand IN-THREAD from this
//     local data — NO network fetch on chip tap (wireInlineAtomExpand parity,
//     rebuilt as React components in ChatTool.tsx, no innerHTML wiring).
//   - Freshness is the extension's atom-freshness.js derivation, ported 1:1:
//     structured edition/vintage field first, else the honest ICC-cycle
//     edition-year heuristic, else "unknown" (NO badge — never a bare
//     "current" the data can't defend).

// ---------------------------------------------------------------------------
// Ref shape + normalization (inline-atoms.js normalizeRef/mergeInlineRefs).
// ---------------------------------------------------------------------------

export interface ChatRef {
  /** Stable identity + dedupe key (`did:hauska:<type>:<id>` when derivable). */
  did: string;
  entityType: string;
  entityId: string;
  label: string;
  snippet: string | null;
  /** Structured edition/vintage when the ref carries one (freshness input). */
  edition: string | null;
  vintage: string | null;
}

interface RawRefLike {
  did?: unknown;
  atomDid?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  label?: unknown;
  snippet?: unknown;
  edition?: unknown;
  vintage?: unknown;
}

/** The chat response fields this module reads (all defensive-optional). */
export interface ChatResponsePayload {
  message?: string;
  messageHtml?: string;
  citations?: unknown[];
  sources?: unknown[];
  inlineRefs?: unknown[];
  atoms?: { inlineRefs?: unknown[] };
  disclaimer?: string;
  confidence?: number;
  generatedAt?: string;
  method?: string;
}

function s(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * COTALITY HYGIENE: Cotality is EXTINGUISHED as a data path. The extension
 * still maps the legacy layer key "cotality-parcel" to the neutral label
 * "Parcel" (site-context-render.js) — we port the NEUTRAL RENAME ONLY, never
 * the key itself: any ref that arrives carrying this legacy entityType is
 * displayed as plain "Parcel" and nothing in PE emits or requests the key.
 */
const LEGACY_PARCEL_ENTITY_TYPE = "cotality-parcel";
const NEUTRAL_PARCEL_LABEL = "Parcel";

export function normalizeChatRef(raw: unknown): ChatRef | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = raw as RawRefLike;

  let entityType = s(r.entityType);
  let entityId = s(r.entityId);
  // The chat citations carry `atomDid`; inlineRefs-style refs carry `did`.
  const did = s(r.did) ?? s(r.atomDid);

  if (!entityId && did) {
    const parts = did.split(":");
    if (parts.length >= 4) {
      entityType = entityType ?? s(parts[2]);
      entityId = entityId ?? s(parts.slice(3).join(":"));
    }
  }
  if (!entityId && !did) return null;

  const type = entityType ?? "code-section";
  const id = entityId ?? did!;
  const resolvedDid = did ?? `did:hauska:${type}:${id}`;
  let label = s(r.label) ?? id;
  if (type === LEGACY_PARCEL_ENTITY_TYPE) label = NEUTRAL_PARCEL_LABEL;

  return {
    did: resolvedDid,
    entityType: type,
    entityId: id,
    label,
    snippet: s(r.snippet),
    edition: s(r.edition),
    vintage: s(r.vintage),
  };
}

/**
 * Merge the response's citation-ish arrays into one deduped chip list
 * (first occurrence wins — citations, then sources, then inlineRefs; a later
 * duplicate only donates a snippet the first lacked).
 */
export function refsFromChatResponse(payload: ChatResponsePayload): ChatRef[] {
  const raw: unknown[] = [
    ...(Array.isArray(payload.citations) ? payload.citations : []),
    ...(Array.isArray(payload.sources) ? payload.sources : []),
    ...(Array.isArray(payload.atoms?.inlineRefs) ? payload.atoms.inlineRefs : []),
    ...(Array.isArray(payload.inlineRefs) ? payload.inlineRefs : []),
  ];
  const out: ChatRef[] = [];
  const byDid = new Map<string, ChatRef>();
  for (const item of raw) {
    const ref = normalizeChatRef(item);
    if (!ref) continue;
    const existing = byDid.get(ref.did);
    if (existing) {
      if (!existing.snippet && ref.snippet) existing.snippet = ref.snippet;
      continue;
    }
    byDid.set(ref.did, ref);
    out.push(ref);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Freshness — atom-freshness.js deriveChipFreshness, ported 1:1.
// ---------------------------------------------------------------------------

// Latest published ICC I-Code cycle year. Editions strictly older than this are
// superseded. Bump when a new cycle lands (2027, 2030, …) — demo constant.
const LATEST_ICC_CYCLE_YEAR = 2024;

// Model codes that publish on the ICC 3-year cycle (edition == publication year).
const CYCLE_CODE_RE = /\b(IBC|IRC|IPMC|IFC|IECC|IPC|IMC|IEBC|IFGC|ISPSC|IWUIC)\b/i;

// A 4-digit code-edition year in a plausible range (avoids matching street
// numbers / random 4-digit ids).
const EDITION_YEAR_RE = /\b(19[89]\d|20[0-4]\d)\b/;

export interface ChipFreshness {
  status: "current" | "outdated" | "unknown";
  year: number | null;
  /** true → year came from the label/id heuristic, not a structured field. */
  demo: boolean;
  reason: string;
}

function structuredEditionYear(ref: ChatRef): number | null {
  for (const c of [ref.edition, ref.vintage]) {
    if (!c) continue;
    const m = String(c).match(EDITION_YEAR_RE);
    if (m) return Number(m[1]);
  }
  return null;
}

export function deriveChipFreshness(ref: ChatRef): ChipFreshness {
  // 1) Prefer a structured edition/vintage field if the atom carries one.
  const structured = structuredEditionYear(ref);
  if (structured != null) {
    const outdated = structured < LATEST_ICC_CYCLE_YEAR;
    return {
      status: outdated ? "outdated" : "current",
      year: structured,
      demo: false,
      reason: `atom edition ${structured}`,
    };
  }

  // 2) Heuristic fallback: only claim OUTDATED/CURRENT when BOTH a cycle
  //    model-code token AND a plausible edition year appear in the text.
  const text = `${ref.label} ${ref.entityId} ${ref.did}`;
  const yearMatch = text.match(EDITION_YEAR_RE);
  if (yearMatch && CYCLE_CODE_RE.test(text)) {
    const year = Number(yearMatch[1]);
    const outdated = year < LATEST_ICC_CYCLE_YEAR;
    return {
      status: outdated ? "outdated" : "current",
      year,
      demo: true,
      reason: `demo heuristic: ${year} I-Code edition`,
    };
  }

  // 3) Not enough signal to make a defensible claim — no badge.
  return { status: "unknown", year: null, demo: true, reason: "no edition signal" };
}

/** Hover title for the badge (freshnessBadgeHtml parity). */
export function freshnessTitle(f: ChipFreshness): string {
  const base =
    f.status === "outdated"
      ? `Cited edition${f.year ? ` (${f.year})` : ""} is superseded by the current code cycle`
      : `Cited edition${f.year ? ` (${f.year})` : ""} is current`;
  return base + (f.demo ? " · demo estimate" : "");
}
