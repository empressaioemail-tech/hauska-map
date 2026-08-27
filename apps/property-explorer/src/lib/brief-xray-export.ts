// Brief → X-ray PDF export — routes the brief panel through the SAME engine
// dossier assembler as Properties "Export X-ray PDF" (SHEET_STANDARD / dossier.ts),
// not the legacy Alder iframe print path.

import type { ResearchBriefPayload } from "../browse/brief-view-model";
import {
  assembleDossierExportBody,
  dossierExportNotice,
  requestDossierExport,
  type DossierExportClientResult,
} from "../workbench/tools/dossier-export";

export { dossierExportNotice };

export function xrayPdfFilename(parcelNodeId: string): string {
  return `${parcelNodeId.replace(":", "_")}_smart_site_xray.pdf`;
}

/** Download the inline or gated PDF bytes from a successful export result. */
export async function downloadDossierExportResult(
  result: Extract<DossierExportClientResult, { ok: true }>,
  parcelNodeId: string,
): Promise<void> {
  let blob: Blob;
  if (result.inlineDownload) {
    const bin = atob(result.inlineDownload.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    blob = new Blob([bytes], {
      type: result.inlineDownload.contentType || "application/pdf",
    });
  } else {
    const res = await fetch(result.downloadUrl, { credentials: "include" });
    if (!res.ok) {
      throw new Error(`X-ray download failed (${res.status}).`);
    }
    blob = await res.blob();
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = xrayPdfFilename(parcelNodeId);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportBriefAsXrayPdf(input: {
  parcelNodeId: string;
  brief: ResearchBriefPayload;
  facts?: { address: string | null; countyName: string | null } | null;
  /** Sheet verdict already on the brief panel. Omitted → fail closed. */
  verdictLine?: string | null;
}): Promise<DossierExportClientResult> {
  const body = assembleDossierExportBody({
    parcelNodeId: input.parcelNodeId,
    dossier: null,
    brief: input.brief,
    facts: input.facts ?? null,
    verdictLine: input.verdictLine,
  });
  return requestDossierExport(body);
}
