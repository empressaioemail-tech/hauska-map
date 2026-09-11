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

// ---------------------------------------------------------------------------
// P-155 (OPS-23 FEASIBILITY, 2026-09-11): refresh returns 202 with a job
// reference instead of the composed report — the engine's own authoring
// takes 85-154s for Travis parcels (F7), well past the old
// FEASIBILITY_ENGINE_TIMEOUT_MS=55_000 both this BFF leg and the engine
// itself used to hold a socket open for. `requestFeasibilityExport` now
// polls the status leg internally so this function's own CONTRACT (one
// awaited call, resolving to the same FeasibilityExportClientResult shape)
// is unchanged for ReportsTool.tsx — `busy` stays true for the whole wait,
// which is exactly the "show a running state, never a failure, while the
// job runs" requirement.
// ---------------------------------------------------------------------------

/** Ceiling on how long the browser keeps polling before giving up and
 * telling the customer to check back — NOT a claim that the job failed.
 * ~2x the observed 154s Travis max, so a real completion is very unlikely
 * to be cut off; chosen as a client-side UX bound, independent of the
 * engine's own 10-minute stall-detection ceiling. */
const FEASIBILITY_POLL_CLIENT_CAP_MS = 5 * 60_000;
const FEASIBILITY_POLL_MIN_INTERVAL_MS = 3_000;
const FEASIBILITY_POLL_MAX_INTERVAL_MS = 10_000;

function buildFeasibilityStatusPath(parcelNodeId: string): string {
  const qs = new URLSearchParams({
    parcelNodeId,
    kind: "feasibility",
    action: "status",
  });
  return `/api/pe-site-plan-export?${qs.toString()}`;
}

function clampPollInterval(pollAfterMs: unknown): number {
  const ms = typeof pollAfterMs === "number" && Number.isFinite(pollAfterMs) ? pollAfterMs : FEASIBILITY_POLL_MIN_INTERVAL_MS;
  return Math.min(FEASIBILITY_POLL_MAX_INTERVAL_MS, Math.max(FEASIBILITY_POLL_MIN_INTERVAL_MS, ms));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FeasibilityStatusPayload = {
  state?: string;
  downloadUrl?: string;
  errorMessage?: string;
  pollAfterMs?: number;
} & Partial<FeasibilityExportResult>;

/** Polls the status leg until the job settles or the client cap is hit.
 * Never returns a `failed` result for a job that is merely slow — the
 * cap's own outcome is `still_processing`, distinct from `feasibility_export_failed`. */
async function pollFeasibilityStatus(
  parcelNodeId: string,
  fetchImpl: typeof fetch,
  deadlineAt: number,
): Promise<FeasibilityExportClientResult> {
  while (Date.now() < deadlineAt) {
    let res: Response;
    try {
      res = await fetchImpl(buildFeasibilityStatusPath(parcelNodeId), {
        credentials: "include",
      });
    } catch (err) {
      return { ok: false, status: 0, error: "network_error", message: (err as Error).message };
    }
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    } & FeasibilityStatusPayload;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: payload.error ?? "request_failed",
        message: payload.message,
      };
    }
    if (payload.state === "ready") {
      if (!payload.downloadUrl) {
        return {
          ok: false,
          status: 502,
          error: "invalid_response",
          message: "Feasibility Study status reported ready with no download link.",
        };
      }
      return {
        ok: true,
        parcelNodeId,
        downloadUrl: payload.downloadUrl,
        pageCount: payload.pageCount,
        feasibilityPageCount: payload.feasibilityPageCount,
        sitePlanAppended: payload.sitePlanAppended,
        sitePlanUnavailableReason: payload.sitePlanUnavailableReason,
        sectionCount: payload.sectionCount,
        openItemCount: payload.openItemCount,
        narrativeIsDeterministicSkeleton: payload.narrativeIsDeterministicSkeleton,
      };
    }
    if (payload.state === "failed") {
      return {
        ok: false,
        status: 422,
        error: "feasibility_export_failed",
        message: payload.errorMessage ?? "Feasibility study could not be produced for this parcel.",
      };
    }
    // queued | running | never-requested (the last shouldn't appear right
    // after an accepted refresh, but is treated as "keep waiting" rather
    // than an error — the job row may not have propagated to this read
    // yet on a cold replica).
    await sleep(clampPollInterval(payload.pollAfterMs));
  }
  return {
    ok: false,
    status: 202,
    error: "still_processing",
    message:
      "Feasibility Study is taking longer than expected. It is still being generated — click Generate again in a minute to check.",
  };
}

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
    } & FeasibilityStatusPayload;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: payload.error ?? "request_failed",
        message: payload.message,
      };
    }
    if (payload.state !== "queued" && payload.state !== "running") {
      return {
        ok: false,
        status: 502,
        error: "invalid_response",
        message: "Feasibility Study refresh response missing a job state.",
      };
    }
    return pollFeasibilityStatus(body.parcelNodeId, fetchImpl, Date.now() + FEASIBILITY_POLL_CLIENT_CAP_MS);
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
              ? `: ${result.sitePlanUnavailableReason}`
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
      "Feasibility Study is a Studio deliverable. Upgrade to generate it."
    );
  }
  if (result.status === 422 || result.error === "feasibility_export_failed") {
    return (
      result.message ?? "Feasibility study could not be produced for this parcel."
    );
  }
  if (result.error === "still_processing") {
    // Never worded as a failure — the job is (as far as we know) still
    // running past our poll cap, not broken. P-155: this replaces the old
    // "this usually means a cold start" copy, which blamed a cold start
    // that never happened (F7).
    return (
      result.message ??
      "Feasibility Study is still being generated. Click Generate again in a minute to check."
    );
  }
  return result.message ?? "Feasibility Study export failed. Try again.";
}
