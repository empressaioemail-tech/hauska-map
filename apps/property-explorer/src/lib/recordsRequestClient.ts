/**
 * Records request client — P-85 item 12.
 *
 * Backend: cortex auth-gated routes through the DEEP proxy:
 *   GET  /api/spine-deep/api/property-explorer/v1/records-request?parcelNodeId=
 *   POST /api/spine-deep/api/property-explorer/v1/records-request
 */

import { CORTEX_DEEP_PROXY_BASE } from "./auth";
import type {
  RecordsRunFetchResult,
  RecordsRunPhase,
  RecordsRunView,
} from "../workbench/tools/records-request-types";

const RECORDS_PATH = "api/property-explorer/v1/records-request";

export const RECORDS_NOT_WIRED_NOTICE =
  "Records request API is not deployed yet — job routes are not live on this surface.";

export const RECORDS_NOT_REQUESTED_NOTICE =
  "No records request has been started for this parcel.";

type WireJob = {
  jobId?: string;
  jobStatus?: string;
  status?: string;
  createdAt?: string;
  completedAt?: string | null;
  liveInstantGis?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
  scopeSearched?: Record<string, unknown> | null;
};

type WireListBody = {
  jobs?: WireJob[];
  engagementId?: string | null;
  error?: string;
  message?: string;
};

function deepUrl(query?: string): string {
  const base = `${CORTEX_DEEP_PROXY_BASE}/${RECORDS_PATH}`;
  return query ? `${base}?${query}` : base;
}

function phaseFromJobStatus(status: string | undefined): RecordsRunPhase {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "awaiting-purchase-approval":
      return "paused-fees";
    case "failed":
    case "needs-human":
      return "failed";
    case "complete":
      return "complete";
    default:
      return "not-requested";
  }
}

function formatSearchedAt(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function instrumentCountFromScope(
  scope: Record<string, unknown> | null | undefined,
): number {
  if (!scope || typeof scope !== "object") return 0;
  const hits = scope.indexHits;
  if (Array.isArray(hits)) return hits.length;
  const rc = scope.resultCount;
  return typeof rc === "number" && rc >= 0 ? rc : 0;
}

function runFromLatestJob(
  parcelNodeId: string,
  job: WireJob | undefined,
): RecordsRunView | null {
  if (!job) return null;
  const status = job.jobStatus ?? job.status;
  const scope =
    job.scopeSearched && typeof job.scopeSearched === "object"
      ? job.scopeSearched
      : null;
  const instrumentCount = instrumentCountFromScope(scope);
  return {
    phase: phaseFromJobStatus(typeof status === "string" ? status : undefined),
    parcelNodeId,
    searchedAt: formatSearchedAt(job.completedAt ?? job.createdAt),
    instrumentCount,
    filters: [],
    instruments: [],
    verdicts: [],
    live: true,
    jobId: typeof job.jobId === "string" ? job.jobId : null,
    errorCode:
      typeof job.errorCode === "string" ? job.errorCode : null,
    errorMessage:
      typeof job.errorMessage === "string" ? job.errorMessage : null,
  };
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Fetch the latest run for a parcel. */
export async function fetchRecordsRun(
  parcelNodeId: string,
  _countyFips?: string,
): Promise<RecordsRunFetchResult> {
  const qs = new URLSearchParams({ parcelNodeId });
  try {
    const res = await fetch(deepUrl(qs.toString()), {
      credentials: "include",
    });
    if (res.status === 404) {
      return {
        wired: false,
        run: null,
        notice: RECORDS_NOT_WIRED_NOTICE,
      };
    }
    if (res.status === 401) {
      return {
        wired: true,
        run: null,
        notice: "Sign in to request county clerk records.",
      };
    }
    if (!res.ok) {
      const body = await parseJson(res);
      const message =
        typeof body.message === "string"
          ? body.message
          : typeof body.error === "string"
            ? body.error
            : `Records request read failed (${res.status}).`;
      return { wired: true, run: null, notice: message };
    }
    const body = (await res.json()) as WireListBody;
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];
    const latest = jobs[0];
    const run = runFromLatestJob(parcelNodeId, latest);
    if (!run) {
      return {
        wired: true,
        run: null,
        notice: RECORDS_NOT_REQUESTED_NOTICE,
      };
    }
    return { wired: true, run, notice: null };
  } catch {
    return {
      wired: false,
      run: null,
      notice: RECORDS_NOT_WIRED_NOTICE,
    };
  }
}

/** Start a new clerk-index search. */
export async function requestRecordsRun(
  parcelNodeId: string,
  countyFips?: string,
): Promise<RecordsRunFetchResult> {
  try {
    const res = await fetch(deepUrl(), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parcelNodeId,
        ...(countyFips ? { countyFips } : {}),
      }),
    });
    if (res.status === 404) {
      return {
        wired: false,
        run: null,
        notice: RECORDS_NOT_WIRED_NOTICE,
      };
    }
    if (res.status === 401) {
      return {
        wired: true,
        run: null,
        notice: "Sign in to request county clerk records.",
      };
    }
    const body = await parseJson(res);
    if (!res.ok) {
      const message =
        typeof body.message === "string"
          ? body.message
          : typeof body.error === "string"
            ? body.error
            : `Records request failed (${res.status}).`;
      return { wired: true, run: null, notice: message };
    }
    const jobStatus =
      typeof body.jobStatus === "string"
        ? body.jobStatus
        : typeof body.status === "string"
          ? body.status === "in-progress"
            ? "running"
            : body.status === "accepted"
              ? "queued"
              : body.status
          : "queued";
    const run: RecordsRunView = {
      phase: phaseFromJobStatus(jobStatus),
      parcelNodeId,
      searchedAt: formatSearchedAt(new Date().toISOString()),
      instrumentCount: 0,
      filters: [],
      instruments: [],
      verdicts: [],
      live: true,
      jobId: typeof body.jobId === "string" ? body.jobId : null,
    };
    return { wired: true, run, notice: null };
  } catch {
    return {
      wired: false,
      run: null,
      notice: RECORDS_NOT_WIRED_NOTICE,
    };
  }
}
