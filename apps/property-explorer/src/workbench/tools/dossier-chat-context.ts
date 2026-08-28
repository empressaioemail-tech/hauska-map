// apps/property-explorer/src/workbench/tools/dossier-chat-context.ts
//
// YOUR OWN WORK ON THIS PROPERTY, as chat context.
//
// The chat could answer about the parcel but not about what the USER had done
// with it: "can you read the reports I have generated for this property" got
// an honest no. Everything needed was already saved — PropertyDossier carries
// `notes`, `exports[]`, and `status` per property — the chat simply never read
// it.
//
// TWO HONESTY RULES, and the first is the whole design:
//
// 1. WE KNOW WHICH REPORTS EXIST. WE DO NOT KNOW WHAT THEY SAY.
//    A DossierExportEntry is { kind, format, savedAt, downloadPath } — a
//    filing record, not content. The reports are PDFs nobody extracted. So
//    this context states that a flood report was generated on a date, and says
//    plainly that its contents were not read. The model must be able to say
//    "you generated a flood study on 28 Aug" and must NOT be able to say what
//    the flood study concluded. Attaching a report through the paperclip is
//    still the way to make its contents readable — that path extracts text and
//    says so.
//
// 2. NOTES ARE THE USER'S OWN WORDS and are passed verbatim, capped. They are
//    TENANT-PRIVATE: this hands a user their own note back inside their own
//    session, and nothing here pools into a shared or public layer.

import type { PropertyDossier } from "../../lib/propertyDossier";
import { getSavedProperty } from "../../lib/savedPropertiesClient";

/** A generated artifact, named and dated — never its contents. */
export interface ChatDossierExport {
  kind: string;
  format: string;
  savedAt: string;
}

export interface ChatDossierContext {
  /** The user's own notes on this property, verbatim (capped upstream at 4k). */
  notes: string | null;
  /** Researching / Offer / Passed, when they set one. */
  status: string | null;
  /** What has been generated, newest first. Filing records only. */
  exports: ChatDossierExport[];
  /**
   * Stated to the model so it cannot mistake a filing record for a finding.
   * Absent when there is nothing to be careful about.
   */
  contentsNote: string | null;
}

const MAX_EXPORTS = 12;

/** Newest first, so a truncated list keeps the relevant end. */
function byNewest(a: ChatDossierExport, b: ChatDossierExport): number {
  return b.savedAt.localeCompare(a.savedAt);
}

/**
 * Build the chat context from a saved dossier. Pure.
 *
 * Returns null when the property has nothing the user contributed — an empty
 * context block is worse than none, because it invites the model to talk about
 * an absence as though it were a finding.
 */
export function chatDossierContextFrom(
  dossier: PropertyDossier | null | undefined,
): ChatDossierContext | null {
  if (!dossier) return null;

  const notes = dossier.notes?.trim() || null;
  const status = dossier.status?.trim() || null;

  const exports: ChatDossierExport[] = (dossier.exports ?? [])
    .filter((e) => e && typeof e.kind === "string" && typeof e.savedAt === "string")
    .map((e) => ({
      kind: e.kind,
      format: e.format,
      savedAt: e.savedAt,
    }))
    .sort(byNewest)
    .slice(0, MAX_EXPORTS);

  if (!notes && !status && exports.length === 0) return null;

  return {
    notes,
    status,
    exports,
    contentsNote:
      exports.length > 0
        ? "These are filing records: the report was generated on the date shown. Its CONTENTS were not read and are not available here — do not state what any report concluded. To reason from a report's contents, the user must attach it."
        : null,
  };
}

/** Mirrors attachRecordsToChatSubject: additive, never mutating. */
export function attachDossierToChatSubject<T extends object>(
  subject: T,
  dossier: ChatDossierContext | null | undefined,
): T & { userWork?: ChatDossierContext } {
  if (!dossier) return subject;
  return { ...subject, userWork: dossier };
}

// ---------------------------------------------------------------------------
// Per-property cache — one read per parcel per session, mirroring the records
// context cache. A chat send must never wait on a list fetch it already did.
// ---------------------------------------------------------------------------

const dossierCache = new Map<string, Promise<PropertyDossier | null>>();

/**
 * The saved dossier for a parcel, or null when the property is not saved,
 * the user is signed out, or the read failed. Every one of those is a real
 * "there is nothing of yours here" and resolves the same way: no context
 * block, rather than an empty one.
 */
export function getChatPropertyDossier(
  parcelNodeId: string,
  fetcher: typeof getSavedProperty = getSavedProperty,
): Promise<PropertyDossier | null> {
  const cached = dossierCache.get(parcelNodeId);
  if (cached) return cached;
  const pending = fetcher(parcelNodeId)
    .then((outcome) =>
      outcome.kind === "found" ? (outcome.row.snapshot ?? null) : null,
    )
    .catch(() => null);
  dossierCache.set(parcelNodeId, pending);
  return pending;
}

/** Drop the cache for a parcel after a dossier write, so the next send is current. */
export function invalidateChatPropertyDossier(parcelNodeId: string): void {
  dossierCache.delete(parcelNodeId);
}
