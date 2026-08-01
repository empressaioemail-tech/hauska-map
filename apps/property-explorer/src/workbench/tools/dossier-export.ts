// DOSSIER PDF export — client assembly + request (engine #174 wiring).
//
// The "Export dossier PDF" action in the dossier DETAIL view. The ENGINE
// assembles the document; this module only gathers what the property already
// holds and forwards it:
//   - verdictLine: composed DETERMINISTICALLY by the existing brief-verdict
//     composer over the live R1 brief payload (no LLM, no fabrication);
//   - brief facts: the R1 brief flattened through the EXISTING view-model
//     derivation (deriveBriefViewModel) — every fact keeps its label, value,
//     source, and vintage; honest-absent sections are OMITTED (the engine
//     renders absence honestly);
//   - chatSummary + notes: from the saved dossier snapshot;
//   - address: dossier address (save-time) or the active-parcel facts.
// Anything unavailable is honestly omitted — the engine renders "not on
// file" chips, never invented content.

import { composeBriefVerdict } from "../../browse/brief-verdict";
import {
  deriveBriefViewModel,
  type ResearchBriefPayload,
} from "../../browse/brief-view-model";
import type { PropertyDossier } from "../../lib/propertyDossier";

export interface DossierExportBriefFact {
  label: string;
  value?: string;
  source?: string;
  vintage?: string;
}

export interface DossierExportBriefSection {
  id: string;
  title: string;
  facts: DossierExportBriefFact[];
}

export interface DossierExportRequestBody {
  parcelNodeId: string;
  address?: string;
  countyName?: string;
  verdictLine?: string;
  brief?: { sections: DossierExportBriefSection[] };
  chatSummary?: { summary: string; savedAt: string; disclaimer?: string };
  notes?: string;
}

/**
 * Flatten the R1 brief payload into the engine's dossier brief shape via the
 * EXISTING view-model derivation (one flattening truth — the dossier PDF
 * carries the same facts the brief panel renders). Absent sections drop.
 */
export function flattenBriefForDossier(
  payload: ResearchBriefPayload,
): { sections: DossierExportBriefSection[] } | undefined {
  const vm = deriveBriefViewModel(payload);
  const sections: DossierExportBriefSection[] = [];
  for (const section of vm.sections) {
    if (section.kind !== "facts" || section.facts.length === 0) continue;
    sections.push({
      id: section.id,
      title: section.title,
      facts: section.facts.map((fact) => ({
        label: fact.label,
        value: fact.value,
        ...(fact.provenance?.source ? { source: fact.provenance.source } : {}),
        ...(fact.provenance?.vintage
          ? { vintage: fact.provenance.vintage }
          : {}),
      })),
    });
  }
  return sections.length > 0 ? { sections } : undefined;
}

/**
 * Assemble the dossier export request from what the property already holds.
 * `brief` is the live R1 payload when the fetch succeeded; null when it did
 * not (sign-in / paywall / no snapshot) — verdict and brief are then honestly
 * omitted and the engine renders their absence.
 */
export function assembleDossierExportBody(input: {
  parcelNodeId: string;
  dossier: PropertyDossier | null;
  brief: ResearchBriefPayload | null;
  /** Active-parcel facts fallback (only when this parcel is the active one). */
  facts?: { address: string | null; countyName: string | null } | null;
}): DossierExportRequestBody {
  const body: DossierExportRequestBody = { parcelNodeId: input.parcelNodeId };

  const address = input.dossier?.address ?? input.facts?.address ?? null;
  if (address) body.address = address;
  if (input.facts?.countyName) body.countyName = input.facts.countyName;

  if (input.brief) {
    body.verdictLine = composeBriefVerdict(input.brief).line;
    const flattened = flattenBriefForDossier(input.brief);
    if (flattened) body.brief = flattened;
  }

  const chatSummary = input.dossier?.chatSummary ?? null;
  if (chatSummary) {
    body.chatSummary = {
      summary: chatSummary.summary,
      savedAt: chatSummary.savedAt,
      ...(chatSummary.disclaimer ? { disclaimer: chatSummary.disclaimer } : {}),
    };
  }

  const notes = input.dossier?.notes ?? null;
  if (notes && notes.trim()) body.notes = notes;

  return body;
}

// ---------------------------------------------------------------------------
// BFF request + download.
// ---------------------------------------------------------------------------

export interface DossierExportResult {
  ok: true;
  parcelNodeId: string;
  downloadUrl: string;
  inlineDownload?: { base64: string; contentType: string };
  pageCount?: number;
  dossierPageCount?: number;
  sitePlanAppended?: boolean;
  sitePlanUnavailableReason?: string;
}

export type DossierExportClientResult =
  | DossierExportResult
  | { ok: false; status: number; error: string; message?: string };

export async function requestDossierExport(
  body: DossierExportRequestBody,
  fetchImpl: typeof fetch = fetch,
): Promise<DossierExportClientResult> {
  try {
    const res = await fetchImpl("/api/pe-site-plan-export?kind=dossier", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    } & Partial<DossierExportResult>;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: payload.error ?? "request_failed",
        message: payload.message,
      };
    }
    if (!payload.ok || !payload.downloadUrl || !payload.parcelNodeId) {
      return {
        ok: false,
        status: 502,
        error: "invalid_response",
        message: "Dossier export response missing download payload.",
      };
    }
    return payload as DossierExportResult;
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: "network_error",
      message: (err as Error).message,
    };
  }
}

/** Honest per-outcome notice line for the detail view. */
export function dossierExportNotice(result: DossierExportClientResult): string {
  if (result.ok) {
    const pages = result.pageCount ? ` (${result.pageCount} pages)` : "";
    const sitePlanNote =
      result.sitePlanAppended === false
        ? ` Site-plan sheets were not appended${
            result.sitePlanUnavailableReason
              ? ` — ${result.sitePlanUnavailableReason}`
              : ""
          }.`
        : "";
    return `X-ray PDF ready${pages}.${sitePlanNote}`;
  }
  if (result.status === 402) {
    return "Unlock this property (or Pro) to export its X-ray PDF.";
  }
  if (result.status === 401) {
    return "Sign in to export the property X-ray.";
  }
  return result.message ?? "X-ray export failed — try again.";
}
