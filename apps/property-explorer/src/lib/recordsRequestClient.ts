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
  RecordsInstrumentRow,
  RecordsInstrumentType,
  RecordsTypeFilter,
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

type WireIndexHit = {
  recordingRef?: string | null;
  documentType?: string | null;
  recordingDate?: string | null;
  parties?: string | null;
  detailUrl?: string | null;
};

const FILTER_LABELS: Record<RecordsInstrumentType, string> = {
  deed: "Deeds",
  lien: "Liens",
  easement: "Easements",
  plat: "Plats",
  restriction: "Restrictions",
  notice: "Notices",
  other: "Other",
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
      return "failed";
    case "needs-human":
      return "paused-fees";
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
  const instruments = instrumentsFromScope(scope);
  if (instruments.length > 0) return instruments.length;
  if (!scope || typeof scope !== "object") return 0;
  const rc = scope.resultCount;
  return typeof rc === "number" && rc >= 0 ? rc : 0;
}

function isPlausibleIndexHit(hit: WireIndexHit): boolean {
  const ref = hit.recordingRef?.trim();
  return !!ref && /[\d-]{5,}/.test(ref) && /\d/.test(ref);
}

export function documentTypeToInstrumentType(
  documentType: string | null | undefined,
): RecordsInstrumentType {
  if (!documentType?.trim()) return "other";
  const u = documentType.toUpperCase();
  if (u.includes("DEED")) return "deed";
  if (u.includes("LIEN") || u.includes("MORTGAGE")) return "lien";
  if (u.includes("EASEMENT")) return "easement";
  if (u.includes("PLAT") || u.includes("MAP")) return "plat";
  if (u.includes("RESTRICT") || u.includes("COVENANT")) return "restriction";
  if (u.includes("NOTICE") || u.includes("LIS PEND")) return "notice";
  return "other";
}

export function instrumentsFromScope(
  scope: Record<string, unknown> | null | undefined,
): RecordsInstrumentRow[] {
  if (!scope || typeof scope !== "object") return [];
  const rawHits = scope.indexHits;
  if (!Array.isArray(rawHits)) return [];

  const rows: RecordsInstrumentRow[] = [];
  for (let i = 0; i < rawHits.length; i++) {
    const raw = rawHits[i];
    if (!raw || typeof raw !== "object") continue;
    const hit = raw as WireIndexHit;
    if (!isPlausibleIndexHit(hit)) continue;

    const ref = hit.recordingRef!.trim();
    rows.push({
      id: `index-hit-${i}-${ref}`,
      type: documentTypeToInstrumentType(hit.documentType),
      label: hit.documentType?.trim() || "Recorded instrument",
      instrumentNumber: ref,
      recordedAt: hit.recordingDate?.trim() || "—",
      partiesLine: hit.parties?.trim() || "Parties not extracted yet",
      readDepth: "not-acquired",
      acquisitionNote: "Index hit — image not acquired yet",
    });
  }
  return rows;
}

export function filtersFromInstruments(
  instruments: RecordsInstrumentRow[],
): RecordsTypeFilter[] {
  const counts = new Map<RecordsInstrumentType, number>();
  for (const row of instruments) {
    counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
  }
  const filters: RecordsTypeFilter[] = [
    { type: "all", label: "All", count: instruments.length },
  ];
  for (const type of [
    "deed",
    "easement",
    "lien",
    "plat",
    "restriction",
    "notice",
    "other",
  ] as const) {
    const count = counts.get(type) ?? 0;
    if (count > 0) {
      filters.push({ type, label: FILTER_LABELS[type], count });
    }
  }
  return filters;
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
  const instruments = instrumentsFromScope(scope);
  return {
    phase: phaseFromJobStatus(typeof status === "string" ? status : undefined),
    parcelNodeId,
    searchedAt: formatSearchedAt(job.completedAt ?? job.createdAt),
    instrumentCount:
      instruments.length > 0 ? instruments.length : instrumentCount,
    filters: filtersFromInstruments(instruments),
    instruments,
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
