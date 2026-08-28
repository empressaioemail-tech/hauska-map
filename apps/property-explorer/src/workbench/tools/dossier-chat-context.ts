// apps/property-explorer/src/workbench/tools/dossier-chat-context.ts
//
// YOUR OWN WORK, as chat context: the reports you have generated across your
// account, and your notes on the property in front of you.
//
// TWO CORRECTIONS FROM THE FIRST CUT, both mine:
//
// 1. IT WENT OUT ON THE WRONG CHANNEL AND NEVER LEFT THE BROWSER. The first
//    version hung the context on `ChatSubjectContext`. The request body is
//    built from an explicit ALLOWLIST (chat-research.ts `areaContext.subject`
//    names its fields one by one), so an unknown field is dropped before the
//    fetch — and the backend has a strict schema besides, as the "no
//    mapContext" note there records. It was a dormant mechanism: correct-
//    looking code that reached nothing. It now rides the MESSAGE BLOCK, which
//    is the transport chat-attach.ts already proved: the backend passes the
//    message to the model verbatim.
//
// 2. IT WAS PER-PARCEL, AND THE ASK WAS ACCOUNT-WIDE. "The reports generated
//    in my account" means every property, not the one on screen. Reports are
//    account-scoped here; NOTES stay scoped to the property in view, because a
//    note about another parcel is noise in a conversation about this one.
//
// THE HONESTY LINE THAT SHAPES ALL OF IT: we know WHICH reports exist. We do
// not know what they SAY. A DossierExportEntry is { kind, format, savedAt } —
// a filing record. The reports are PDFs nobody extracted. The block therefore
// states what was generated and when, and tells the model in the same breath
// that the contents were not read and must not be characterised. Attaching a
// report through the paperclip remains the way to make its contents readable,
// because that path actually extracts text.
//
// TENANT-PRIVATE: this hands users their own filing records and their own
// notes back inside their own session. Nothing here pools anywhere.

import type { PropertyDossier } from "../../lib/propertyDossier";
import {
  listSavedProperties,
  type SavedPropertyRow,
} from "../../lib/savedPropertiesClient";

/** A generated artifact, named, dated, and located — never its contents. */
export interface ChatUserReport {
  kind: string;
  format: string;
  savedAt: string;
  address: string | null;
  parcelNodeId: string;
  /** True when this report belongs to the property currently in view. */
  isThisProperty: boolean;
}

export interface ChatUserWork {
  /** Every report generated across the account, newest first. */
  reports: ChatUserReport[];
  /** Notes on the property in view only. */
  notes: string | null;
  /** Status of the property in view (Researching / Offer / Passed). */
  status: string | null;
}

const MAX_REPORTS = 25;

function labelForKind(kind: string): string {
  if (kind === "flood-drainage") return "Flood & drainage report";
  if (kind === "xray") return "X-ray report";
  if (kind === "site-plan") return "Site plan export";
  if (kind === "terrain") return "Terrain export";
  return kind;
}

/**
 * Build the user's work context from their saved rows. Pure.
 *
 * Returns null when there is nothing of theirs to report — an empty block is
 * worse than none, because it invites the model to discuss an absence as
 * though it were a finding.
 */
export function chatUserWorkFrom(
  rows: readonly SavedPropertyRow[],
  activeParcelNodeId: string | null,
): ChatUserWork | null {
  const reports: ChatUserReport[] = [];
  let notes: string | null = null;
  let status: string | null = null;

  for (const row of rows) {
    const dossier: PropertyDossier | null = row.snapshot ?? null;
    if (!dossier) continue;
    const isThisProperty = row.parcelNodeId === activeParcelNodeId;
    if (isThisProperty) {
      notes = dossier.notes?.trim() || null;
      status = dossier.status?.trim() || null;
    }
    for (const e of dossier.exports ?? []) {
      if (!e || typeof e.kind !== "string" || typeof e.savedAt !== "string") {
        continue;
      }
      reports.push({
        kind: e.kind,
        format: e.format,
        savedAt: e.savedAt,
        address: dossier.address?.trim() || null,
        parcelNodeId: row.parcelNodeId,
        isThisProperty,
      });
    }
  }

  reports.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const capped = reports.slice(0, MAX_REPORTS);

  if (capped.length === 0 && !notes && !status) return null;
  return { reports: capped, notes, status };
}

/**
 * Render the block that goes INTO the message. This is the transport that
 * actually reaches the model; see the header note.
 */
export function composeMessageWithUserWork(
  message: string,
  work: ChatUserWork | null,
): string {
  if (!work) return message;

  const lines: string[] = [];

  if (work.reports.length > 0) {
    const mine = work.reports.filter((r) => r.isThisProperty);
    const other = work.reports.filter((r) => !r.isThisProperty);
    lines.push(
      `--- REPORTS THIS USER HAS GENERATED (${work.reports.length}) ---`,
    );
    if (mine.length > 0) {
      lines.push("On the property currently in view:");
      for (const r of mine) {
        lines.push(`  - ${labelForKind(r.kind)} (${r.format}), ${r.savedAt.slice(0, 10)}`);
      }
    }
    if (other.length > 0) {
      lines.push("On other properties in their account:");
      for (const r of other) {
        lines.push(
          `  - ${labelForKind(r.kind)} (${r.format}), ${r.savedAt.slice(0, 10)} — ${
            r.address ?? r.parcelNodeId
          }`,
        );
      }
    }
    lines.push(
      "These are FILING RECORDS: each report was generated on the date shown. Their CONTENTS were not read and are not available to you. You may confirm which reports exist and when they were run. You must NOT state or imply what any report concluded, found, or recommended. If asked what a report says, say plainly that you can see it was generated but cannot read it, and that attaching it will let you.",
    );
  }

  if (work.notes) {
    lines.push("");
    lines.push("--- THIS USER'S OWN NOTES ON THE PROPERTY IN VIEW ---");
    lines.push(work.notes);
    lines.push("(Their own words, not a source of record.)");
  }

  if (work.status) {
    lines.push("");
    lines.push(`--- THEIR STATUS ON THIS PROPERTY: ${work.status} ---`);
  }

  return [
    "The following is the user's OWN work in this product — what they have generated and written. Treat it as their private context, never as municipal code or a source of record.",
    "",
    lines.join("\n"),
    "",
    `User question: ${message}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Account-wide cache — one list read per session. The saved-properties list is
// the same call the Reports library already makes.
// ---------------------------------------------------------------------------

let workCache: Promise<readonly SavedPropertyRow[]> | null = null;

/**
 * The user's saved rows. Empty on sign-out, on an unreachable service, or on
 * any error — every one of those is an honest "there is nothing of yours I can
 * see", and all resolve to no context block rather than a wrong one.
 */
export function getChatUserRows(
  lister: typeof listSavedProperties = listSavedProperties,
): Promise<readonly SavedPropertyRow[]> {
  if (workCache) return workCache;
  workCache = lister()
    .then((outcome) => (outcome.kind === "ready" ? outcome.items : []))
    .catch(() => []);
  return workCache;
}

/** Drop the cache after a save or an export, so the next send is current. */
export function invalidateChatUserWork(): void {
  workCache = null;
}
