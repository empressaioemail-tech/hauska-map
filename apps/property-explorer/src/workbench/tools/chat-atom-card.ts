// apps/property-explorer/src/workbench/tools/chat-atom-card.ts
//
// R2 — the citation accordion's data layer: fetch-on-tap atom enrichment +
// the CLIENT-COMPOSED lineage walk. Pure logic; components live in
// ChatTool.tsx.
//
//   - FETCH-ON-TAP: GET {retrieval proxy}/atoms/:did (anonymous-allowlisted;
//     the proxy attaches the Bearer key server-side). Cached per did. ANY
//     non-200 is treated identically: the card DEGRADES to the local BRIEF
//     content with an honest "full record unavailable" line, and the outcome
//     is cached so a dead did is never re-fetched. (Live probe 2026-07-29:
//     the route's only non-200 is a uniform 404 {"error":"atom not found"} —
//     there is no separate "forbidden" shape to leak; ldt-corpus code-section
//     citation ids may legitimately 404 here, which is exactly the degrade
//     path.) Network throws are NOT cached (transient — retry allowed).
//   - LINEAGE v1 (LOCK ruling): composed CLIENT-SIDE from the property's
//     atom-chain (GET property-nodes/:id/atom-chain, cached per property).
//     COMPUTED-FROM = the atom's OWN reasoningChain.inputAtomRefs (fact/rule/
//     derived roles — real recorded links, e.g. buildable-envelope ←
//     zoning-fact + setback-rule). WOULD-AFFECT = the inversion over atoms
//     actually on the chain. reference-field refs (parcel geometry, front
//     edge) are cited inputs, not atoms — rendered as text, never chips.
//     NOTHING is fabricated: absent links render nothing.
//   - HONESTY: confidence is NEVER bare — value + basis ride together or
//     nothing renders. PE atoms are honestly ASSERTED (calibration loop not
//     live): the asserted axis displays labeled "asserted"; the calibrated
//     axis displays ONLY when its provenance is earned (live/backtest) —
//     seed/asserted placeholders are shown as "calibration not yet earned",
//     never dressed as a calibrated number.

import { PE_RETRIEVAL_PROXY_BASE } from "../../lib/config";
// W-CHIP — the atom fetch-on-tap primitive (fetchAtomByDid + its cache) now
// lives in shared/atom-chip/atom-fetch.ts so browse/InspectCard.tsx's
// provenance chips can reuse it without a browse/ -> workbench/tools/
// import. Re-exported here UNCHANGED (same names, same cache instance) — a
// mechanical extraction, no behavior change; this module's and ChatTool's
// tests keep passing against the same fetch/cache semantics.
import { resetAtomFetchCache } from "../../shared/atom-chip/atom-fetch";
export {
  fetchAtomByDid,
  type AtomFetchOutcome,
  type AtomFetcher,
} from "../../shared/atom-chip/atom-fetch";

// ---------------------------------------------------------------------------
// Small defensive readers.
// ---------------------------------------------------------------------------

function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Test seam. */
export function resetAtomCardCaches(): void {
  resetAtomFetchCache();
  chainCache.clear();
}

// ---------------------------------------------------------------------------
// Property atom-chain (lineage substrate) — cached per parcelNodeId.
// ---------------------------------------------------------------------------

/** One atom row on the chain wire (retrieval PropertyAtomChainWire.atoms[]). */
export interface ChainAtomEntry {
  did: string;
  type: string;
  accessPolicy: string | null;
  payload: Record<string, unknown>;
}

export type ChainFetcher = (parcelNodeId: string) => Promise<Response>;

const defaultChainFetcher: ChainFetcher = (parcelNodeId) =>
  fetch(
    `${PE_RETRIEVAL_PROXY_BASE}/property-nodes/${encodeURIComponent(parcelNodeId)}/atom-chain`,
    { method: "GET", headers: { Accept: "application/json" } },
  );

const chainCache = new Map<string, Promise<ChainAtomEntry[] | null>>();

export function parseChainEntries(body: unknown): ChainAtomEntry[] {
  const atoms = rec(body)?.atoms;
  if (!Array.isArray(atoms)) return [];
  const out: ChainAtomEntry[] = [];
  for (const raw of atoms) {
    const r = rec(raw);
    if (!r) continue;
    const did = str(r.did);
    const payload = rec(r.payload);
    if (!did || !payload) continue;
    out.push({
      did,
      type: str(r.type) ?? str(payload.entityType) ?? "atom",
      accessPolicy: str(r.accessPolicy),
      payload,
    });
  }
  return out;
}

/**
 * Chain entries for a property (lineage substrate). Null on failure (the card
 * simply renders no lineage — honest absence); failures are evicted so a later
 * open retries.
 */
export function getChainEntries(
  parcelNodeId: string,
  fetcher: ChainFetcher = defaultChainFetcher,
): Promise<ChainAtomEntry[] | null> {
  const cached = chainCache.get(parcelNodeId);
  if (cached) return cached;
  const inFlight: Promise<ChainAtomEntry[] | null> = (async () => {
    let res: Response;
    try {
      res = await fetcher(parcelNodeId);
    } catch {
      chainCache.delete(parcelNodeId);
      return null;
    }
    if (!res.ok) {
      chainCache.delete(parcelNodeId);
      return null;
    }
    try {
      return parseChainEntries(await res.json());
    } catch {
      chainCache.delete(parcelNodeId);
      return null;
    }
  })();
  chainCache.set(parcelNodeId, inFlight);
  return inFlight;
}

// ---------------------------------------------------------------------------
// Lineage composition (pure; only links ACTUALLY on the chain payload).
// ---------------------------------------------------------------------------

export interface LineageChip {
  did: string;
  label: string;
  entityType: string | null;
}

export interface AtomLineage {
  /** Atoms this one was derived from (its own inputAtomRefs, fact/rule/derived). */
  computedFrom: LineageChip[];
  /** Atoms on the chain whose inputAtomRefs cite this one (real inversion). */
  wouldAffect: LineageChip[];
  /** reference-field inputs (cited continuous inputs, not atoms — not chips). */
  citedInputs: string[];
}

const EMPTY_LINEAGE: AtomLineage = {
  computedFrom: [],
  wouldAffect: [],
  citedInputs: [],
};

interface InputRefLike {
  atomDid: string;
  role: string;
  entityType: string | null;
  citationLabel: string | null;
}

function inputRefsOf(payload: Record<string, unknown>): InputRefLike[] {
  const chain = rec(payload.reasoningChain);
  const refs = chain?.inputAtomRefs;
  if (!Array.isArray(refs)) return [];
  const out: InputRefLike[] = [];
  for (const raw of refs) {
    const r = rec(raw);
    if (!r) continue;
    const atomDid = str(r.atomDid);
    const role = str(r.role);
    if (!atomDid || !role) continue;
    out.push({
      atomDid,
      role,
      entityType: str(r.entityType),
      citationLabel: str(r.citationLabel),
    });
  }
  return out;
}

/** Human label for a lineage chip (entityType reads better than a raw did). */
export function lineageChipLabel(
  entityType: string | null,
  did: string,
): string {
  if (entityType) return entityType.replace(/-/g, " ");
  const parts = did.split(":");
  if (parts.length >= 3 && parts[0] === "did") {
    return (parts[2] ?? did).replace(/-/g, " ");
  }
  return did;
}

function entryDidMatches(entry: ChainAtomEntry, did: string): boolean {
  if (entry.did === did) return true;
  const payloadDid = str(entry.payload.atomDid);
  return payloadDid === did;
}

/**
 * Compose the lineage for one atom from the chain entries. Absent links →
 * empty arrays (the card renders nothing — never a fabricated relationship).
 */
export function composeLineage(
  did: string,
  entries: ChainAtomEntry[] | null,
): AtomLineage {
  if (!entries || entries.length === 0) return EMPTY_LINEAGE;
  const self = entries.find((e) => entryDidMatches(e, did)) ?? null;

  const computedFrom: LineageChip[] = [];
  const citedInputs: string[] = [];
  if (self) {
    for (const ref of inputRefsOf(self.payload)) {
      if (ref.role === "reference-field") {
        citedInputs.push(ref.citationLabel ?? ref.atomDid);
      } else if (
        ref.role === "fact" ||
        ref.role === "rule" ||
        ref.role === "derived"
      ) {
        if (ref.atomDid === did) continue; // defensive: never self-link
        if (computedFrom.some((c) => c.did === ref.atomDid)) continue;
        computedFrom.push({
          did: ref.atomDid,
          label: lineageChipLabel(ref.entityType, ref.atomDid),
          entityType: ref.entityType,
        });
      }
    }
  }

  const wouldAffect: LineageChip[] = [];
  for (const entry of entries) {
    if (entryDidMatches(entry, did)) continue;
    const cites = inputRefsOf(entry.payload).some(
      (ref) => ref.role !== "reference-field" && ref.atomDid === did,
    );
    if (!cites) continue;
    if (wouldAffect.some((c) => c.did === entry.did)) continue;
    wouldAffect.push({
      did: entry.did,
      label: lineageChipLabel(entry.type, entry.did),
      entityType: entry.type,
    });
  }

  return { computedFrom, wouldAffect, citedInputs };
}

/**
 * Serve an atom body from the chain when it is already there (lineage taps hit
 * this first — no network), else null (caller falls back to fetchAtomByDid).
 */
export function atomFromChain(
  did: string,
  entries: ChainAtomEntry[] | null,
): Record<string, unknown> | null {
  if (!entries) return null;
  return entries.find((e) => entryDidMatches(e, did))?.payload ?? null;
}

// ---------------------------------------------------------------------------
// Card model — what the accordion renders once enriched.
// ---------------------------------------------------------------------------

/** NEVER-BARE confidence: the value and its basis are one unit. */
export interface ConfidenceDisplay {
  value: number;
  /** e.g. "asserted" — the honest basis; PE calibration is not live. */
  basis: string;
  n: number | null;
  intervalWidth: number | null;
}

export interface AtomCardModel {
  did: string;
  entityType: string | null;
  /** What the atom asserts, in plain words (per-type claim line). */
  claim: string | null;
  /** source · method provenance line. */
  source: string | null;
  method: string | null;
  sourceUrl: string | null;
  sourceCitation: string | null;
  /** Asserted axis, labeled as such — or null (then NO number renders). */
  confidence: ConfidenceDisplay | null;
  /**
   * The calibrated axis ONLY when earned (provenance live/backtest); else
   * null and the card says calibration is not yet earned.
   */
  calibrated: ConfidenceDisplay | null;
  /** Verification state, displayed exactly ("asserted" for PE atoms today). */
  verification: string;
  asOf: string | null;
  capturedAt: string | null;
  accessPolicy: string | null;
}

function confidenceFromAxis(axis: unknown): ConfidenceDisplay | null {
  const a = rec(axis);
  if (!a) return null;
  const value = num(a.estimate);
  const basis = str(a.provenance);
  if (value == null || !basis) return null; // never a bare number
  return {
    value,
    basis,
    n: num(a.n),
    intervalWidth: num(a.intervalWidth),
  };
}

const EARNED_PROVENANCE = new Set(["live", "backtest"]);

function claimForAtom(atom: Record<string, unknown>): string | null {
  const entityType = str(atom.entityType);
  if (entityType === "zoning-fact") {
    const district = str(atom.district);
    if (district) return `Zoning district ${district}`;
    const absence = rec(atom.absence);
    const kind = absence ? str(absence.kind) : null;
    return kind ? `No zoning recorded here (${kind})` : null;
  }
  if (entityType === "setback-rule") {
    const front = num(atom.front);
    const side = num(atom.side);
    const rear = num(atom.rear);
    const district = str(atom.districtCode);
    if (front == null && side == null && rear == null) return null;
    const parts = [
      front != null ? `front ${front} ft` : null,
      side != null ? `side ${side} ft` : null,
      rear != null ? `rear ${rear} ft` : null,
    ].filter((p): p is string => p !== null);
    return (
      `Setbacks — ${parts.join(" · ")}` + (district ? ` (district ${district})` : "")
    );
  }
  if (entityType === "buildable-envelope") {
    const outcome = rec(atom.outcome);
    const kind = outcome ? str(outcome.kind) : null;
    const area = outcome ? num(outcome.areaSqFt) : null;
    if (kind === "buildable" && area != null) {
      return `Buildable area ≈ ${Math.round(area).toLocaleString("en-US")} sq ft after setbacks`;
    }
    if (kind === "no-buildable-area") {
      return str(outcome?.reason) ?? "No buildable area remains after setbacks";
    }
    return kind ? `Buildable envelope (${kind})` : "Buildable envelope";
  }
  return null;
}

/**
 * Derive the accordion card model from a fetched atom body (defensive — a
 * missing field renders as an honest absence, never a fabricated value).
 */
export function deriveAtomCardModel(
  did: string,
  atom: Record<string, unknown>,
): AtomCardModel {
  const readContract = rec(atom.readContract);
  const axes = readContract ? rec(readContract.axes) : null;
  const asserted = axes ? confidenceFromAxis(axes.assertedConfidence) : null;
  const calibratedRaw = axes
    ? confidenceFromAxis(axes.calibratedConfidence)
    : null;
  // Earned-vs-asserted display downgrade (commitment #2 at the display layer):
  // a seed/asserted calibrated placeholder must not masquerade as earned.
  const calibrated =
    calibratedRaw && EARNED_PROVENANCE.has(calibratedRaw.basis)
      ? calibratedRaw
      : null;
  const reasoning = rec(atom.reasoningChain);
  const method =
    (reasoning ? str(reasoning.derivationMethod) : null) ??
    (reasoning && str(reasoning.reasoningKind) === "observed"
      ? "observed"
      : null);
  return {
    did,
    entityType: str(atom.entityType),
    claim: claimForAtom(atom),
    source: str(atom.sourceAdapter),
    method,
    sourceUrl: str(atom.sourceUrl),
    sourceCitation: str(atom.sourceCitation),
    confidence: asserted,
    calibrated,
    verification: asserted?.basis ?? "asserted",
    asOf: str(atom.asOf) ?? str(atom.extractedAt),
    capturedAt: str(atom.fetchedAt),
    accessPolicy: str(atom.accessPolicy),
  };
}

// ---------------------------------------------------------------------------
// Accordion controller (pure; ONE card open across the whole thread, with a
// lineage back-stack — the user walks envelope → setback → code IN PLACE).
// ---------------------------------------------------------------------------

export interface CitationCardState {
  /** Thread turn index the card is anchored under. */
  turnIndex: number;
  /** The tapped citation's did (stack[0]); BRIEF fallback content source. */
  anchorDid: string;
  /** Walk stack; the LAST entry is the did the card currently shows. */
  stack: string[];
}

/** Chip tap: toggle-close when re-tapping the open anchor, else open fresh. */
export function openCitationCard(
  current: CitationCardState | null,
  turnIndex: number,
  did: string,
): CitationCardState | null {
  if (
    current &&
    current.turnIndex === turnIndex &&
    current.anchorDid === did &&
    current.stack.length === 1
  ) {
    return null;
  }
  return { turnIndex, anchorDid: did, stack: [did] };
}

/** Lineage tap: swap the card to the related atom (push; ← back returns). */
export function pushLineage(
  current: CitationCardState | null,
  did: string,
): CitationCardState | null {
  if (!current) return null;
  if (current.stack[current.stack.length - 1] === did) return current;
  return { ...current, stack: [...current.stack, did] };
}

/** ← back: pop one step; at the anchor (depth 1) back closes nothing — no-op. */
export function popLineage(
  current: CitationCardState | null,
): CitationCardState | null {
  if (!current || current.stack.length <= 1) return current;
  return { ...current, stack: current.stack.slice(0, -1) };
}

/** The did the card currently displays. */
export function displayedDid(state: CitationCardState): string {
  return state.stack[state.stack.length - 1] ?? state.anchorDid;
}
