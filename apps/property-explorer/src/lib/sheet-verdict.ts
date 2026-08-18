// apps/property-explorer/src/lib/sheet-verdict.ts
//
// ONE headline, read by every surface (invariant I2).
//
// Four composers used to exist — `brief-verdict.ts`, `share-verdict.ts`, the
// verdict half of `compare-facts.ts`, and the brief view-model's — each reading
// a different payload shape, and they disagreed. They are deleted. This module
// is the app-side seam onto the single composer in the fact-sheet package: the
// sheet already carries its composed `verdict`, so nothing here composes
// anything, it only locates the sheet.

import { useEffect, useState } from "react";
import {
  composeVerdictTone,
  type ParcelFactSheet,
  type VerdictTone,
} from "@hauska/parcel-fact-sheet";
import { factSheetResolver } from "./fact-sheet-resolver";
import { subjectStore } from "./subject-store";

export interface SheetVerdict {
  line: string;
  tone: VerdictTone;
}

/**
 * The honest placeholder for a surface whose parcel has not resolved a sheet.
 * It is deliberately NOT a verdict: an unresolved parcel has no headline, and
 * inventing a neutral one is how "no red flags" gets said unearned.
 */
export const VERDICT_UNRESOLVED: SheetVerdict = {
  line: "This property has not resolved a fact sheet yet.",
  tone: "caution",
};

export function verdictFromSheet(sheet: ParcelFactSheet): SheetVerdict {
  // The sheet's own sealed sentence — composed once, at resolve.
  return { line: sheet.verdict, tone: composeVerdictTone(sheet) };
}

/** The verdict for a parcel IF it is the current subject, else null. Sync. */
export function verdictFromSubject(
  parcelNodeId: string | null | undefined,
): SheetVerdict | null {
  const subject = subjectStore.current();
  if (!subject) return null;
  if (parcelNodeId && subject.sheet.identity.parcelNodeId !== parcelNodeId) {
    return null;
  }
  return verdictFromSheet(subject.sheet);
}

/**
 * The verdict for a parcel, from the subject when it is the subject and from
 * the resolver otherwise (a share landing renders a parcel the viewer never
 * searched for). Null until it lands; the caller renders VERDICT_UNRESOLVED.
 */
export function useSheetVerdict(
  parcelNodeId: string | null | undefined,
): SheetVerdict | null {
  const [verdict, setVerdict] = useState<SheetVerdict | null>(() =>
    verdictFromSubject(parcelNodeId),
  );

  useEffect(() => {
    let cancelled = false;
    const fromSubject = verdictFromSubject(parcelNodeId);
    if (fromSubject) {
      setVerdict(fromSubject);
      return;
    }
    setVerdict(null);
    if (!parcelNodeId) return;
    void factSheetResolver
      .resolve(parcelNodeId)
      .then((sheet) => {
        if (!cancelled) setVerdict(verdictFromSheet(sheet));
      })
      .catch(() => {
        /* honest absence — the caller renders the unresolved placeholder */
      });
    return () => {
      cancelled = true;
    };
  }, [parcelNodeId]);

  return verdict;
}
