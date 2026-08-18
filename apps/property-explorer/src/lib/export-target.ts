// apps/property-explorer/src/lib/export-target.ts
//
// EXPORTS RESOLVE BY SHEET ID (invariant I1).
//
// Every export goes through here, and here is where the wrong-target class
// dies. Two defects from the 2026-08-18 QA pass are the whole reason:
//
//   - a flood/drainage report came back for parcel 48027:498770 while 498778
//     was selected, because the report panel held its own parcel id;
//   - a DXF export targeted "city of Bastrop", which was the text left in the
//     SEARCH BOX, while the sidebar displayed a different address.
//
// The rule this enforces: an export may only ever run against the current
// SUBJECT. A caller hands over the parcel it believes it is exporting; if that
// disagrees with the subject, the export is REFUSED rather than run against
// either candidate. A silent pick between two disagreeing targets is exactly
// how a report gets the wrong parcel, and the user cannot see it happen.
//
// The factSheetId travels with the request so the rendered artifact can print
// it. One PDF carrying two different sheet ids is then a defect the reader can
// see without us.

import type { DisplaySystem } from "@hauska/parcel-fact-sheet";
import { isPresent } from "@hauska/parcel-fact-sheet";
import { subjectStore } from "./subject-store";

export class ExportTargetError extends Error {
  readonly kind: "no-subject" | "target-mismatch";
  constructor(kind: ExportTargetError["kind"], message: string) {
    super(message);
    this.name = "ExportTargetError";
    this.kind = kind;
  }
}

export interface ExportTarget {
  /** What the export request is keyed on. */
  factSheetId: string;
  parcelNodeId: string;
  /** Sheet header display fields — read off the SHEET, never off a panel. */
  address: string | null;
  countyName: string;
  displaySystem: DisplaySystem;
}

/**
 * The export target for a parcel the caller believes is current.
 *
 * Throws when there is no subject, and when the caller's parcel is not the
 * subject's parcel. Both are programming or state-drift errors, and both must
 * be loud: the alternative is a correctly-formatted report about the wrong lot.
 */
export function resolveExportTarget(
  expectedParcelNodeId: string,
  displaySystem: DisplaySystem = "us",
): ExportTarget {
  const subject = subjectStore.current();
  if (!subject) {
    throw new ExportTargetError(
      "no-subject",
      "No property is selected — open a parcel before exporting.",
    );
  }
  const sheet = subject.sheet;
  if (sheet.identity.parcelNodeId !== expectedParcelNodeId) {
    throw new ExportTargetError(
      "target-mismatch",
      `Export target ${expectedParcelNodeId} is not the selected property ` +
        `(${sheet.identity.parcelNodeId}). Reselect the property and try again.`,
    );
  }
  return {
    factSheetId: sheet.factSheetId,
    parcelNodeId: sheet.identity.parcelNodeId,
    address: isPresent(sheet.identity.situsAddress)
      ? sheet.identity.situsAddress.value
      : null,
    countyName: sheet.identity.county.name,
    displaySystem,
  };
}

/**
 * The same target, or null instead of a throw, for a caller that renders an
 * honest disabled state rather than an error.
 */
export function exportTargetOrNull(
  expectedParcelNodeId: string,
  displaySystem: DisplaySystem = "us",
): ExportTarget | null {
  try {
    return resolveExportTarget(expectedParcelNodeId, displaySystem);
  } catch {
    return null;
  }
}
