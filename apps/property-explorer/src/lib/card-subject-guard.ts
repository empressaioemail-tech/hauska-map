// apps/property-explorer/src/lib/card-subject-guard.ts
//
// P-218 — THE CARD FOLLOWS THE SUBJECT, ALWAYS.
//
// Production, 2026-09-15: a search for 48209:97652 rendered a property brief
// titled "Parcel 97651" while the SUBJECT (subject-store.ts) had already
// sealed correctly to 97652 — proven by the Reports and Exports panel's own
// refusal, which compares the card's id against the subject and correctly
// caught the disagreement: "Export target 48209:97651 is not the selected
// property (48209:97652)." The refusal is the system catching itself
// DOWNSTREAM; by the time it fires, the wrong brief has already rendered and
// the customer has read it.
//
// subject-store.ts's own generation guard (subjectWriteGeneration) is
// thoroughly proven never to let a slower, earlier resolve overwrite a later
// one (subject-store.test.ts, "does not let a slower earlier resolve
// overwrite a later call"). The CARD the customer actually reads is
// maintained separately, by five different call sites in ExplorerMap.tsx
// (search-pending, search-sealed, and three map-click paths), each with its
// own ad hoc staleness guard (lookupIntentRef, or a direct inspectedRef
// comparison inside adoptSubject's callback). No code path RECONCILES the
// two once they disagree — a gap in any ONE of those guards (present or
// future) leaves the card pointed at a stale parcel forever while the
// subject is already correct, which is exactly the observed defect's shape.
//
// The fix is not one more ad hoc guard at a sixth call site: it is to make
// the card a PROJECTION of the subject BY CONSTRUCTION, completing this
// repo's own stated intent ("the card RENDERS the sheet — it is a
// projection, not a re-lookup", ExplorerMap.tsx) as an enforced invariant
// rather than a convention every call site must remember. This module is
// that projection, extracted so it is unit-testable without a map or a DOM;
// ExplorerMap.tsx subscribes to subjectStore and applies it on every change.

import type { ParcelFactSheet, Subject } from "@empressaio/parcel-fact-sheet";
import type { ParcelCardData } from "../browse/liveGis";

export interface ReconcileCardInput {
  /** The parcel node id the currently-rendered card claims to be about, or
   *  null when nothing has been inspected yet. */
  inspectedParcelNodeId: string | null;
  /** The inspected card's own address, kept as the heading fallback when the
   *  sealed sheet's county record carries none — same reasoning
   *  cardFromSheetWithSearchFallback already applies at every other seal. */
  fallbackAddress: string | null;
  /** The current subject, or null when none is sealed yet. */
  subject: Subject | null;
  /** Builds a card from a sealed sheet. Injected so this stays a pure unit
   *  independent of sheet-to-card.ts's own shape. */
  buildCard: (
    sheet: ParcelFactSheet,
    fallbackAddress: string | null,
  ) => ParcelCardData;
}

export interface CardReconciliation {
  parcelNodeId: string;
  card: ParcelCardData;
}

/**
 * What the rendered card must become to agree with the subject, or null when
 * they already agree. A null subject is never a reason to blank an inspected
 * card (AMENDMENT 1 in subject-store.ts: an unplaceable or not-yet-sealed
 * subject leaves the previous inspection standing), so this only ever ACTS
 * when there is a real, sealed subject the card disagrees with.
 */
export function reconcileCardWithSubject(
  input: ReconcileCardInput,
): CardReconciliation | null {
  const { inspectedParcelNodeId, fallbackAddress, subject, buildCard } = input;
  if (!subject) return null;
  const subjectId = subject.sheet.identity.parcelNodeId;
  if (inspectedParcelNodeId === subjectId) return null;
  return {
    parcelNodeId: subjectId,
    card: buildCard(subject.sheet, fallbackAddress),
  };
}
