// WB6 — EXPORTS ATTACH TO THE PROPERTY: when a site-plan/terrain export
// succeeds in the Reports tool AND the property is saved, an exports[] entry
// (kind / format / savedAt / the EXISTING gated re-download path) is appended
// to the dossier automatically — no extra click, deduped by kind+format with
// latest wins. Bytes are NEVER stored in the snapshot (no base64, no blobs);
// the download path is the same BFF GET the reports tool already uses.

import {
  listSavedProperties,
  savePropertyWithDossier,
  updatePropertyDossier,
  type DossierUpdateOutcome,
  type SavedPropertiesListOutcome,
  type SavedPropertyMutationOutcome,
  type SavedPropertyRow,
} from "../../lib/savedPropertiesClient";
import {
  upsertExportEntry,
  type DossierExportEntry,
  type DossierExportKind,
  type PropertyDossier,
} from "../../lib/propertyDossier";

/** Reports auto-save the property (W3.2). Exports do not. */
export function isAutoSaveReportKind(kind: DossierExportKind): boolean {
  return kind === "xray" || kind === "flood-drainage";
}

export function isPdfExportFormat(format: string): boolean {
  return /pdf/i.test(format);
}

export interface FiledReportRow {
  parcelNodeId: string;
  address: string;
  kind: DossierExportKind;
  format: string;
  savedAt: string;
  downloadPath: string;
}

/** Flatten saved-property exports into a library list (newest first). */
export function filedReportsFromSaved(items: SavedPropertyRow[]): FiledReportRow[] {
  const out: FiledReportRow[] = [];
  for (const row of items) {
    const address =
      row.snapshot?.address?.trim() ||
      row.label?.trim() ||
      row.parcelNodeId;
    for (const entry of row.snapshot?.exports ?? []) {
      const path = entry.downloadPath?.trim();
      if (!path) continue;
      out.push({
        parcelNodeId: row.parcelNodeId,
        address,
        kind: entry.kind,
        format: entry.format,
        savedAt: entry.savedAt,
        downloadPath: path,
      });
    }
  }
  return out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
}

/** The slice of an export BFF response the dossier entry needs. */
export interface ExportResultLike {
  selectedFormat: string;
  downloadUrl?: string | null;
  downloads?: Record<string, string | null> | null;
}

/** Map an export success to a dossier entry — the RE-DOWNLOAD path, never bytes. */
export function exportEntryFromResult(
  kind: DossierExportKind,
  result: ExportResultLike,
  now: () => string = () => new Date().toISOString(),
): DossierExportEntry {
  const path =
    result.downloads?.[result.selectedFormat] ?? result.downloadUrl ?? null;
  return {
    kind,
    format: result.selectedFormat,
    savedAt: now(),
    // Guard: a data:/base64 payload is bytes, not a path — store honest null.
    downloadPath: path && !path.startsWith("data:") ? path : null,
  };
}

/**
 * Fire the auto-attach. `not-saved` is a SILENT no-op by design (the export
 * succeeded for an unsaved property — nothing to attach to, nothing to nag
 * about); other failures are returned for optional surfacing.
 */
export async function attachExportToDossier(
  parcelNodeId: string,
  kind: DossierExportKind,
  result: ExportResultLike,
  deps: {
    update?: (
      parcelNodeId: string,
      patch: Parameters<typeof updatePropertyDossier>[1],
    ) => Promise<DossierUpdateOutcome>;
    now?: () => string;
  } = {},
): Promise<DossierUpdateOutcome> {
  const update = deps.update ?? updatePropertyDossier;
  const entry = exportEntryFromResult(kind, result, deps.now);
  return update(parcelNodeId, (current) => ({
    exports: upsertExportEntry(current.exports, entry),
  }));
}

/**
 * File a completed report on the property. Flood and X-ray auto-save an
 * unsaved parcel first, then attach. Site-plan / terrain stay a silent
 * no-op when the property is not saved.
 */
export async function fileReportOnProperty(
  parcelNodeId: string,
  kind: DossierExportKind,
  result: ExportResultLike,
  seed: {
    label?: string | null;
    address?: string | null;
    drawings?: PropertyDossier["drawings"];
    pin?: PropertyDossier["pin"];
  } = {},
  deps: {
    list?: () => Promise<SavedPropertiesListOutcome>;
    save?: (
      parcelNodeId: string,
      seed: {
        label?: string | null;
        address?: string | null;
        drawings?: PropertyDossier["drawings"];
        pin?: PropertyDossier["pin"];
      },
    ) => Promise<SavedPropertyMutationOutcome>;
    update?: (
      parcelNodeId: string,
      patch: Parameters<typeof updatePropertyDossier>[1],
    ) => Promise<DossierUpdateOutcome>;
    now?: () => string;
  } = {},
): Promise<DossierUpdateOutcome> {
  const list = deps.list ?? (() => listSavedProperties());
  const save = deps.save ?? savePropertyWithDossier;
  const listed = await list();
  if (listed.kind !== "ready") return listed;
  const existing = listed.items.find((r) => r.parcelNodeId === parcelNodeId);
  if (!existing && isAutoSaveReportKind(kind)) {
    const saved = await save(parcelNodeId, seed);
    if (saved.kind !== "ok") return saved;
  }
  return attachExportToDossier(parcelNodeId, kind, result, {
    update: deps.update,
    now: deps.now,
  });
}
