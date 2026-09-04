// FEASIBILITY STUDY export — client assembly + request (P32 wave 2).
//
// The "Generate" action for the Feasibility Study entry in the Reports
// dock. Unlike dossier-export.ts, the ENGINE composes the ENTIRE report
// (parcel/ownership, zoning envelope, flood, special districts, wells/
// pipelines, terrain, utilities, HOA shell, existing structures, an
// open-items table, a narrative, plus the appended site-plan sheet) from
// atoms it already holds for the parcel — this module only forwards what
// the active parcel's sealed fact sheet already carries (address, county,
// the live-view link), exactly the same fields the dossier-export refresh
// body sends today. There is no caller-supplied pipeline output (no
// verdict, no brief facts) to assemble or to refuse on absence — the hollow-
// export gate dossier-export.ts runs has no equivalent here.

import { liveViewHref } from "../../lib/live-view";

export interface FeasibilityExportRequestBody {
  parcelNodeId: string;
  address?: string;
  countyName?: string;
  liveViewUrl?: string;
}

/**
 * Assemble the feasibility refresh request from what the active parcel
 * already holds. Mirrors assembleDossierExportBody's address/countyName/
 * liveViewUrl assembly (dossier-export.ts) without the brief/verdict/notes
 * assembly that report needs and this one does not.
 */
export function assembleFeasibilityExportBody(input: {
  parcelNodeId: string;
  facts?: { address: string | null; countyName: string | null } | null;
}): FeasibilityExportRequestBody {
  const body: FeasibilityExportRequestBody = {
    parcelNodeId: input.parcelNodeId,
  };
  if (input.facts?.address) body.address = input.facts.address;
  if (input.facts?.countyName) body.countyName = input.facts.countyName;
  const liveViewUrl = liveViewHref({ parcelNodeId: input.parcelNodeId });
  if (liveViewUrl) body.liveViewUrl = liveViewUrl;
  return body;
}

// ---------------------------------------------------------------------------
// BFF request + download.
// ---------------------------------------------------------------------------

export interface FeasibilityExportResult {
  ok: true;
  parcelNodeId: string;
  downloadUrl: string;
  pageCount?: number;
  feasibilityPageCount?: number;
  sitePlanAppended?: boolean;
  sitePlanUnavailableReason?: string;
  sectionCount?: number;
  openItemCount?: number;
  narrativeIsDeterministicSkeleton?: boolean;
}

export type FeasibilityExportClientResult =
  | FeasibilityExportResult
  | { ok: false; status: number; error: string; message?: string };

export async function requestFeasibilityExport(
  body: FeasibilityExportRequestBody,
  fetchImpl: typeof fetch = fetch,
): Promise<FeasibilityExportClientResult> {
  try {
    const res = await fetchImpl("/api/pe-site-plan-export?kind=feasibility", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    } & Partial<FeasibilityExportResult>;
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
        message: "Feasibility Study response missing download payload.",
      };
    }
    return payload as FeasibilityExportResult;
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: "network_error",
      message: (err as Error).message,
    };
  }
}

/** Honest per-outcome notice line for the dock. */
export function feasibilityExportNotice(
  result: FeasibilityExportClientResult,
): string {
  if (result.ok) {
    const pages = result.pageCount ? ` (${result.pageCount} pages)` : "";
    const sitePlanNote =
      result.sitePlanAppended === false
        ? ` Site-plan sheet was not appended${
            result.sitePlanUnavailableReason
              ? ` — ${result.sitePlanUnavailableReason}`
              : ""
          }.`
        : "";
    return `Feasibility Study PDF ready${pages}.${sitePlanNote}`;
  }
  if (result.status === 401) {
    return "Sign in to generate the feasibility study.";
  }
  if (result.status === 402) {
    return (
      result.message ??
      "Feasibility Study is a Studio deliverable — upgrade to generate it."
    );
  }
  if (result.status === 422 || result.error === "feasibility_export_failed") {
    return (
      result.message ?? "Feasibility study could not be produced for this parcel."
    );
  }
  return result.message ?? "Feasibility Study export failed — try again.";
}
