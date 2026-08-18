// apps/property-explorer/src/lib/subject-store.ts
//
// THE SINGLE SUBJECT (invariant I1) — the most important thing in this lane.
//
// The search input, the inspect card, the compare panel, every export panel and
// Command Center READ this. Nothing else holds a parcel target.
//
// It exists because the search box and the selected parcel were SEPARATE
// states, so a drainage report came back for parcel 48027:498770 when 498778
// was selected, and a DXF export targeted "city of Bastrop" typed in the search
// box while the sidebar displayed an address. A panel that keeps its own copy
// of "which parcel" will eventually answer for a different one.
//
// The store holds a SEALED ParcelFactSheet, never a query string and never a
// bare parcel id: a subject that carries only an id would leave each consumer
// to look the rest up, which is the very re-derivation invariant I2 forbids.

import type { Subject, SubjectStore } from "@hauska/parcel-fact-sheet";
import {
  factSheetResolver,
  type PeFactSheetResolver,
} from "./fact-sheet-resolver";

class PeSubjectStore implements SubjectStore {
  private subject: Subject | null = null;
  private readonly listeners = new Set<(s: Subject | null) => void>();

  current(): Subject | null {
    return this.subject;
  }

  set(subject: Subject): void {
    this.subject = subject;
    this.emit();
  }

  clear(): void {
    if (this.subject === null) return;
    this.subject = null;
    this.emit();
  }

  subscribe(fn: (s: Subject | null) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** The current subject's sheet id, or null. What every export takes. */
  currentSheetId(): string | null {
    return this.subject?.sheet.factSheetId ?? null;
  }

  /** The current subject's parcel node id, or null. */
  currentParcelNodeId(): string | null {
    return this.subject?.sheet.identity.parcelNodeId ?? null;
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn(this.subject);
  }
}

/** The app's ONE subject store. */
export const subjectStore = new PeSubjectStore();

/**
 * Resolve a parcel and make it the subject, in one step. Every entry point —
 * search pick, raw submit, map click, deep link, share landing, saved-property
 * reopen, compare — goes through HERE, so the subject and whatever the user is
 * looking at can never drift apart.
 */
export async function setSubjectByParcelNodeId(
  parcelNodeId: string,
  origin: Subject["origin"],
  resolver: PeFactSheetResolver = factSheetResolver,
): Promise<Subject> {
  const sheet = await resolver.resolve(parcelNodeId);
  const subject: Subject = { sheet, origin };
  subjectStore.set(subject);
  return subject;
}
