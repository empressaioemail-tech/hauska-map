/**
 * P-340 — the R-1 conflict row: when the sources that can supply a parcel's
 * setbacks DISAGREE and at least one of them states no readable effective
 * date, both candidates are served and neither is settled.
 *
 * THE RULING THIS IMPLEMENTS. MOST-CURRENT SOURCE WINS (operator 2026-09-11):
 * "an unreadable date produces a conflict row with both values, never a
 * silent pick." The resolver (`@empressaio/setback-corpus/resolve`) has
 * returned that conflict since P-154 — `ConflictSetback`, every candidate
 * unmodified — but no surface served it, so a customer saw one number and no
 * way to learn a second source disagreed. This module is the served shape.
 *
 * WHY IT REUSES THE P-270 VOCABULARY RATHER THAN INVENTING ONE. The vintage
 * question ("could this citation's date be read at source?") and the conflict
 * question ("do two sources disagree?") are two questions about the same two
 * facts, and the P-270 module already fixed the vocabulary for the first:
 * `SetbackDateUnreadableState` names WHICH unreadable cause applies, and
 * `SETBACK_CITATION_VINTAGE_UNREADABLE_NOTE` is the one customer sentence for
 * all of them, byte-pinned across hauska-map and legacy-design-tools. This
 * row carries that same `state` member (never a parallel enum) so an
 * instrument switching on the cause reads one vocabulary; the conflict
 * sentence is a SEPARATE pinned literal because it says a different thing
 * (two sources, both served, neither settled) and re-using the vintage
 * sentence for it would tell a customer the vintage is unknown while the real
 * news is that two sources disagree.
 *
 * ONE MODULE, TWO REPOS. The route's copy lives at
 * `artifacts/api-server/src/lib/buildableEnvelope/setbackSourceConflict.ts`.
 * The row shape is structural, not a shared class, so neither repo imports the
 * other.
 *
 * WHAT THE PAIR OF PINS PROVES, AND WHAT IT DOES NOT. Each repo's suite pins
 * its OWN copy of the sentence against a literal typed into the same repo. That
 * is a LOCAL pin and an early warning only — it does not by itself catch a
 * one-sided edit whose author also updates that repo's literal, which is
 * exactly the false comfort P-331 corrected in the P-270 pair. The cross-repo
 * half is `scripts/check-cross-repo-literal-drift.mjs` (P-331), which reads
 * both DEFINING modules and compares them byte for byte. It does NOT yet carry
 * a row for this literal — the row is named in P-340's close, to be added once
 * both copies exist on both mains, because a row that reads a file the sibling
 * main does not have yet REFUSES (exit 2) on every PR. Until that row lands,
 * this literal's cross-repo comparison is a NAMED BYPASS of the drift check,
 * not a covered case.
 */

import {
  stateFromWireBasis,
  type SetbackDateUnreadableState,
} from "./setback-citation-vintage.js";

/** The wire token this row is published under (VOCABULARY). */
export const SETBACK_SOURCE_CONFLICT_TOKEN = "setback-source-conflict" as const;

/**
 * THE exact customer sentence. Byte-identical to legacy-design-tools'
 * `artifacts/api-server/src/lib/buildableEnvelope/setbackSourceConflict.ts`
 * copy; a test in EACH repo pins the literal so a drift fails a test.
 *
 * It names the consequence (two sources, both served, neither settled)
 * instead of the cause — the machine-readable `state` and `candidates` on the
 * same row carry the cause — and it closes with the same
 * verify-with-the-city instruction the P-270 sentence and the envelope's
 * geometry disclosure already give, so the card never teaches two different
 * next steps.
 */
export const SETBACK_SOURCE_CONFLICT_NOTE =
  "Setback sources disagree on this parcel and at least one source's effective date could not be read at source — both candidates are served and neither is settled. Verify with the city.";

export type SetbackSourceConflictKind =
  | "codified-ordinance"
  | "gis-per-parcel"
  | "atom-chain";

export type SetbackSourceConflictCandidate = {
  sourceKind: SetbackSourceConflictKind;
  /** The source as the resolver knows it (table jurisdiction or atom citation). */
  sourceLabel: string;
  scalars: {
    front_ft: number;
    side_ft: number;
    rear_ft: number;
    side_corner_ft?: number;
  };
  /** ISO yyyy-mm-dd read at source, or null when it could not be read. */
  sourceDate: string | null;
  /** The corpus resolver's own basis vocabulary (never re-spelled here). */
  dateBasis: string;
};

/**
 * The conflict row, published next to the served envelope so a reader (human
 * or instrument) that holds the four-tuple can always ask whether a second
 * source disagreed, and see both values, without parsing disclosure prose.
 */
export type SetbackSourceConflictRow = {
  kind: typeof SETBACK_SOURCE_CONFLICT_TOKEN;
  /** WHICH unreadable cause keeps this disagreement unsettled — the P-270 member, never a second enum. */
  state: SetbackDateUnreadableState;
  /** The resolver's own sentence, echoed verbatim for the machine audience. */
  reason: string;
  /** Every disagreeing candidate, unmodified — the ruling's "both values". */
  candidates: SetbackSourceConflictCandidate[];
  /** The exact sentence every surface prints. Byte-identical across repos. */
  note: string;
};

/**
 * The P-270 unreadable cause this conflict is unsettled by: the FIRST
 * candidate whose own date could not be read, falling back to the winner's.
 * A conflict always involves at least one unreadable date — a disagreement
 * between two READABLE dates is settled by most-current-wins, not declared —
 * but it is not always the winner's, so the row names the right one.
 *
 * `stateFromWireBasis` is the P-270 mapper and is reused rather than
 * duplicated: the resolver's `"unreadable"` basis is the source stating it
 * carries no readable date (`unreadable-absent-at-source`), and a basis
 * absent entirely is the `never-looked` case.
 *
 * P-340: byte-for-byte the same function as legacy-design-tools'
 * `setbackSourceConflict.ts` copy — the two copies are one rule, and the
 * conflict STATE must not be spelled two ways any more than the sentence may.
 */
export function setbackSourceConflictUnreadableState(resolution: {
  dateBasis: string;
  conflict?: {
    candidates: ReadonlyArray<{ sourceDate: string | null; dateBasis: string }>;
  };
} | null): SetbackDateUnreadableState {
  const unreadable = resolution?.conflict?.candidates.find(
    (c) => c.sourceDate == null,
  );
  const state = stateFromWireBasis(unreadable?.dateBasis ?? resolution?.dateBasis).state;
  return state === "read" || state === "future-effective"
    ? "unreadable-absent-at-source"
    : state;
}

/**
 * Compose the row from the resolver's conflict plus the unreadable cause.
 * Returns null when there is no conflict — an agreeing pair (even an undated
 * agreeing pair) is not a conflict, and a row served for it would teach a
 * customer to distrust a value the sources agree on.
 */
export function setbackSourceConflictRow(input: {
  conflict:
    | {
        reason: string;
        candidates: ReadonlyArray<SetbackSourceConflictCandidate>;
      }
    | null
    | undefined;
  state: SetbackDateUnreadableState;
}): SetbackSourceConflictRow | null {
  const conflict = input.conflict;
  if (!conflict || conflict.candidates.length < 2) return null;
  return {
    kind: SETBACK_SOURCE_CONFLICT_TOKEN,
    state: input.state,
    reason: conflict.reason,
    candidates: conflict.candidates.map((c) => ({ ...c, scalars: { ...c.scalars } })),
    note: SETBACK_SOURCE_CONFLICT_NOTE,
  };
}

/** The row this card's own resolution would publish, or null. */
export function sourceConflictRowForResolution(
  resolution: {
    dateBasis: string;
    conflict?: {
      reason: string;
      candidates: ReadonlyArray<SetbackSourceConflictCandidate>;
    };
  } | null,
): SetbackSourceConflictRow | null {
  return setbackSourceConflictRow({
    conflict: resolution?.conflict ?? null,
    state: setbackSourceConflictUnreadableState(resolution),
  });
}

/**
 * Append the conflict sentence to whatever disclosure the envelope already
 * carries. Returns the disclosure unchanged when there is no row, so a caller
 * can call this unconditionally and a payload with no conflict is
 * byte-identical to what it was before this lane.
 */
export function disclosureWithSourceConflict(
  disclosure: string | null | undefined,
  row: SetbackSourceConflictRow | null,
): string | undefined {
  const existing = typeof disclosure === "string" ? disclosure.trim() : "";
  if (!row) return existing ? existing : undefined;
  return existing ? `${existing} ${row.note}` : row.note;
}
