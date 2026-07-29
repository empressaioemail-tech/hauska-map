// WB6 — EXPORTS ATTACH TO THE PROPERTY: when a site-plan/terrain export
// succeeds in the Reports tool AND the property is saved, an exports[] entry
// (kind / format / savedAt / the EXISTING gated re-download path) is appended
// to the dossier automatically — no extra click, deduped by kind+format with
// latest wins. Bytes are NEVER stored in the snapshot (no base64, no blobs);
// the download path is the same BFF GET the reports tool already uses.

import {
  updatePropertyDossier,
  type DossierUpdateOutcome,
} from "../../lib/savedPropertiesClient";
import {
  upsertExportEntry,
  type DossierExportEntry,
  type DossierExportKind,
} from "../../lib/propertyDossier";

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
